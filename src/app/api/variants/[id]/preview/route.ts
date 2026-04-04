import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import { findPreviewDir } from "@/lib/preview-dir";

/**
 * POST: checkout this variant's branch so the preview server shows it.
 * POST /api/variants/:id/preview
 */
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

  const projectDir = findPreviewDir(variant.feature.project);
  const branchName = `variant-${id}`;

  try {
    execSync(`git checkout ${branchName}`, { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
  } catch (e: any) {
    return NextResponse.json({ error: "Branch not found", detail: e.message }, { status: 404 });
  }

  return NextResponse.json({ ok: true, branch: branchName });
}
