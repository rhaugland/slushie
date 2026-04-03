import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import path from "path";

/**
 * POST: checkout main branch so the preview server shows the original.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const projectDir = path.join(process.cwd(), "previews", slug);

  try {
    execSync("git checkout main", { cwd: projectDir, encoding: "utf-8" });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to restore", detail: e.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, branch: "main" });
}
