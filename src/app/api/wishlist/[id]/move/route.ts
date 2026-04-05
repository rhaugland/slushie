import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title, description, featureType, projectId, parentFeatureId, autoBuild, includeMinorIds } = await req.json();

  if (!title || !projectId || !featureType) {
    return NextResponse.json({ error: "title, projectId, and featureType required" }, { status: 400 });
  }

  const item = await prisma.wishlistItem.findUniqueOrThrow({ where: { id } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const isMajor = featureType === "major";
  const parentId = isMajor ? null : (parentFeatureId || null);

  const count = await prisma.feature.count({
    where: { projectId, parentId },
  });

  const feature = await prisma.feature.create({
    data: {
      projectId,
      parentId,
      title,
      description: description || item.description,
      sortOrder: count,
      enabled: isMajor,
    },
  });

  await prisma.wishlistItem.update({
    where: { id },
    data: { status: "moved", featureId: feature.id },
  });

  logActivity({
    workspaceId: project.workspaceId,
    projectId,
    userId: (user as any).id,
    userName: (user as any).name,
    action: "feature_created",
    category: "feature",
    description: `Moved "${title}" from wishlist to ${isMajor ? "major" : "minor"} feature`,
    metadata: { featureId: feature.id, wishlistItemId: id, source: item.source },
  });

  const createdFeatureIds = [feature.id];

  // For major features: also create selected minor features underneath
  if (isMajor && Array.isArray(includeMinorIds) && includeMinorIds.length > 0) {
    const minorItems = await prisma.wishlistItem.findMany({
      where: { id: { in: includeMinorIds }, status: "pending" },
    });

    let minorSort = 0;
    for (const minor of minorItems) {
      const minorFeature = await prisma.feature.create({
        data: {
          projectId,
          parentId: feature.id,
          title: minor.title,
          description: minor.description,
          sortOrder: minorSort++,
          enabled: false,
        },
      });

      await prisma.wishlistItem.update({
        where: { id: minor.id },
        data: { status: "moved", featureId: minorFeature.id },
      });

      createdFeatureIds.push(minorFeature.id);

      logActivity({
        workspaceId: project.workspaceId,
        projectId,
        userId: (user as any).id,
        userName: (user as any).name,
        action: "feature_created",
        category: "feature",
        description: `Moved "${minor.title}" from wishlist as sub-feature of "${title}"`,
        metadata: { featureId: minorFeature.id, parentFeatureId: feature.id, wishlistItemId: minor.id },
      });
    }
  }

  // Trigger builds for all created features
  if (autoBuild) {
    const { inngest } = await import("@/inngest/client");
    for (const featureId of createdFeatureIds) {
      await inngest.send({
        name: "feature/build-claude-code",
        data: {
          featureId,
          projectId,
          mode: "og",
        },
      });
    }
  }

  return NextResponse.json({ feature, wishlistItem: item });
}
