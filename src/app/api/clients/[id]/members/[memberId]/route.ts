import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, memberId } = await params;
  const body = await req.json();
  const { projectIds } = body;

  if (!Array.isArray(projectIds)) {
    return NextResponse.json({ error: "projectIds must be an array" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const clientMember = await prisma.clientMember.findFirst({
    where: { id: memberId, clientId: id },
  });
  if (!clientMember) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await prisma.clientMemberProject.deleteMany({ where: { clientMemberId: memberId } });

  const updated = await prisma.clientMember.update({
    where: { id: memberId },
    data: {
      projectAccess: {
        create: projectIds.map((projectId: string) => ({ projectId })),
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
