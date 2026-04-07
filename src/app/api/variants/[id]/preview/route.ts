import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST: Get the variant's preview URL (its own dev server on a separate port).
 * POST /api/variants/:id/preview
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const variant = await prisma.variant.findUnique({
    where: { id },
    select: { id: true, port: true, status: true },
  });

  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  if (!variant.port) {
    return NextResponse.json({ error: "Variant has no preview server" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, port: variant.port });
}
