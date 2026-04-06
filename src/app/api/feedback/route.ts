import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — authenticated, list feedback for a project
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const where: Record<string, unknown> = { projectId };
  if (status) where.status = status;

  const items = await prisma.feedbackItem.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

// POST — public, authenticated by project API key
export async function POST(req: NextRequest) {
  const { apiKey, text } = await req.json();

  if (!apiKey || !text) {
    return NextResponse.json({ error: "apiKey and text required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { apiKey },
  });

  if (!project) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const feedbackItem = await prisma.feedbackItem.create({
    data: {
      projectId: project.id,
      source: "client",
      text,
      status: "pending",
    },
  });

  // Trigger AI analysis
  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feedback/analyze",
    data: { feedbackItemId: feedbackItem.id },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
