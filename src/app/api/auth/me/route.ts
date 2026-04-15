import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Don't expose the full token — just whether one is set
  const { githubToken, ...rest } = user;
  return NextResponse.json({
    ...rest,
    hasGithubToken: !!githubToken,
    githubTokenPreview: githubToken ? `${githubToken.slice(0, 8)}...${githubToken.slice(-4)}` : null,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { githubToken } = await req.json();

  // Basic validation — GitHub PATs start with ghp_ or github_pat_
  if (githubToken && !githubToken.startsWith("ghp_") && !githubToken.startsWith("github_pat_")) {
    return NextResponse.json({ error: "Invalid GitHub token format. Expected a Personal Access Token (ghp_... or github_pat_...)" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { githubToken: githubToken || null },
  });

  return NextResponse.json({
    hasGithubToken: !!githubToken,
    githubTokenPreview: githubToken ? `${githubToken.slice(0, 8)}...${githubToken.slice(-4)}` : null,
  });
}
