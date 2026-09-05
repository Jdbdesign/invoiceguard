-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "businessEmail" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "businessPhone" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);
