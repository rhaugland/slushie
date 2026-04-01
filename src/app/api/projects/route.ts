import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
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
  const body = await req.json();
  const { name, clientName, clientFirm } = body;

  if (!name || !clientName || !clientFirm) {
    return NextResponse.json({ error: "name, clientName, clientFirm required" }, { status: 400 });
  }
  if (!["w3", "isotropic"].includes(clientFirm)) {
    return NextResponse.json({ error: "clientFirm must be w3 or isotropic" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: { name, clientName, clientFirm },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "project/create", data: { projectId: project.id } });

  return NextResponse.json(project, { status: 201 });
}
