import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";
import { rm } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      features: {
        include: {
          children: {
            include: { builds: { take: 1, orderBy: { createdAt: "desc" } } },
            orderBy: { sortOrder: "asc" },
          },
          builds: { take: 1, orderBy: { createdAt: "desc" } },
        },
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
      },
      meetings: {
        include: { suggestions: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "clientName", "clientFirm", "themeConfig"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Kill the dev server if running
  if (project.port) {
    try {
      await execAsync(`lsof -ti:${project.port} | xargs kill -9 2>/dev/null || true`);
    } catch { /* already stopped */ }
  }

  // Remove preview directory
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const projectDir = path.join(process.cwd(), "previews", slug);
  try {
    await rm(projectDir, { recursive: true, force: true });
  } catch { /* may not exist */ }

  // Cascade delete handles features, builds, meetings, suggestions
  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
