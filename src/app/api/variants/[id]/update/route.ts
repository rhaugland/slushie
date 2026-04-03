import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST: Trigger a rebuild of an existing variant with a new prompt.
 * Keeps the same variant and branch — Claude Code modifies the existing code.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userPrompt = body.prompt || "";

  if (!userPrompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const variant = await prisma.variant.findUnique({
    where: { id },
    include: { feature: true },
  });

  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  if (variant.status === "building") {
    return NextResponse.json({ error: "Variant is already building" }, { status: 409 });
  }

  // Set variant back to building
  await prisma.variant.update({
    where: { id },
    data: { status: "building" },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feature/build-claude-code",
    data: {
      featureId: variant.featureId,
      projectId: variant.feature.projectId,
      variantId: id,
      mode: "variant-update",
      userPrompt,
    },
  });

  return NextResponse.json({ ok: true, variantId: id });
}
