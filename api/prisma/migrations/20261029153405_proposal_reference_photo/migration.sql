-- AlterTable
ALTER TABLE "AiProposal" ADD COLUMN     "referenceAuthor" TEXT,
ADD COLUMN     "referenceKey" TEXT,
ADD COLUMN     "referenceLicense" TEXT,
ADD COLUMN     "referenceSource" TEXT,
ADD COLUMN     "referenceStatus" TEXT NOT NULL DEFAULT 'none';
