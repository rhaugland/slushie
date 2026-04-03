import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Workspace owners/admins see all projects in their workspaces
  const ownerWorkspaceIds = user.memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.workspaceId);

  // Other users see only projects granted via clientMemberships
  const grantedProjectIds = user.clientMemberships.flatMap((cm) =>
    cm.projectAccess.map((pa) => pa.projectId)
  );

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { workspaceId: { in: ownerWorkspaceIds } },
        { id: { in: grantedProjectIds } },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
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
  const { name, clientId } = body;

  if (!name || !clientId) {
    return NextResponse.json({ error: "name, clientId required" }, { status: 400 });
  }

  // Look up client to get its workspaceId
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Verify user is a workspace member
  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const project = await prisma.project.create({
    data: { name, clientId, workspaceId: client.workspaceId },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "project/create", data: { projectId: project.id } });

  return NextResponse.json(project, { status: 201 });
}
