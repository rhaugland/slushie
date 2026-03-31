import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id },
    include: { objectives: { include: { builds: true }, orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(meeting);
}
