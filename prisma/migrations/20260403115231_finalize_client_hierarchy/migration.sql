-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_userId_fkey";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "clientName",
ALTER COLUMN "clientId" SET NOT NULL;

-- DropTable
DROP TABLE "ProjectMember";
