import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readManifest, writeManifest, removeFeatureFromManifest } from "@/lib/manifest";
import path from "path";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["title", "description", "sortOrder"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  const feature = await prisma.feature.update({ where: { id }, data });
  return NextResponse.json(feature);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feature = await prisma.feature.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  if (feature.project.deployUrl) {
    const slug = feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const projectDir = path.join(process.cwd(), "previews", slug);
    try {
      const manifest = await readManifest(projectDir);
      const updated = removeFeatureFromManifest(manifest, id);
      await writeManifest(projectDir, updated);
    } catch { /* project dir may not exist yet */ }
  }

  await prisma.feature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
