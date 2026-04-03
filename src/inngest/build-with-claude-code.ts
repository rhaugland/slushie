import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", timeout: 15000, shell: "/bin/bash" }).trim();
}

/** Ensure preview dir has a git repo with a baseline commit on main. */
function ensureGit(projectDir: string): void {
  try {
    run("git rev-parse --git-dir", projectDir);
  } catch {
    run("git init", projectDir);
    run("git add -A", projectDir);
    run('git commit -m "baseline: initial project state" --allow-empty', projectDir);
  }
  // Make sure we're on main
  try {
    run("git checkout main", projectDir);
  } catch {
    // Rename current branch to main if needed
    run("git branch -M main", projectDir);
  }
}

/** Commit any uncommitted changes on the current branch. */
function commitCurrent(projectDir: string, message: string): void {
  try {
    const status = run("git status --porcelain", projectDir);
    if (status) {
      run("git add -A", projectDir);
      run(`git commit -m "${message}"`, projectDir);
    }
  } catch { /* no-op if nothing to commit */ }
}

function runClaudeCode(prompt: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number; tokensUsed: number; durationMs: number }> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    // Filter out env vars that make Claude Code think it's nested
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDECODE") && !k.startsWith("CLAUDE_CODE"))
    );
    const child = spawn("/usr/local/bin/claude", [
      "--print",
      "--output-format", "json",
      "-p", prompt,
      "--allowedTools", "Edit,Write,Read,Bash,Glob,Grep",
    ], {
      cwd,
      timeout: 600000, // 10 min
      stdio: ["ignore", "pipe", "pipe"],
      env: cleanEnv,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      const durationMs = Date.now() - startTime;
      let tokensUsed = 0;
      try {
        const parsed = JSON.parse(stdout);
        if (parsed?.usage?.total_tokens) {
          tokensUsed = parsed.usage.total_tokens;
        } else if (parsed?.usage?.input_tokens && parsed?.usage?.output_tokens) {
          tokensUsed = parsed.usage.input_tokens + parsed.usage.output_tokens;
        }
        // Extract the actual result text if JSON format
        if (parsed?.result) {
          stdout = parsed.result;
        }
      } catch { /* not JSON, keep raw stdout */ }
      resolve({ stdout, stderr, exitCode: code ?? 1, tokensUsed, durationMs });
    });

    child.on("error", (err) => {
      resolve({ stdout, stderr: stderr + "\n" + err.message, exitCode: 1, tokensUsed: 0, durationMs: Date.now() - startTime });
    });
  });
}

