-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "eligibleBorrowerTypes" TEXT NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "loanScheduleType" TEXT NOT NULL DEFAULT 'JADUAL_J';
