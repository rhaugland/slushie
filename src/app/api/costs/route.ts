import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");

  // Get all project IDs the user can access
  const ownerWorkspaceIds = user.memberships
    .map((m) => m.workspaceId);

  const grantedProjectIds = user.clientMemberships.flatMap((cm) =>
    cm.projectAccess.map((pa) => pa.projectId)
  );

  const accessibleProjects = await prisma.project.findMany({
    where: {
      OR: [
        { workspaceId: { in: ownerWorkspaceIds } },
        { id: { in: grantedProjectIds } },
      ],
    },
    select: { id: true, name: true },
  });

  const accessibleIds = accessibleProjects.map((p) => p.id);

  // If a specific project is requested, verify access
  if (projectId && !accessibleIds.includes(projectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entries = await prisma.costEntry.findMany({
    where: { projectId: projectId ? projectId : { in: accessibleIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { project: { select: { id: true, name: true } } },
  });

  const totalCostCents = entries.reduce((sum, e) => sum + e.costCents, 0);
  const totalInputTokens = entries.reduce((sum, e) => sum + e.inputTokens, 0);
  const totalOutputTokens = entries.reduce((sum, e) => sum + e.outputTokens, 0);

  const byAction: Record<string, { count: number; costCents: number; inputTokens: number; outputTokens: number }> = {};
  for (const entry of entries) {
    if (!byAction[entry.action]) {
      byAction[entry.action] = { count: 0, costCents: 0, inputTokens: 0, outputTokens: 0 };
    }
    byAction[entry.action].count++;
    byAction[entry.action].costCents += entry.costCents;
    byAction[entry.action].inputTokens += entry.inputTokens;
    byAction[entry.action].outputTokens += entry.outputTokens;
  }

  const byDay: Record<string, number> = {};
  for (const entry of entries) {
    const day = entry.createdAt.toISOString().split("T")[0];
    byDay[day] = (byDay[day] || 0) + entry.costCents;
  }

  return NextResponse.json({
    entries,
    projects: accessibleProjects,
    summary: {
      totalCostCents,
      totalInputTokens,
      totalOutputTokens,
      totalCalls: entries.length,
      byAction,
      byDay,
    },
  });
}
