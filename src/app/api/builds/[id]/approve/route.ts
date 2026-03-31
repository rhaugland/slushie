import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await prisma.build.update({
    where: { id },
    data: { deployStatus: "building" },
  });

  const build = await prisma.build.findUniqueOrThrow({
    where: { id },
    include: { objective: true },
  });

  await prisma.objective.update({
    where: { id: build.objectiveId },
    data: { status: "building" },
  });

  await inngest.send({
    name: "objective/build",
    data: { buildId: id },
  });

  return NextResponse.json({ status: "building" });
}
