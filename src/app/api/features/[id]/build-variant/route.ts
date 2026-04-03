import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userPrompt = body.prompt || "";

  const feature = await prisma.feature.findUnique({
    where: { id },
    include: { variants: true, project: { select: { workspaceId: true } } },
  });

  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  if (!feature.parentId) {
    return NextResponse.json({ error: "Only minor features can have variants" }, { status: 400 });
  }

  // Check no other build in progress for this feature
  const buildingVariant = feature.variants.find((v) => v.status === "building");
  if (buildingVariant || feature.status === "building") {
    return NextResponse.json({ error: "A build is already in progress" }, { status: 409 });
  }

  const variant = await prisma.variant.create({
    data: {
      featureId: id,
      label: `Variant ${feature.variants.length + 1}`,
      isMain: false,
      status: "building",
    },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feature/build-claude-code",
    data: {
      featureId: id,
      projectId: feature.projectId,
      variantId: variant.id,
      mode: "variant",
      userPrompt,
    },
  });

  logActivity({
    workspaceId: feature.project.workspaceId,
    projectId: feature.projectId,
    action: "variant_created",
    category: "variant",
    description: `Variant created for "${feature.title}"`,
    metadata: { featureId: id, featureTitle: feature.title, variantId: variant.id },
  });

  return NextResponse.json(variant, { status: 201 });
}
