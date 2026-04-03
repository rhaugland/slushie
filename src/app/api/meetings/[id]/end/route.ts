import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Update live room status
  await prisma.liveRoom.updateMany({
    where: { meetingId: id },
    data: { status: "ended" },
  });

  // Stitch audio chunks into a single file
  const chunkDir = path.join(process.cwd(), "public", "uploads", "chunks", id);
  const outputDir = path.join(process.cwd(), "public", "uploads", "notes");
  await mkdir(outputDir, { recursive: true });

  let audioUrl: string | null = null;

  try {
    const files = await readdir(chunkDir);
    const sorted = files.filter((f) => f.endsWith(".webm")).sort();

    if (sorted.length > 0) {
      // Concatenate webm chunks into a single file
      const buffers: Buffer[] = [];
      for (const file of sorted) {
        const buf = await readFile(path.join(chunkDir, file));
        buffers.push(buf);
      }
      const combined = Buffer.concat(buffers);
      const outputFile = `${id}.webm`;
      await writeFile(path.join(outputDir, outputFile), combined);
      audioUrl = `/uploads/notes/${outputFile}`;
    }
  } catch {
    // No chunks directory — meeting may have had no audio
  }

  // Update meeting with audio URL and trigger transcription pipeline
  await prisma.meeting.update({
    where: { id },
    data: {
      audioUrl,
      status: audioUrl ? "uploading" : "ready",
    },
  });

  // Trigger transcription if we have audio
  if (audioUrl) {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "meeting/transcribe",
      data: { meetingId: id },
    });
  }

  return NextResponse.json({ ok: true, audioUrl });
}
