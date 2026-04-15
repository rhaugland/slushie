import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENV_BRANCHES, getBranchFiles, downloadArchive } from "@/lib/github";
import { classifyBranch } from "@/lib/classify-branch";
import { createHmac } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

function previewDir(projectSlug: string): string {
  return path.join(process.cwd(), "previews", projectSlug);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "GITHUB_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(body, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(body);

  const repoFullName = payload.repository?.full_name; // "org/repo"
  if (!repoFullName) {
    return NextResponse.json({ received: true });
  }

  // Find the project linked to this repo
  const project = await prisma.project.findFirst({
    where: { githubRepo: repoFullName },
    include: { features: { select: { id: true, githubBranch: true } } },
  });

  if (!project) {
    return NextResponse.json({ received: true, message: "No project linked to this repo" });
  }

  // Get a GitHub token from any workspace member to make API calls
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId, userId: { not: null } },
    include: { user: { select: { githubToken: true } } },
  });
  const token = member?.user?.githubToken;

  const projectSlug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const baseBranch = project.githubBranch || "dev";

  try {
    if (event === "create" && payload.ref_type === "branch") {
      // New branch created
      const branch = payload.ref as string;

      if (ENV_BRANCHES.has(branch)) {
        return NextResponse.json({ received: true, skipped: "environment branch" });
      }

      // Check if we already track this branch
      const existing = project.features.find((f) => f.githubBranch === branch);
      if (existing) {
        return NextResponse.json({ received: true, skipped: "already tracked" });
      }

      // Get existing features for AI classification context
      const projectWithFeatures = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
          features: {
            select: {
              id: true,
              title: true,
              description: true,
              parentId: true,
              children: { select: { id: true, title: true } },
            },
          },
        },
      });

      const majorFeatures = (projectWithFeatures?.features ?? [])
        .filter((f) => !f.parentId)
        .map((f) => ({
          id: f.id,
          title: f.title,
          description: f.description,
          children: f.children || [],
        }));

      // Fetch changed files for classification
      let changedFilePaths: string[] = [];
      let files: { path: string; content: string }[] = [];

      if (token) {
        try {
          files = await getBranchFiles(token, repoFullName, branch, baseBranch);
          changedFilePaths = files.map((f) => f.path);
        } catch {
          // Classify based on branch name alone
        }
      }

      // AI classification
      const classification = await classifyBranch(
        branch,
        changedFilePaths,
        majorFeatures,
        project.id
      );

      // Create feature with AI-classified data
      const feature = await prisma.feature.create({
        data: {
          projectId: project.id,
          parentId: classification.parentFeatureId,
          title: classification.title,
          description: classification.description,
          enabled: false,
          status: "draft",
          githubBranch: branch,
          route: "/" + branch.replace(/^feature\//, "").replace(/[^a-z0-9]+/g, "-"),
        },
      });

      // Store code if we have files
      if (files.length > 0) {
        try {
          await prisma.featureBuild.create({
            data: {
              featureId: feature.id,
              generatedCode: { files },
              status: "complete",
              buildLogs: `Synced ${files.length} files from branch ${branch} (classified as ${classification.type}, confidence: ${classification.confidence})`,
            },
          });

          const featureDir = path.join(previewDir(projectSlug), "features", feature.id);
          for (const file of files) {
            const filePath = path.join(featureDir, file.path);
            await mkdir(path.dirname(filePath), { recursive: true });
            await writeFile(filePath, file.content, "utf-8");
          }

          await prisma.feature.update({
            where: { id: feature.id },
            data: { status: "live" },
          });
        } catch (err: any) {
          console.error("[github-webhook] Failed to pull branch files:", err.message);
        }
      }

      console.log(`[github-webhook] Created feature "${feature.title}" (${classification.type}, confidence: ${classification.confidence}) from branch ${branch}`);
      return NextResponse.json({ received: true, created: feature.id, classification: { type: classification.type, confidence: classification.confidence } });
    }

    if (event === "push") {
      const branch = (payload.ref as string).replace("refs/heads/", "");

      // Push to main → update client preview
      if (branch === "main" || branch === "master") {
        if (token) {
          try {
            // Download the repo archive and save it for deploy
            const archive = await downloadArchive(token, repoFullName, branch);
            const zipPath = path.join(process.cwd(), "public", `github-sync-${project.id}.zip`);
            await writeFile(zipPath, archive);

            // Trigger deploy via inngest event (if available) or update deploy status
            // For now, write the zip and mark for manual deploy
            console.log(`[github-webhook] Main branch updated for project ${project.name}. Archive saved to ${zipPath}`);

            // Try to trigger deploy via the deploy API
            // We'll use inngest if configured, otherwise just save the zip
            try {
              const { inngest } = await import("@/inngest/client");
              await inngest.send({
                name: "project/deploy-codebase",
                data: {
                  projectId: project.id,
                  fileUrl: `/github-sync-${project.id}.zip`,
                },
              });
              console.log(`[github-webhook] Triggered deploy for project ${project.name}`);
            } catch {
              console.log(`[github-webhook] Inngest not available, deploy zip saved for manual trigger`);
            }
          } catch (err: any) {
            console.error("[github-webhook] Failed to process main push:", err.message);
          }
        }

        return NextResponse.json({ received: true, action: "main-push-deploy" });
      }

      // Push to a feature branch → update the feature's code
      if (!ENV_BRANCHES.has(branch)) {
        const feature = project.features.find((f) => f.githubBranch === branch);
        if (feature && token) {
          try {
            const files = await getBranchFiles(token, repoFullName, branch, baseBranch);
            if (files.length > 0) {
              // Update the build
              await prisma.featureBuild.create({
                data: {
                  featureId: feature.id,
                  generatedCode: { files },
                  status: "complete",
                  buildLogs: `Updated from GitHub push: ${files.length} files from branch ${branch}`,
                },
              });

              // Write files to disk
              const featureDir = path.join(previewDir(projectSlug), "features", feature.id);
              for (const file of files) {
                const filePath = path.join(featureDir, file.path);
                await mkdir(path.dirname(filePath), { recursive: true });
                await writeFile(filePath, file.content, "utf-8");
              }

              if (feature.githubBranch) {
                await prisma.feature.update({
                  where: { id: feature.id },
                  data: { status: "live" },
                });
              }
            }
          } catch (err: any) {
            console.error(`[github-webhook] Failed to sync push for branch ${branch}:`, err.message);
          }
        }

        return NextResponse.json({ received: true, action: "branch-push-sync" });
      }
    }

    if (event === "delete" && payload.ref_type === "branch") {
      const branch = payload.ref as string;

      // Mark the feature as having an orphaned branch (don't delete it)
      const feature = project.features.find((f) => f.githubBranch === branch);
      if (feature) {
        await prisma.feature.update({
          where: { id: feature.id },
          data: {
            description: `Branch ${branch} was deleted on GitHub`,
            status: "draft",
          },
        });
        console.log(`[github-webhook] Branch ${branch} deleted, feature marked as draft`);
      }

      return NextResponse.json({ received: true, action: "branch-deleted" });
    }

    // Pull request events — update feature with PR info
    if (event === "pull_request") {
      const pr = payload.pull_request;
      const branch = pr.head.ref;
      const feature = project.features.find((f) => f.githubBranch === branch);

      if (feature) {
        await prisma.feature.update({
          where: { id: feature.id },
          data: {
            githubPrUrl: pr.html_url,
            githubPrNumber: pr.number,
          },
        });

        // If PR was merged, mark feature as complete/merged
        if (payload.action === "closed" && pr.merged) {
          await prisma.feature.update({
            where: { id: feature.id },
            data: {
              description: `Merged via PR #${pr.number}: ${pr.title}`,
              enabled: true,
            },
          });
          console.log(`[github-webhook] PR #${pr.number} merged, feature "${feature.id}" enabled`);
        }
      }

      return NextResponse.json({ received: true, action: "pr-update" });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[github-webhook] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
