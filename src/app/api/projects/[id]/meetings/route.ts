import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meetings = await prisma.meeting.findMany({
    where: { projectId: id },
    include: { suggestions: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(meetings);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { audioUrl } = body;

  if (!audioUrl) {
    return NextResponse.json({ error: "audioUrl required" }, { status: 400 });
  }

  const meeting = await prisma.meeting.create({
    data: { projectId: id, audioUrl },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "meeting/transcribe",
    data: { meetingId: meeting.id },
  });

  return NextResponse.json(meeting, { status: 201 });
}
