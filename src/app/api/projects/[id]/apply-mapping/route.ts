import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type MappedSection = {
  id: string;
  name: string;
  description: string;
  category: "base" | "feature";
  route?: string;
  minorFeatures: { title: string; description: string; route?: string }[];
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await req.json();
  const { sections, fileUrl } = body as { sections: MappedSection[]; fileUrl?: string };

  if (!sections || !Array.isArray(sections)) {
    return NextResponse.json({ error: "sections array required" }, { status: 400 });
  }

  const featureSections = sections.filter((s) => s.category === "feature");
  const created: { id: string; title: string; minorCount: number }[] = [];

  for (let i = 0; i < featureSections.length; i++) {
    const section = featureSections[i];

    // Create the major feature (always enabled by default)
    const feature = await prisma.feature.create({
      data: {
        projectId,
        title: section.name,
        description: section.description,
        route: section.route || null,
        sortOrder: i,
        enabled: true,
      },
    });

    // Create minor features as build instructions
    for (let j = 0; j < section.minorFeatures.length; j++) {
      const minor = section.minorFeatures[j];
      await prisma.feature.create({
        data: {
          projectId,
          parentId: feature.id,
          title: minor.title,
          description: minor.description,
          route: minor.route || null,
          sortOrder: j,
          enabled: true,
        },
      });
    }

    created.push({
      id: feature.id,
      title: section.name,
      minorCount: section.minorFeatures.length,
    });
  }

  // Trigger deploy if a codebase file was uploaded
  if (fileUrl) {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "project/deploy-codebase",
      data: { projectId, fileUrl },
    });
  }

  return NextResponse.json({ created, deploying: !!fileUrl }, { status: 201 });
}
