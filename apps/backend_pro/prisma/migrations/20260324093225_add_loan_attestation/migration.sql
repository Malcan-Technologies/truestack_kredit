-- CreateEnum
CREATE TYPE "AttestationStatus" AS ENUM ('NOT_STARTED', 'VIDEO_COMPLETED', 'MEETING_REQUESTED', 'MEETING_SCHEDULED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "attestationCompletedAt" TIMESTAMP(3),
ADD COLUMN     "attestationGoogleCalendarEventId" TEXT,
ADD COLUMN     "attestationMeetingEndAt" TIMESTAMP(3),
ADD COLUMN     "attestationMeetingLink" TEXT,
ADD COLUMN     "attestationMeetingRequestedAt" TIMESTAMP(3),
ADD COLUMN     "attestationMeetingScheduledAt" TIMESTAMP(3),
ADD COLUMN     "attestationMeetingStartAt" TIMESTAMP(3),
ADD COLUMN     "attestationStatus" "AttestationStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "attestationVideoCompletedAt" TIMESTAMP(3);

-- Grandfather existing pending-disbursement loans so agreement/signing/disbursement keeps working
UPDATE "Loan"
SET
  "attestationStatus" = 'COMPLETED',
  "attestationCompletedAt" = COALESCE("updatedAt", "createdAt")
WHERE "status" = 'PENDING_DISBURSEMENT';
