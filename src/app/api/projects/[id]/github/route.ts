import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOctokit, getDeployments, getBranches, getOpenPRs, parseRepo } from "@/lib/github";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { githubToken: true } });
  if (!dbUser?.githubToken) {
    return NextResponse.json({ error: "No GitHub token configured" }, { status: 400 });
  }
  const token = dbUser.githubToken;

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project?.githubRepo) {
    return NextResponse.json({ error: "No GitHub repo connected" }, { status: 400 });
  }

  try {
    const [deployments, branches, prs] = await Promise.all([
      getDeployments(token, project.githubRepo).catch(() => []),
      getBranches(token, project.githubRepo).catch(() => []),
      getOpenPRs(token, project.githubRepo).catch(() => []),
    ]);

    const environments: Record<string, any> = {};
    for (const dep of deployments) {
      if (!environments[dep.environment]) {
        environments[dep.environment] = dep;
      }
    }

    return NextResponse.json({
      repo: project.githubRepo,
      defaultBranch: project.githubBranch || "dev",
      environments,
      branches,
      prs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — connect/update GitHub repo settings
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { githubRepo, githubBranch } = await req.json();

  // Validate repo format if provided
  if (githubRepo && !/^[^/]+\/[^/]+$/.test(githubRepo)) {
    return NextResponse.json({ error: "Invalid repo format. Use 'org/repo'" }, { status: 400 });
  }

  // Verify repo exists if connecting
  if (githubRepo) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { githubToken: true } });
    if (!dbUser?.githubToken) {
      return NextResponse.json({ error: "Add your GitHub token in profile settings first" }, { status: 400 });
    }
    try {
      const octokit = getOctokit(dbUser.githubToken);
      const { owner, repo } = parseRepo(githubRepo);
      await octokit.rest.repos.get({ owner, repo });
    } catch {
      return NextResponse.json({ error: "Repository not found or not accessible with your token" }, { status: 404 });
    }
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(githubRepo !== undefined && { githubRepo }),
      ...(githubBranch !== undefined && { githubBranch }),
    },
  });

  return NextResponse.json({ githubRepo: project.githubRepo, githubBranch: project.githubBranch });
}
