import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  // Verify user has access to this project via workspace membership
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      deployStatus: true,
      client: { select: { name: true } },
      workspaceId: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isMember = user.memberships.some(
    (m: any) => m.workspaceId === project.workspaceId
  );
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse date filter
  const daysParam = req.nextUrl.searchParams.get("days");
  let dateFilter: Date | null = null;
  const now = new Date();

  if (daysParam && daysParam !== "all") {
    const days = parseInt(daysParam, 10);
    if (!isNaN(days) && days > 0) {
      dateFilter = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
  }

  const createdAtFilter = dateFilter ? { gte: dateFilter } : undefined;

  // Fetch all data in parallel
  const [features, meetings, feedback, costEntries, activities] =
    await Promise.all([
      prisma.feature.findMany({
        where: {
          projectId,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          parentId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.meeting.findMany({
        where: {
          projectId,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          id: true,
          type: true,
          summary: true,
          status: true,
          createdAt: true,
          createdByName: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.feedbackItem.findMany({
        where: {
          projectId,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          id: true,
          title: true,
          text: true,
          priority: true,
          status: true,
          source: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.costEntry.findMany({
        where: {
          projectId,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          id: true,
          action: true,
          costCents: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.findMany({
        where: {
          projectId,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          id: true,
          action: true,
          description: true,
          category: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  // Aggregate costs by action
  const byAction: Record<string, number> = {};
  let totalCents = 0;
  for (const entry of costEntries) {
    totalCents += entry.costCents;
    byAction[entry.action] = (byAction[entry.action] || 0) + entry.costCents;
  }

  return NextResponse.json({
    project: {
      name: project.name,
      client: project.client.name,
      deployStatus: project.deployStatus,
    },
    features: features.map((f) => ({
      title: f.title,
      status: f.status,
      parentId: f.parentId,
      createdAt: f.createdAt,
    })),
    meetings: meetings.map((m) => ({
      type: m.type,
      summary: m.summary,
      status: m.status,
      createdByName: m.createdByName,
      createdAt: m.createdAt,
    })),
    feedback: feedback.map((f) => ({
      title: f.title || f.text.slice(0, 80),
      priority: f.priority,
      status: f.status,
      source: f.source,
      createdAt: f.createdAt,
    })),
    costs: {
      totalCents,
      byAction,
    },
    activities: activities.map((a) => ({
      action: a.action,
      description: a.description,
      category: a.category,
      createdAt: a.createdAt,
    })),
    period: {
      start: dateFilter ? dateFilter.toISOString() : null,
      end: now.toISOString(),
    },
  });
}
