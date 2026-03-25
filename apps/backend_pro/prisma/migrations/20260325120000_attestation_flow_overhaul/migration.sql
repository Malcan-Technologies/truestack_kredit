-- CreateEnum
CREATE TYPE "LoanChannel" AS ENUM ('ONLINE', 'PHYSICAL');

-- AlterEnum
ALTER TYPE "AttestationCancellationReason" ADD VALUE 'PROPOSAL_REJECTED_BY_LENDER';

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN "loanChannel" "LoanChannel" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "loanChannel" "LoanChannel" NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "Loan" ADD COLUMN "attestationMeetingNotes" TEXT;
