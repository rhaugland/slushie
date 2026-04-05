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

  const entries = await prisma.costEntry.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Aggregate stats
  const totalCostCents = entries.reduce((sum, e) => sum + e.costCents, 0);
  const totalInputTokens = entries.reduce((sum, e) => sum + e.inputTokens, 0);
  const totalOutputTokens = entries.reduce((sum, e) => sum + e.outputTokens, 0);

  // Per-action breakdown
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

  // Per-day breakdown (last 30 days)
  const byDay: Record<string, number> = {};
  for (const entry of entries) {
    const day = entry.createdAt.toISOString().split("T")[0];
    byDay[day] = (byDay[day] || 0) + entry.costCents;
  }

  return NextResponse.json({
    entries,
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
