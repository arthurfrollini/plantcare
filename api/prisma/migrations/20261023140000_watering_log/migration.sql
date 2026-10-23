-- CreateTable
CREATE TABLE "Watering" (
    "id" TEXT NOT NULL,
    "userPlantId" TEXT NOT NULL,
    "wateredOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Watering_userPlantId_idx" ON "Watering"("userPlantId");

-- CreateIndex
CREATE UNIQUE INDEX "Watering_userPlantId_wateredOn_key" ON "Watering"("userPlantId", "wateredOn");

-- AddForeignKey
ALTER TABLE "Watering" ADD CONSTRAINT "Watering_userPlantId_fkey" FOREIGN KEY ("userPlantId") REFERENCES "UserPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

