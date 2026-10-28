-- AlterTable
ALTER TABLE "Plant" ADD COLUMN     "imageAuthor" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageLicense" TEXT,
ADD COLUMN     "imageSource" TEXT;

-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "photoKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkup" (
    "id" TEXT NOT NULL,
    "userPlantId" TEXT NOT NULL,
    "photoKey" TEXT NOT NULL,
    "description" TEXT,
    "problem" TEXT NOT NULL,
    "steps" TEXT[],
    "whenToWorry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "healedAt" TIMESTAMP(3),

    CONSTRAINT "Checkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("userId","day","kind")
);

-- CreateIndex
CREATE INDEX "AiProposal_userId_idx" ON "AiProposal"("userId");

-- CreateIndex
CREATE INDEX "Checkup_userPlantId_createdAt_idx" ON "Checkup"("userPlantId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_day_idx" ON "AiUsage"("day");

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkup" ADD CONSTRAINT "Checkup_userPlantId_fkey" FOREIGN KEY ("userPlantId") REFERENCES "UserPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
