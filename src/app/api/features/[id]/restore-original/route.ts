import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import { findPreviewDir } from "@/lib/preview-dir";

/**
 * POST: Restore original as the live version — unset all variants' isMain and checkout main.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const feature = await prisma.feature.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  // Clear all variants' isMain
  await prisma.variant.updateMany({
    where: { featureId: id },
    data: { isMain: false },
  });

  // Restore original files from pre-promote tag, then commit on main
  const projectDir = findPreviewDir(feature.project);

  try {
    execSync("git checkout main", { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
    // Restore files from the pre-promote snapshot if it exists
    try {
      execSync("git checkout pre-promote -- .", { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
      const status = execSync("git status --porcelain", { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" }).trim();
      if (status) {
        execSync("git add -A", { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
        execSync('git commit -m "restore: original version"', { cwd: projectDir, encoding: "utf-8", shell: "/bin/bash" });
      }
    } catch { /* pre-promote tag may not exist yet — main is already the original */ }
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to restore", detail: e.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
