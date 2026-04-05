import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const hasAccess = user.clientMemberships.some((cm) =>
    cm.projectAccess.some((pa) => pa.project.id === id)
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const meetings = await prisma.meeting.findMany({
    where: { projectId: id },
    include: {
      suggestions: {
        select: { id: true, suggestedTitle: true, suggestedDescription: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const notes = meetings.map((m) => ({
    id: m.id,
    type: m.type,
    textContent: m.textContent,
    transcript: m.transcript,
    status: m.status,
    createdAt: m.createdAt,
    suggestions: m.suggestions.map((s) => ({
      id: s.id,
      title: s.suggestedTitle,
      description: s.suggestedDescription,
      status: s.status,
    })),
  }));

  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text, type } = await req.json();

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const hasAccess = user.clientMemberships.some((cm) =>
    cm.projectAccess.some((pa) => pa.project.id === id)
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { id } });

  const meeting = await prisma.meeting.create({
    data: {
      clientId: project.clientId,
      projectId: id,
      type: type || "text_note",
      textContent: text.trim(),
      status: "extracting",
    },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "notes/process",
    data: { meetingId: meeting.id },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
