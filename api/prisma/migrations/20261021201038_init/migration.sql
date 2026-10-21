-- CreateEnum
CREATE TYPE "PlantSource" AS ENUM ('curated', 'ai');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "scientificName" TEXT NOT NULL,
    "source" "PlantSource" NOT NULL DEFAULT 'curated',
    "light" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "frequencyTimes" INTEGER NOT NULL,
    "frequencyPer" TEXT NOT NULL,
    "imageFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantTranslation" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "waterTips" TEXT NOT NULL,

    CONSTRAINT "PlantTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantAlias" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,

    CONSTRAINT "PlantAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catalogPlantId" TEXT NOT NULL,
    "nickname" TEXT,
    "frequencyTimes" INTEGER NOT NULL,
    "frequencyPer" TEXT NOT NULL,
    "reminderTime" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "light" TEXT,
    "notes" TEXT,
    "photoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Plant_slug_key" ON "Plant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Plant_scientificName_key" ON "Plant"("scientificName");

-- CreateIndex
CREATE INDEX "PlantTranslation_searchName_idx" ON "PlantTranslation"("searchName");

-- CreateIndex
CREATE UNIQUE INDEX "PlantTranslation_plantId_locale_key" ON "PlantTranslation"("plantId", "locale");

-- CreateIndex
CREATE INDEX "PlantAlias_searchName_idx" ON "PlantAlias"("searchName");

-- CreateIndex
CREATE INDEX "PlantAlias_plantId_idx" ON "PlantAlias"("plantId");

-- CreateIndex
CREATE INDEX "UserPlant_userId_idx" ON "UserPlant"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTranslation" ADD CONSTRAINT "PlantTranslation_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAlias" ADD CONSTRAINT "PlantAlias_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlant" ADD CONSTRAINT "UserPlant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlant" ADD CONSTRAINT "UserPlant_catalogPlantId_fkey" FOREIGN KEY ("catalogPlantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
