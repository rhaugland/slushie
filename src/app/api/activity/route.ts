import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = req.nextUrl;
  const category = url.searchParams.get("category") || undefined;
  const projectId = url.searchParams.get("projectId") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 50;

  // Get all workspace IDs the user has access to
  const workspaceIds = user.memberships.map((m: any) => m.workspaceId);

  const where: any = {
    workspaceId: { in: workspaceIds },
  };
  if (category && category !== "all") {
    where.category = category;
  }
  if (projectId) {
    where.projectId = projectId;
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
