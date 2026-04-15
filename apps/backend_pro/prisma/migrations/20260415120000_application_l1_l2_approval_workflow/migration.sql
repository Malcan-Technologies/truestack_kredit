-- AlterEnum: add PENDING_L2_APPROVAL to ApplicationStatus
ALTER TYPE "ApplicationStatus" ADD VALUE 'PENDING_L2_APPROVAL';

-- LoanApplication L1/L2 review metadata
ALTER TABLE "LoanApplication" ADD COLUMN "l1ReviewedAt" TIMESTAMP(3);
ALTER TABLE "LoanApplication" ADD COLUMN "l1ReviewedByMemberId" TEXT;
ALTER TABLE "LoanApplication" ADD COLUMN "l1DecisionNote" TEXT;
ALTER TABLE "LoanApplication" ADD COLUMN "l2ReviewedAt" TIMESTAMP(3);
ALTER TABLE "LoanApplication" ADD COLUMN "l2ReviewedByMemberId" TEXT;
ALTER TABLE "LoanApplication" ADD COLUMN "l2DecisionNote" TEXT;
