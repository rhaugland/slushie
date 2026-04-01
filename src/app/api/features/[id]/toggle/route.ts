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

  // Minor features (build instructions) only update the DB flag — no manifest change.
  // The parent major feature needs to be rebuilt to include/exclude the minor feature.
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

  return NextResponse.json(feature);
}
