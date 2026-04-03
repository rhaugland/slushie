import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, workspaceId } = body;

  if (!name || !workspaceId) {
    return NextResponse.json({ error: "name and workspaceId are required" }, { status: 400 });
  }

  const membership = user.memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const client = await prisma.client.create({
    data: { name, workspaceId },
  });

  return NextResponse.json(client, { status: 201 });
}
