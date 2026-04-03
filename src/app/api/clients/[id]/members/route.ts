import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const members = await prisma.clientMember.findMany({
    where: { clientId: id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      projectAccess: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(members);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { email, projectIds, role: requestedRole } = body;
  const memberRole = requestedRole === "admin" ? "admin" : "member";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }
  if (membership.role !== "admin" && membership.role !== "owner") {
    return NextResponse.json({ error: "Only admins can add members" }, { status: 403 });
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });

  if (targetUser) {
    const existing = await prisma.clientMember.findUnique({
      where: { clientId_userId: { clientId: id, userId: targetUser.id } },
    });
    if (existing) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }

    // Auto-create WorkspaceMember if not already one
    const existingWorkspaceMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: client.workspaceId, userId: targetUser.id } },
    });
    if (!existingWorkspaceMember) {
      await prisma.workspaceMember.create({
        data: { workspaceId: client.workspaceId, userId: targetUser.id, role: memberRole },
      });
    } else if (memberRole === "admin" && existingWorkspaceMember.role !== "admin") {
      await prisma.workspaceMember.update({
        where: { id: existingWorkspaceMember.id },
        data: { role: "admin" },
      });
    }

    const member = await prisma.clientMember.create({
      data: {
        clientId: id,
        userId: targetUser.id,
        role: memberRole,
        projectAccess: {
          create: (projectIds ?? []).map((projectId: string) => ({ projectId })),
        },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        projectAccess: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    logActivity({
      workspaceId: client.workspaceId,
      userId: user.id,
      userName: user.name ?? undefined,
      action: "member_added",
      category: "team",
      description: `Added ${targetUser.name || targetUser.email} to ${client.name}`,
      metadata: { clientId: id, memberEmail: email, role: memberRole },
    });

    return NextResponse.json(member, { status: 201 });
  }

  // User does not exist — store invite by email only
  const member = await prisma.clientMember.create({
    data: {
      clientId: id,
      invitedEmail: email,
      role: memberRole,
      projectAccess: {
        create: (projectIds ?? []).map((projectId: string) => ({ projectId })),
      },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      projectAccess: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  logActivity({
    workspaceId: client.workspaceId,
    userId: user.id,
    userName: user.name ?? undefined,
    action: "member_invited",
    category: "team",
    description: `Invited ${email} to ${client.name}`,
    metadata: { clientId: id, memberEmail: email, role: memberRole },
  });

  return NextResponse.json(member, { status: 201 });
}
