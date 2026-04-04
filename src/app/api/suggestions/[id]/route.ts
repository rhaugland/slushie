import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, parentId } = body;

  if (!["accepted", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "status must be accepted or dismissed" }, { status: 400 });
  }

  if (status === "dismissed") {
    const suggestion = await prisma.meetingSuggestion.update({
      where: { id },
      data: { status: "dismissed" },
    });
    return NextResponse.json(suggestion);
  }

  const suggestion = await prisma.meetingSuggestion.findUniqueOrThrow({
    where: { id },
    include: { meeting: true },
  });

  const count = await prisma.feature.count({
    where: { projectId: suggestion.meeting.projectId, parentId: parentId || null },
  });

  const isMajor = !parentId;
  const feature = await prisma.feature.create({
    data: {
      projectId: suggestion.meeting.projectId,
      parentId: parentId || null,
      title: suggestion.suggestedTitle,
      description: suggestion.suggestedDescription,
      sortOrder: count,
      enabled: isMajor ? true : false,
    },
  });

  await prisma.meetingSuggestion.update({
    where: { id },
    data: { status: "accepted", featureId: feature.id },
  });

  return NextResponse.json({ suggestion, feature });
}
