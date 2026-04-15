import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { callClaude } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { getBranches, getBranchFiles, ENV_BRANCHES } from "@/lib/github";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const body = await req.json();
  const { mode, prompt: userPrompt, noteIds, githubUrl } = body;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let buildDescription = "";

  // Gather context based on mode
  if (mode === "scratch") {
    if (!userPrompt?.trim()) {
      return NextResponse.json({ error: "Please describe what you want to build" }, { status: 400 });
    }
    buildDescription = userPrompt.trim();
  } else if (mode === "notes") {
    if (!noteIds?.length) {
      return NextResponse.json({ error: "Select at least one note" }, { status: 400 });
    }
    const meetings = await prisma.meeting.findMany({
      where: { id: { in: noteIds } },
      select: { summary: true, textContent: true, transcript: true },
    });
    const noteContent = meetings
      .map((m) => m.summary || m.textContent || m.transcript || "")
      .filter(Boolean)
      .join("\n\n---\n\n");
    buildDescription = `Build based on these project notes:\n\n${noteContent}`;
  } else if (mode === "github") {
    if (!githubUrl?.trim()) {
      return NextResponse.json({ error: "GitHub URL required" }, { status: 400 });
    }
    // Parse owner/repo from URL
    const match = githubUrl.trim().match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }
    const repo = match[1].replace(/\.git$/, "");

    // Save the repo connection
    await prisma.project.update({
      where: { id: projectId },
      data: { githubRepo: repo },
    });

    // Try to pull branches and files using user's token
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { githubToken: true } });
    if (!dbUser?.githubToken) {
      return NextResponse.json({ error: "Set your GitHub token in settings first" }, { status: 400 });
    }

    let repoFiles: string[] = [];
    try {
      const branches = await getBranches(dbUser.githubToken, repo);
      const mainBranch = branches.find((b) => b.name === "main" || b.name === "master");
      if (mainBranch) {
        const files = await getBranchFiles(dbUser.githubToken, repo, mainBranch.name, mainBranch.name);
        repoFiles = files.map((f) => f.path);
      }
    } catch {
      // Continue with just the repo name
    }

    buildDescription = `Build based on the GitHub repository: ${repo}\nFiles in repo: ${repoFiles.slice(0, 30).join(", ")}${repoFiles.length > 30 ? ` ... and ${repoFiles.length - 30} more` : ""}`;
  } else if (mode === "upload") {
    // Upload mode is handled client-side - files already uploaded, we get a description
    buildDescription = userPrompt?.trim() || "Build based on uploaded codebase";
  } else {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  // Use Claude to plan major features from the description
  const planResponse = await callClaude({
    systemPrompt: `You are a software architect planning a web application's feature structure.
Given a description of what to build, break it down into 2-5 major feature areas, each with 2-4 minor sub-features.

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "features": [
    {
      "title": "Major Feature Name",
      "description": "One sentence describing this area",
      "children": [
        { "title": "Minor Feature", "description": "What this builds", "route": "/suggested-route" }
      ]
    }
  ]
}

Keep titles short (2-4 words). Routes should be logical URL paths. Focus on buildable UI components.`,
    userMessage: `Project: "${project.name}" for client "${project.client?.name || "unknown"}"

${buildDescription}`,
    temperature: 0.2,
    maxTokens: 2048,
    projectId,
    action: "initial_build_plan",
  });

  let plan;
  try {
    const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
    plan = JSON.parse(jsonMatch?.[0] || planResponse.trim());
  } catch {
    return NextResponse.json({ error: "Failed to generate build plan" }, { status: 500 });
  }

  // Create features and trigger builds
  const created: { majorId: string; majorTitle: string; minors: { id: string; title: string }[] }[] = [];

  for (const major of plan.features || []) {
    const majorFeature = await prisma.feature.create({
      data: {
        projectId,
        title: major.title,
        description: major.description || "",
        enabled: true,
        status: "draft",
        sortOrder: created.length,
      },
    });

    const minors: { id: string; title: string }[] = [];

    for (const minor of major.children || []) {
      const minorFeature = await prisma.feature.create({
        data: {
          projectId,
          parentId: majorFeature.id,
          title: minor.title,
          description: minor.description || "",
          enabled: false,
          status: "building",
          route: minor.route || `/${minor.title.toLowerCase().replace(/\s+/g, "-")}`,
        },
      });

      // Trigger build for each minor feature
      try {
        const { inngest } = await import("@/inngest/client");
        await inngest.send({
          name: "feature/build-claude-code",
          data: {
            featureId: minorFeature.id,
            projectId,
            mode: "og",
            userPrompt: `${buildDescription}\n\nThis is the "${minor.title}" feature under "${major.title}": ${minor.description}`,
          },
        });
      } catch {
        // If inngest not available, mark as draft
        await prisma.feature.update({
          where: { id: minorFeature.id },
          data: { status: "draft" },
        });
      }

      minors.push({ id: minorFeature.id, title: minor.title });
    }

    created.push({ majorId: majorFeature.id, majorTitle: major.title, minors });
  }

  logActivity({
    workspaceId: project.workspaceId,
    projectId,
    userId: user.id,
    userName: user.name,
    action: "initial_build",
    category: "build",
    description: `Initial build started (${mode}): ${created.length} major features, ${created.reduce((s, c) => s + c.minors.length, 0)} sub-features`,
  });

  return NextResponse.json({ created, mode }, { status: 201 });
}
