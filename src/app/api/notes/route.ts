import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!clientId && !projectId) {
    return NextResponse.json({ error: "clientId or projectId required" }, { status: 400 });
  }

  const where: Record<string, unknown> = {};
  if (projectId) {
    where.projectId = projectId;
  } else if (clientId) {
    where.OR = [{ clientId }, { project: { clientId } }];
  }

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      suggestions: true,
      project: { select: { id: true, name: true } },
      wishlistItems: { select: { id: true, status: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(meetings);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { clientId, projectId, type, audioUrl, textContent, imageUrl } = body;

  if (!clientId && !projectId) {
    return NextResponse.json({ error: "clientId or projectId required" }, { status: 400 });
  }

  let resolvedClientId = clientId;
  if (!resolvedClientId && projectId) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    resolvedClientId = project.clientId;
  }

  const noteType = type || "audio_upload";
  const initialStatus = noteType === "text_note" ? "extracting"
    : noteType === "handwritten" ? "extracting"
    : "uploading";

  const meeting = await prisma.meeting.create({
    data: {
      clientId: resolvedClientId,
      projectId: projectId || null,
      type: noteType,
      audioUrl: audioUrl || null,
      textContent: textContent || null,
      imageUrl: imageUrl || null,
      status: initialStatus,
      createdById: user.id,
      createdByName: user.name,
    },
  });

  if (noteType === "audio_upload") {
    await (await import("@/inngest/client")).inngest.send({
      name: "meeting/transcribe",
      data: { meetingId: meeting.id },
    });
  } else {
    await (await import("@/inngest/client")).inngest.send({
      name: "notes/process",
      data: { meetingId: meeting.id },
    });
  }

  return NextResponse.json(meeting, { status: 201 });
}
