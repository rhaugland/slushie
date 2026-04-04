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

  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === id)) {
      clientMemberId = cm.id;
      break;
    }
  }

  if (!clientMemberId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const items = await prisma.feedbackItem.findMany({
    where: { projectId: id, clientMemberId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      title: true,
      description: true,
      priority: true,
      featureType: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text } = await req.json();

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === id)) {
      clientMemberId = cm.id;
      break;
    }
  }

  if (!clientMemberId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const feedbackItem = await prisma.feedbackItem.create({
    data: {
      projectId: id,
      clientMemberId,
      text: text.trim(),
      status: "pending",
    },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feedback/analyze",
    data: { feedbackItemId: feedbackItem.id },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
