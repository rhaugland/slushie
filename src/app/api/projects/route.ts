import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceIds = user.memberships.map((m) => m.workspaceId);

  const projects = await prisma.project.findMany({
    where: { workspaceId: { in: workspaceIds } },
    include: {
      features: {
        include: { children: true, builds: { take: 1, orderBy: { createdAt: "desc" } } },
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
      },
      meetings: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, clientName, workspaceId } = body;

  if (!name || !clientName || !workspaceId) {
    return NextResponse.json({ error: "name, clientName, workspaceId required" }, { status: 400 });
  }

  const membership = user.memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const project = await prisma.project.create({
    data: { name, clientName, workspaceId },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "project/create", data: { projectId: project.id } });

  return NextResponse.json(project, { status: 201 });
}
