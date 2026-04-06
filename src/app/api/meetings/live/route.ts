import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, projectId } = await request.json();

  if (!clientId) {
    return Response.json({ error: "clientId required" }, { status: 400 });
  }

  // Create meeting record
  const meeting = await prisma.meeting.create({
    data: {
      clientId,
      projectId: projectId || null,
      type: "live_video",
      status: "uploading",
      createdById: user.id,
      createdByName: user.name,
    },
  });

  // Generate short room code (8 chars, URL-safe)
  const roomCode = crypto.randomBytes(4).toString("hex");

  // Create live room
  const liveRoom = await prisma.liveRoom.create({
    data: {
      meetingId: meeting.id,
      roomCode,
      status: "waiting",
    },
  });

  return Response.json(
    {
      meetingId: meeting.id,
      roomCode: liveRoom.roomCode,
      meetingLink: `/meet/${liveRoom.roomCode}`,
    },
    { status: 201 }
  );
}
