import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Gather all workspace IDs the user belongs to
  const workspaceIds = user.memberships.map((m: any) => m.workspaceId);

  if (workspaceIds.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch all projects across user's workspaces with summary data
  const projects = await prisma.project.findMany({
    where: {
      workspaceId: { in: workspaceIds },
    },
    select: {
      id: true,
      name: true,
      deployStatus: true,
      createdAt: true,
      client: {
        select: { name: true },
      },
      features: {
        where: { parentId: null },
        select: {
          id: true,
          status: true,
          createdAt: true,
          children: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
          builds: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
      meetings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      billing: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = projects.map((p) => {
    // Flatten features (parents + children)
    const allFeatures = [
      ...p.features,
      ...p.features.flatMap((f) => f.children || []),
    ];

    const featureCount = allFeatures.length;
    const draftCount = allFeatures.filter((f) => f.status === "draft").length;
    const buildingCount = allFeatures.filter((f) => f.status === "building").length;
    const liveCount = allFeatures.filter((f) => f.status === "live").length;

    // Determine last activity: most recent feature creation, build, or meeting
    const dates: Date[] = [p.createdAt];
    for (const f of p.features) {
      dates.push(f.createdAt);
      for (const child of f.children || []) {
        dates.push(child.createdAt);
      }
      if (f.builds.length > 0) {
        dates.push(f.builds[0].createdAt);
      }
    }
    if (p.meetings.length > 0) {
      dates.push(p.meetings[0].createdAt);
    }
    const lastActivityAt = dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString()
      : null;

    return {
      id: p.id,
      name: p.name,
      clientName: p.client.name,
      featureCount,
      draftCount,
      buildingCount,
      liveCount,
      deployStatus: p.deployStatus,
      lastActivityAt,
      hasScope: !!p.billing,
    };
  });

  return NextResponse.json(result);
}
