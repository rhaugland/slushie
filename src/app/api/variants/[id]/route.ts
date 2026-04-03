import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import path from "path";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { label } = await req.json();

  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  const variant = await prisma.variant.update({
    where: { id },
    data: { label: label.trim() },
  });

  return NextResponse.json(variant);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const variant = await prisma.variant.findUnique({
    where: { id },
    include: { feature: { include: { project: true } } },
  });

  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  if (variant.isMain) {
    // If deleting the promoted variant, revert main to its pre-merge state
    // by checking out the previous main commit
    const slug = variant.feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const projectDir = path.join(process.cwd(), "previews", slug);
    try {
      // Revert the merge commit that promoted this variant
      execSync("git checkout main", { cwd: projectDir, encoding: "utf-8" });
      // Try reverting the last merge; if it fails, that's ok
      execSync("git revert --no-edit HEAD", { cwd: projectDir, encoding: "utf-8" });
    } catch { /* best-effort revert */ }

    const others = await prisma.variant.findMany({
      where: { featureId: variant.featureId, id: { not: id } },
      orderBy: { createdAt: "desc" },
    });

    if (others.length > 0) {
      await prisma.variant.update({
        where: { id: others[0].id },
        data: { isMain: true },
      });
    }
  }

  // Clean up git branch
  const slug = variant.feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const projectDir = path.join(process.cwd(), "previews", slug);
  try {
    execSync(`git branch -D variant-${id}`, { cwd: projectDir, encoding: "utf-8" });
  } catch { /* branch may not exist */ }

  await prisma.variant.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
