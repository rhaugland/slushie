import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const formData = await req.formData();
  const chunk = formData.get("chunk") as File | null;
  const chunkIndex = formData.get("index") as string | null;

  if (!chunk || chunkIndex === null) {
    return NextResponse.json({ error: "chunk and index required" }, { status: 400 });
  }

  const chunkDir = path.join(process.cwd(), "public", "uploads", "chunks", id);
  await mkdir(chunkDir, { recursive: true });

  const filename = `${chunkIndex.padStart(4, "0")}.webm`;
  const buffer = Buffer.from(await chunk.arrayBuffer());
  await writeFile(path.join(chunkDir, filename), buffer);

  return NextResponse.json({ ok: true, chunk: filename });
}
