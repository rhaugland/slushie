import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const feature = await prisma.feature.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  if (feature.parentId) {
    return NextResponse.json(
      { error: "Minor features are build instructions — build the parent feature instead" },
      { status: 400 }
    );
  }

  if (feature.status === "building") {
    return NextResponse.json({ error: "Already building" }, { status: 409 });
  }

  const build = await prisma.featureBuild.create({
    data: {
      featureId: id,
      generatedCode: {},
      status: "queued",
    },
  });

  await prisma.feature.update({
    where: { id },
    data: { status: "building" },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feature/build",
    data: { buildId: build.id, featureId: id, projectId: feature.projectId },
  });

  return NextResponse.json(build, { status: 201 });
}
