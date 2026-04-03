import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import path from "path";

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

  const slug = variant.feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const projectDir = path.join(process.cwd(), "previews", slug);
  const branchName = `variant-${id}`;

  try {
    execSync(`git checkout ${branchName}`, { cwd: projectDir, encoding: "utf-8" });
  } catch (e: any) {
    return NextResponse.json({ error: "Branch not found", detail: e.message }, { status: 404 });
  }

  return NextResponse.json({ ok: true, branch: branchName });
}