export const buildWithClaudeCode = inngest.createFunction(
  {
    id: "feature-build-claude-code",
    retries: 1,
    triggers: [{ event: "feature/build-claude-code" }],
  },
  async ({ event, step }) => {
    const { featureId, projectId, variantId, mode, userPrompt } = event.data as {
      featureId: string;
      projectId: string;
      variantId?: string;
      mode: "og" | "variant" | "variant-update";
      userPrompt?: string;
    };

    const context = await step.run("prepare-context", async () => {
      const feature = await prisma.feature.findUniqueOrThrow({
        where: { id: featureId },
        include: {
          parent: true,
          project: true,
        },
      });

      const slug = feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const projectDir = path.join(process.cwd(), "previews", slug);

      // Get sibling minor features for context
      const siblings = feature.parentId
        ? await prisma.feature.findMany({
            where: { parentId: feature.parentId, id: { not: featureId } },
            select: { title: true, description: true },
          })
        : [];

      return {
        featureTitle: feature.title,
        featureDescription: feature.description,
        parentTitle: feature.parent?.title || null,
        parentRoute: feature.parent?.route || null,
        featureRoute: feature.route,
        projectDir,
        projectName: feature.project.name,
        workspaceId: feature.project.workspaceId,
        siblings,
      };
    });

    // Set up git isolation for variant builds
    const branchName = variantId ? `variant-${variantId}` : null;

    // For variant builds, use a git worktree so main (the live preview) is never touched.
    // For OG builds, work directly in the project dir.
    const worktreeDir = branchName
      ? path.join(context.projectDir, ".worktrees", branchName)
      : null;

    const buildDir = await step.run("setup-git", async () => {
      // Ensure preview directory exists
      if (!fs.existsSync(context.projectDir)) {
        fs.mkdirSync(context.projectDir, { recursive: true });
      }
      ensureGit(context.projectDir);
      commitCurrent(context.projectDir, "auto: save current state");

      if (branchName && worktreeDir) {
        // Ensure the branch exists
        if (mode === "variant") {
          // New variant — create branch from main if it doesn't exist
          try { run(`git branch -D ${branchName}`, context.projectDir); } catch { /* ok */ }
          run(`git branch ${branchName}`, context.projectDir);
        }
        // For variant-update, branch already exists

        // Clean up any stale worktree state
        try { run("git worktree prune", context.projectDir); } catch { /* ok */ }
        try { run(`git worktree remove --force "${worktreeDir}"`, context.projectDir); } catch { /* ok */ }
        try { fs.rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* ok */ }

        // Create worktree — main stays checked out, variant branch in separate dir
        run(`git worktree add "${worktreeDir}" ${branchName}`, context.projectDir);
        return worktreeDir;
      }

      // OG build — work directly in project dir
      return context.projectDir;
    });

    const result = await step.run("run-claude-code", async () => {
      // Update status to building
      if (mode === "og") {
        await prisma.feature.update({
          where: { id: featureId },
          data: { status: "building" },
        });
      } else if (variantId && (mode === "variant" || mode === "variant-update")) {
        await prisma.variant.update({
          where: { id: variantId },
          data: { status: "building" },
        });
      }

      const siblingContext = context.siblings.length > 0
        ? `\n\nOther features in this section: ${context.siblings.map(s => `"${s.title}" — ${s.description}`).join("; ")}`
        : "";

      const userInstructions = userPrompt?.trim()
        ? `\n\nUser instructions:\n${userPrompt.trim()}`
        : "";

      const basePrompt = `You are building a feature for a Next.js web application called "${context.projectName}".

Feature: "${context.featureTitle}"
Description: ${context.featureDescription}
${context.parentTitle ? `Parent section: "${context.parentTitle}"` : ""}
${context.featureRoute ? `Route: ${context.featureRoute}` : ""}
${context.parentRoute ? `Parent route: ${context.parentRoute}` : ""}${siblingContext}

Look at the existing codebase structure first, then implement this feature.
- Read the existing layout, components, and styles to match the app's design language
- Create or modify page components and any supporting components needed
- Use the existing Tailwind CSS classes and design patterns from the codebase
- Make sure the feature is accessible at its route
- Do NOT modify the auth system or prisma configuration${userInstructions}`;

      let prompt: string;
      if (mode === "variant") {
        prompt = `${basePrompt}\n\nIMPORTANT: This is a VARIANT build. Create an alternative implementation of this feature. Use a different layout, styling approach, or UX pattern than what currently exists. Be creative but keep the same functionality. Make it visually distinct so the user can compare approaches.`;
      } else if (mode === "variant-update") {
        prompt = `${basePrompt}\n\nIMPORTANT: This is an UPDATE to an existing variant. The code already exists — modify it based on the user's instructions above. Do NOT start from scratch. Read the existing implementation first, then make the requested changes.`;
      } else {
        prompt = `${basePrompt}\n\nRebuild or improve the existing implementation of this feature. Fix any issues and ensure it works correctly.`;
      }

      // Run Claude Code in the build dir (worktree for variants, project dir for OG)
      return runClaudeCode(prompt, buildDir);
    });

    // Finalize: commit changes, clean up worktree
    if (branchName && worktreeDir) {
      await step.run("finalize-branch", async () => {
        commitCurrent(worktreeDir, `variant: ${variantId} build`);
        // Clean up the worktree — changes are committed on the branch
        try { run(`git worktree remove --force "${worktreeDir}"`, context.projectDir); } catch { /* ok */ }
        try { fs.rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* ok */ }
        try { run("git worktree prune", context.projectDir); } catch { /* ok */ }
        // Safety: ensure main repo stays on main
        try { run("git checkout main", context.projectDir); } catch { /* ok */ }
      });
    } else {
      await step.run("commit-og", async () => {
        commitCurrent(context.projectDir, `og: rebuild feature ${featureId}`);
      });
    }

    await step.run("update-status", async () => {
      const success = result.exitCode === 0;
      const logs = result.stdout.slice(-5000) + (result.stderr ? "\n---STDERR---\n" + result.stderr.slice(-2000) : "");

      if (mode === "og") {
        await prisma.feature.update({
          where: { id: featureId },
          data: {
            status: success ? "live" : "error",
          },
        });
        // Store build log in latest FeatureBuild
        await prisma.featureBuild.create({
          data: {
            featureId,
            generatedCode: {},
            status: success ? "complete" : "failed",
            buildLogs: logs,
            tokensUsed: result.tokensUsed || 0,
            durationMs: result.durationMs || 0,
          },
        });
      } else if (variantId) {
        await prisma.variant.update({
          where: { id: variantId },
          data: {
            status: success ? "live" : "error",
            buildLogs: logs,
            buildOutput: result.stdout.slice(-10000),
          },
        });
      }

      logActivity({
        workspaceId: context.workspaceId,
        projectId,
        userId: undefined,
        userName: "Claude Code",
        action: success ? "build_completed" : "build_failed",
        category: "build",
        description: `Build ${success ? "completed" : "failed"} for "${context.featureTitle}"`,
        metadata: { featureId: featureId, tokensUsed: result.tokensUsed, durationMs: result.durationMs },
      });
    });

    return { featureId, variantId, mode, exitCode: result.exitCode };
  }
);
