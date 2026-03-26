-- CreateEnum
CREATE TYPE "SignedAgreementReviewStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "signedAgreementReviewStatus" "SignedAgreementReviewStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Loan" ADD COLUMN "signedAgreementReviewedAt" TIMESTAMP(3);
ALTER TABLE "Loan" ADD COLUMN "signedAgreementReviewerMemberId" TEXT;
ALTER TABLE "Loan" ADD COLUMN "signedAgreementReviewNotes" TEXT;

-- Backfill: existing pending-disbursement loans with a signed agreement already on file
-- were uploaded under the old flow; treat as approved so disbursement is not blocked.
UPDATE "Loan"
SET
  "signedAgreementReviewStatus" = 'APPROVED',
  "signedAgreementReviewedAt" = COALESCE("agreementUploadedAt", "updatedAt")
WHERE
  "status" = 'PENDING_DISBURSEMENT'
  AND "agreementPath" IS NOT NULL
  AND "agreementVersion" > 0;
