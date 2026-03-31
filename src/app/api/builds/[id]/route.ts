import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const build = await prisma.build.findUniqueOrThrow({ where: { id } });
  return NextResponse.json(build);
}
