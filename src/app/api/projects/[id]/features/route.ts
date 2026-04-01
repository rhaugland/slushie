import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const features = await prisma.feature.findMany({
    where: { projectId: id, parentId: null },
    include: {
      children: {
        include: { builds: { take: 1, orderBy: { createdAt: "desc" } } },
        orderBy: { sortOrder: "asc" },
      },
      builds: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(features);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { title, description, parentId } = body;

  if (!title || !description) {
    return NextResponse.json({ error: "title and description required" }, { status: 400 });
  }

  const count = await prisma.feature.count({
    where: { projectId: id, parentId: parentId || null },
  });

  const feature = await prisma.feature.create({
    data: {
      projectId: id,
      parentId: parentId || null,
      title,
      description,
      sortOrder: count,
    },
  });

  return NextResponse.json(feature, { status: 201 });
}
