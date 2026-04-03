-- CreateTable
CREATE TABLE "LiveRoom" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveRoom_meetingId_key" ON "LiveRoom"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRoom_roomCode_key" ON "LiveRoom"("roomCode");

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
