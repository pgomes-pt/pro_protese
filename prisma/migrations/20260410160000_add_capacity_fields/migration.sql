-- AlterTable
ALTER TABLE "WorkTypeConfig" ADD COLUMN "estimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LabConfig" (
    "id" TEXT NOT NULL,
    "maxDailyHours" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabConfig_pkey" PRIMARY KEY ("id")
);
