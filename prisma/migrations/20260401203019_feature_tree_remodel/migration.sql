/*
  Warnings:

  - You are about to drop the column `clientId` on the `Meeting` table. All the data in the column will be lost.
  - You are about to drop the `Build` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Client` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Objective` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `projectId` to the `Meeting` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Build" DROP CONSTRAINT "Build_objectiveId_fkey";

-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Objective" DROP CONSTRAINT "Objective_meetingId_fkey";

-- DropIndex
DROP INDEX "Meeting_clientId_idx";

-- AlterTable
ALTER TABLE "Meeting" DROP COLUMN "clientId",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Build";

-- DropTable
DROP TABLE "Client";

-- DropTable
DROP TABLE "Objective";

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientFirm" TEXT NOT NULL,
    "themeConfig" JSONB NOT NULL DEFAULT '{}',
    "baseVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "manifestJson" JSONB NOT NULL DEFAULT '{"features":[]}',
    "deployUrl" TEXT,
    "deployStatus" TEXT NOT NULL DEFAULT 'stopped',
    "port" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "moduleHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureBuild" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "generatedCode" JSONB NOT NULL,
    "buildLogs" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSuggestion" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "suggestedTitle" TEXT NOT NULL,
    "suggestedDescription" TEXT NOT NULL,
    "suggestedPriority" TEXT,
    "suggestedParentTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "featureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feature_projectId_idx" ON "Feature"("projectId");

-- CreateIndex
CREATE INDEX "Feature_parentId_idx" ON "Feature"("parentId");

-- CreateIndex
CREATE INDEX "FeatureBuild_featureId_idx" ON "FeatureBuild"("featureId");

-- CreateIndex
CREATE INDEX "MeetingSuggestion_meetingId_idx" ON "MeetingSuggestion"("meetingId");

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureBuild" ADD CONSTRAINT "FeatureBuild_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSuggestion" ADD CONSTRAINT "MeetingSuggestion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
