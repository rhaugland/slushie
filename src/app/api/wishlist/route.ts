import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyWishlistItem } from "@/lib/classify-wishlist";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  const projectId = req.nextUrl.searchParams.get("projectId");
  const priority = req.nextUrl.searchParams.get("priority");
  const status = req.nextUrl.searchParams.get("status") || "pending";

  const where: Record<string, unknown> = { status };
  if (clientId) where.clientId = clientId;
  if (projectId) where.projectId = projectId;
  if (priority) where.priority = priority;

  if (!clientId && !projectId) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: (user as any).id },
      select: { workspaceId: true },
    });
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const clients = await prisma.client.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true },
    });
    where.clientId = { in: clients.map((c) => c.id) };
  }

  const items = await prisma.wishlistItem.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      meeting: { select: { id: true, type: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, clientId, projectId, priority } = await req.json();

  if (!title || !description || !clientId) {
    return NextResponse.json({ error: "title, description, and clientId required" }, { status: 400 });
  }

  const item = await prisma.wishlistItem.create({
    data: {
      title,
      description,
      clientId,
      projectId: projectId || null,
      priority: priority || null,
      source: "manual",
      status: "pending",
    },
  });

  if (projectId) {
    classifyWishlistItem(item.id).catch(() => {});
  }

  return NextResponse.json(item, { status: 201 });
}
