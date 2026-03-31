import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const allowed = ["title", "description", "priority", "status"];
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const objective = await prisma.objective.update({ where: { id }, data });

  if (data.status === "selected") {
    await inngest.send({
      name: "objective/architect",
      data: { objectiveId: id },
    });
  }

  return NextResponse.json(objective);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.objective.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
