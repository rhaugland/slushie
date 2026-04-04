import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import { findPreviewDir } from "@/lib/preview-dir";

export async function POST(
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

  if (variant.status !== "live") {
    return NextResponse.json({ error: "Can only promote live variants" }, { status: 400 });
  }

  // Merge the variant's git branch into main so the preview server shows it
  const projectDir = findPreviewDir(variant.feature.project);
  const branchName = `variant-${id}`;

  try {
    execSync(`git checkout main`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
    // Tag current main so we can restore original later
    try { execSync(`git tag -d pre-promote`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" }); } catch { /* tag may not exist */ }
    execSync(`git tag pre-promote`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
    // Overwrite all files on main with the variant's versions
    execSync(`git checkout ${branchName} -- .`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
    // Commit the changes (if any differ from current main)
    const status = execSync(`git status --porcelain`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" }).trim();
    if (status) {
      execSync(`git add -A`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
      execSync(`git commit -m "promote: ${branchName}"`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to promote variant", detail: e.message }, { status: 500 });
  }

  // Transaction: unset all siblings, set this one
  await prisma.$transaction([
    prisma.variant.updateMany({
      where: { featureId: variant.featureId },
      data: { isMain: false },
    }),
    prisma.variant.update({
      where: { id },
      data: { isMain: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
