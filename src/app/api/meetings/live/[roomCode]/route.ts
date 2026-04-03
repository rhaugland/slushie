import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;

  const room = await prisma.liveRoom.findUnique({
    where: { roomCode },
    include: {
      meeting: {
        select: { id: true, status: true, clientId: true },
      },
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({
    roomCode: room.roomCode,
    meetingId: room.meeting.id,
    status: room.status,
  });
}
