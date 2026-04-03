-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Variant',
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "buildLogs" TEXT,
    "buildOutput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Variant_featureId_idx" ON "Variant"("featureId");

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
