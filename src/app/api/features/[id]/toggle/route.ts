import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readManifest, writeManifest, toggleFeatureInManifest } from "@/lib/manifest";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const feature = await prisma.feature.update({
    where: { id },
    data: { enabled },
    include: { project: true },
  });

  // Major features: update manifest
  if (!feature.parentId) {
    const slug = feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const projectDir = path.join(process.cwd(), "previews", slug);
    try {
      const manifest = await readManifest(projectDir);
      const updated = toggleFeatureInManifest(manifest, id, enabled);
      await writeManifest(projectDir, updated);
    } catch { /* project dir may not exist yet */ }

    try {
      const manifest = await readManifest(projectDir);
      await prisma.project.update({
        where: { id: feature.projectId },
        data: { manifestJson: manifest as object },
      });
    } catch { /* ignore */ }
  }

  // Minor features: the DB flag is enough — the preview proxy checks
  // enabled state at runtime and blocks disabled feature routes.

  return NextResponse.json(feature);
}
