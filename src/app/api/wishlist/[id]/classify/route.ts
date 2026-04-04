import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyWishlistItem } from "@/lib/classify-wishlist";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const item = await prisma.wishlistItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await classifyWishlistItem(id);

  const updated = await prisma.wishlistItem.findUnique({ where: { id } });
  return NextResponse.json({ featureType: updated?.featureType, suggestedParent: updated?.suggestedParent });
}
