-- AlterTable
ALTER TABLE "UserPlant" DROP COLUMN "frequencyPer",
DROP COLUMN "frequencyTimes",
DROP COLUMN "light",
ADD COLUMN     "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "scheduleStartsOn" DATE,
ADD COLUMN     "wateringDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

