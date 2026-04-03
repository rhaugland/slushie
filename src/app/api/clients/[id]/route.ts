import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const updated = await prisma.client.update({ where: { id }, data: { name } });
  return NextResponse.json(updated);
}

export async function DELETE(
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

  // Cascade delete handles members, projects, and their children
  await prisma.client.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
