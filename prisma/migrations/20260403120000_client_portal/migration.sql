-- CreateTable
CREATE TABLE "WishlistVote" (
    "id" TEXT NOT NULL,
    "wishlistItemId" TEXT NOT NULL,
    "clientMemberId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistVote_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FeedbackItem" ADD COLUMN "clientMemberId" TEXT;

-- CreateIndex
CREATE INDEX "WishlistVote_wishlistItemId_idx" ON "WishlistVote"("wishlistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistVote_wishlistItemId_clientMemberId_key" ON "WishlistVote"("wishlistItemId", "clientMemberId");

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_clientMemberId_fkey" FOREIGN KEY ("clientMemberId") REFERENCES "ClientMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistVote" ADD CONSTRAINT "WishlistVote_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistVote" ADD CONSTRAINT "WishlistVote_clientMemberId_fkey" FOREIGN KEY ("clientMemberId") REFERENCES "ClientMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
