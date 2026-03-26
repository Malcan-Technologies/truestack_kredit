-- CreateEnum
CREATE TYPE "AttestationProposalSource" AS ENUM ('BORROWER', 'ADMIN_COUNTER');

-- CreateEnum
CREATE TYPE "AttestationCancellationReason" AS ENUM ('WITHDRAWN', 'REJECTED_AFTER_ATTESTATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttestationStatus" ADD VALUE 'SLOT_PROPOSED';
ALTER TYPE "AttestationStatus" ADD VALUE 'COUNTER_PROPOSED';
ALTER TYPE "AttestationStatus" ADD VALUE 'PROPOSAL_EXPIRED';

-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "attestationAssignedMemberId" TEXT,
ADD COLUMN     "attestationBorrowerProposalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "attestationCancellationReason" "AttestationCancellationReason",
ADD COLUMN     "attestationCancelledAt" TIMESTAMP(3),
ADD COLUMN     "attestationCancelledByUserId" TEXT,
ADD COLUMN     "attestationMeetingReminder24hSentAt" TIMESTAMP(3),
ADD COLUMN     "attestationProposalDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "attestationProposalEndAt" TIMESTAMP(3),
ADD COLUMN     "attestationProposalSource" "AttestationProposalSource",
ADD COLUMN     "attestationProposalStartAt" TIMESTAMP(3),
ADD COLUMN     "attestationVideoWatchedPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "attestationOfficeHoursJson" JSONB;

-- CreateIndex
CREATE INDEX "Loan_tenantId_attestationStatus_idx" ON "Loan"("tenantId", "attestationStatus");

-- CreateIndex
CREATE INDEX "Loan_attestationProposalDeadlineAt_idx" ON "Loan"("attestationProposalDeadlineAt");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_attestationAssignedMemberId_fkey" FOREIGN KEY ("attestationAssignedMemberId") REFERENCES "TenantMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
