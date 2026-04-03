import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Get all builds today across all projects the user has access to
  const projectIds = user.memberships.flatMap((m: any) =>
    m.workspace.clients.flatMap((c: any) =>
      c.projects.map((p: any) => p.id)
    )
  );

  const builds = await prisma.featureBuild.findMany({
    where: {
      createdAt: { gte: startOfDay },
      feature: { projectId: { in: projectIds } },
    },
    include: {
      feature: { select: { id: true, title: true, projectId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Also check for features currently building (not yet in FeatureBuild)
  const buildingFeatures = await prisma.feature.findMany({
    where: {
      projectId: { in: projectIds },
      status: "building",
    },
    select: { id: true, title: true, projectId: true },
  });

  const totalTokens = builds.reduce((sum, b) => sum + (b.tokensUsed || 0), 0);
  const totalBuilds = builds.length + buildingFeatures.length;
  const successCount = builds.filter((b) => b.status === "complete").length;
  const failedCount = builds.filter((b) => b.status === "failed").length;
  const inProgressCount = buildingFeatures.length + builds.filter((b) => b.status === "queued" || b.status === "generating").length;

  return NextResponse.json({
    date: startOfDay.toISOString(),
    totalBuilds,
    successCount,
    failedCount,
    inProgressCount,
    totalTokens,
    builds: builds.map((b) => ({
      id: b.id,
      featureTitle: b.feature.title,
      status: b.status,
      tokensUsed: b.tokensUsed,
      durationMs: b.durationMs,
      createdAt: b.createdAt,
    })),
    building: buildingFeatures.map((f) => ({
      id: f.id,
      featureTitle: f.title,
      status: "building",
    })),
  });
}
