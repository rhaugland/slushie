import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getBranches, getBranchFiles, ENV_BRANCHES } from "@/lib/github";
import { classifyBranch } from "@/lib/classify-branch";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

function previewDir(projectSlug: string): string {
  return path.join(process.cwd(), "previews", projectSlug);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { githubToken: true } });
  if (!dbUser?.githubToken) {
    return NextResponse.json({ error: "No GitHub token configured" }, { status: 400 });
  }
  const token = dbUser.githubToken;

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      features: {
        select: {
          id: true,
          githubBranch: true,
          title: true,
          description: true,
          parentId: true,
          children: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!project?.githubRepo) {
    return NextResponse.json({ error: "No GitHub repo connected" }, { status: 400 });
  }

  const githubRepo = project.githubRepo;
  const baseBranch = project.githubBranch || "dev";

  try {
    const branches = await getBranches(token, githubRepo);

    const existingBranches = new Set(
      project.features.filter((f) => f.githubBranch).map((f) => f.githubBranch!)
    );

    const created: { branch: string; title: string; type: string; parent?: string }[] = [];
    const skipped: string[] = [];

    const projectSlug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Get top-level features for classification context
    const majorFeatures = project.features
      .filter((f) => !f.parentId)
      .map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        children: f.children || [],
      }));

    for (const branch of branches) {
      if (ENV_BRANCHES.has(branch.name)) {
        skipped.push(branch.name);
        continue;
      }

      if (existingBranches.has(branch.name)) {
        skipped.push(branch.name);
        continue;
      }

      // Fetch changed files for classification
      let changedFilePaths: string[] = [];
      let files: { path: string; content: string }[] = [];

      try {
        files = await getBranchFiles(token, githubRepo, branch.name, baseBranch);
        changedFilePaths = files.map((f) => f.path);
      } catch {
        // If we can't get files, classify based on branch name alone
      }

      // AI classification
      const classification = await classifyBranch(
        branch.name,
        changedFilePaths,
        majorFeatures,
        id
      );

      const feature = await prisma.feature.create({
        data: {
          projectId: id,
          parentId: classification.parentFeatureId,
          title: classification.title,
          description: classification.description,
          enabled: false,
          status: "draft",
          githubBranch: branch.name,
          route: "/" + branch.name.replace(/^feature\//, "").replace(/[^a-z0-9]+/g, "-"),
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
              buildLogs: `Synced ${files.length} files from branch ${branch.name} (classified as ${classification.type}, confidence: ${classification.confidence})`,
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
        } catch {
          // Non-critical
        }
      }

      // Add to major features list so subsequent branches can reference this one
      if (classification.type === "major") {
        majorFeatures.push({
          id: feature.id,
          title: classification.title,
          description: classification.description,
          children: [],
        });
      } else {
        const parent = majorFeatures.find((f) => f.id === classification.parentFeatureId);
        if (parent) {
          parent.children.push({ id: feature.id, title: classification.title });
        }
      }

      const parentTitle = classification.parentFeatureId
        ? majorFeatures.find((f) => f.id === classification.parentFeatureId)?.title
        : undefined;

      created.push({
        branch: branch.name,
        title: classification.title,
        type: classification.type,
        parent: parentTitle,
      });
    }

    // Check for orphaned branches
    const remoteBranchNames = new Set(branches.map((b) => b.name));
    const orphaned: string[] = [];
    for (const feature of project.features) {
      if (feature.githubBranch && !remoteBranchNames.has(feature.githubBranch) && !ENV_BRANCHES.has(feature.githubBranch)) {
        orphaned.push(feature.githubBranch);
      }
    }

    return NextResponse.json({
      created,
      skipped,
      orphaned,
      total: branches.length,
    });
  } catch (err: any) {
    console.error("[github-sync]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
