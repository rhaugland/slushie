import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readManifest, writeManifest, toggleFeatureInManifest } from "@/lib/manifest";
import { logActivity } from "@/lib/activity";
import { findPreviewDir } from "@/lib/preview-dir";

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

  // Major features: cascade to all children + update manifest
  if (!feature.parentId) {
    // Cascade: disable/enable all minor features under this major feature
    await prisma.feature.updateMany({
      where: { parentId: id },
      data: { enabled },
    });

    const projectDir = findPreviewDir(feature.project);
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

  logActivity({
    workspaceId: feature.project.workspaceId,
    projectId: feature.projectId,
    action: feature.enabled ? "feature_toggled_on" : "feature_toggled_off",
    category: "feature",
    description: `"${feature.title}" toggled ${feature.enabled ? "on" : "off"}`,
    metadata: { featureId: id, featureTitle: feature.title, enabled: feature.enabled },
  });

  return NextResponse.json(feature);
}
