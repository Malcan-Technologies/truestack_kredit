-- AlterEnum
ALTER TYPE "AttestationStatus" ADD VALUE 'MEETING_COMPLETED';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "attestationMeetingAdminCompletedAt" TIMESTAMP(3),
ADD COLUMN "attestationTermsAcceptedAt" TIMESTAMP(3);
