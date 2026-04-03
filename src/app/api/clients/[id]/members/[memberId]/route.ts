import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, memberId } = await params;
  const body = await req.json();
  const { projectIds, role: requestedRole } = body;

  if (projectIds !== undefined && !Array.isArray(projectIds)) {
    return NextResponse.json({ error: "projectIds must be an array" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }
  if (membership.role !== "admin" && membership.role !== "owner") {
    return NextResponse.json({ error: "Only admins can edit member access" }, { status: 403 });
  }

  const clientMember = await prisma.clientMember.findFirst({
    where: { id: memberId, clientId: id },
  });
  if (!clientMember) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Build update data
  const updateData: Record<string, unknown> = {};

  // Handle role change
  if (requestedRole === "admin" || requestedRole === "member") {
    updateData.role = requestedRole;

    // Also update WorkspaceMember role if the client member has a userId
    if (clientMember.userId) {
      if (requestedRole === "admin") {
        await prisma.workspaceMember.updateMany({
          where: { workspaceId: client.workspaceId, userId: clientMember.userId },
          data: { role: "admin" },
        });
      } else {
        // Only downgrade workspace role if no other client memberships in this workspace are admin
        const otherAdminMemberships = await prisma.clientMember.findMany({
          where: {
            userId: clientMember.userId,
            role: "admin",
            id: { not: memberId },
            client: { workspaceId: client.workspaceId },
          },
        });
        if (otherAdminMemberships.length === 0) {
          await prisma.workspaceMember.updateMany({
            where: { workspaceId: client.workspaceId, userId: clientMember.userId },
            data: { role: "member" },
          });
        }
      }
    }
  }

  // Handle project access change
  if (Array.isArray(projectIds)) {
    await prisma.clientMemberProject.deleteMany({ where: { clientMemberId: memberId } });
    updateData.projectAccess = {
      create: projectIds.map((projectId: string) => ({ projectId })),
    };
  }

  const updated = await prisma.clientMember.update({
    where: { id: memberId },
    data: updateData,
    include: {
      user: { select: { id: true, email: true, name: true } },
      projectAccess: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (requestedRole === "admin" || requestedRole === "member") {
    logActivity({
      workspaceId: client.workspaceId,
      userId: user.id,
      userName: user.name ?? undefined,
      action: "role_changed",
      category: "team",
      description: `Role changed to ${requestedRole} for ${updated.user?.name || updated.user?.email || updated.invitedEmail || memberId}`,
      metadata: { clientId: id, memberId, role: requestedRole },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, memberId } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }
  if (membership.role !== "admin" && membership.role !== "owner") {
    return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });
  }

  const clientMember = await prisma.clientMember.findFirst({
    where: { id: memberId, clientId: id },
  });
  if (!clientMember) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Prevent self-removal
  if (clientMember.userId === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  await prisma.clientMember.delete({ where: { id: memberId } });

  return NextResponse.json({ ok: true });
}
