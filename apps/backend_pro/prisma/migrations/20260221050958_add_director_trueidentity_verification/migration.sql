-- AlterTable
ALTER TABLE "BorrowerDirector" ADD COLUMN     "trueIdentityExpiresAt" TIMESTAMP(3),
ADD COLUMN     "trueIdentityLastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "trueIdentityOnboardingUrl" TEXT,
ADD COLUMN     "trueIdentityRejectMessage" TEXT,
ADD COLUMN     "trueIdentityResult" TEXT,
ADD COLUMN     "trueIdentitySessionId" TEXT,
ADD COLUMN     "trueIdentityStatus" TEXT;

-- AlterTable
ALTER TABLE "TrueIdentitySession" ADD COLUMN     "directorId" TEXT;

-- CreateIndex
CREATE INDEX "TrueIdentitySession_directorId_idx" ON "TrueIdentitySession"("directorId");
