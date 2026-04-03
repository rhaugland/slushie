import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userPrompt = body.prompt || "";

  const feature = await prisma.feature.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  if (!feature.parentId) {
    return NextResponse.json({ error: "Only minor features can be built with OG mode" }, { status: 400 });
  }

  if (feature.status === "building") {
    return NextResponse.json({ error: "Already building" }, { status: 409 });
  }

  // Mark as building immediately so UI shows status
  await prisma.feature.update({
    where: { id },
    data: { status: "building" },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feature/build-claude-code",
    data: { featureId: id, projectId: feature.projectId, mode: "og", userPrompt },
  });

  logActivity({
    workspaceId: feature.project.workspaceId,
    projectId: feature.projectId,
    action: "build_started",
    category: "build",
    description: `Build started for "${feature.title}"`,
    metadata: { featureId: id, featureTitle: feature.title },
  });

  return NextResponse.json({ status: "building" }, { status: 201 });
}
