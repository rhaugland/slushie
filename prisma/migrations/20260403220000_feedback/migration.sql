-- AlterTable
ALTER TABLE "Project" ADD COLUMN "apiKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_apiKey_key" ON "Project"("apiKey");

-- CreateTable
CREATE TABLE "FeedbackItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "priority" TEXT,
    "featureType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "wishlistItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackItem_projectId_idx" ON "FeedbackItem"("projectId");

-- CreateIndex
CREATE INDEX "FeedbackItem_status_idx" ON "FeedbackItem"("status");

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
