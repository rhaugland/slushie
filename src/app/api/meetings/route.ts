import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const { clientId, audioUrl } = await req.json();

  if (!clientId || !audioUrl) {
    return NextResponse.json({ error: "clientId and audioUrl required" }, { status: 400 });
  }

  const meeting = await prisma.meeting.create({
    data: { clientId, audioUrl, status: "transcribing" },
  });

  await inngest.send({
    name: "meeting/transcribe",
    data: { meetingId: meeting.id },
  });

  return NextResponse.json(meeting, { status: 201 });
}
