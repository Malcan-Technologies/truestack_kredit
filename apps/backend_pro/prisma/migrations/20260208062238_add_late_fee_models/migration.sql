-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "arrearsLetterPath" TEXT,
ADD COLUMN     "arrearsStartDate" TIMESTAMP(3),
ADD COLUMN     "defaultLetterPath" TEXT,
ADD COLUMN     "defaultReadyDate" TIMESTAMP(3),
ADD COLUMN     "readyForDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LoanRepayment" ADD COLUMN     "lateFeeAccrued" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lateFeesPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LateFeeEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "repaymentId" TEXT NOT NULL,
    "accrualDate" TIMESTAMP(3) NOT NULL,
    "daysOverdue" INTEGER NOT NULL,
    "outstandingAmount" DECIMAL(12,2) NOT NULL,
    "dailyRate" DECIMAL(10,8) NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateFeeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateFeeProcessingLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "loansProcessed" INTEGER NOT NULL DEFAULT 0,
    "feesCalculated" INTEGER NOT NULL DEFAULT 0,
    "totalFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "arrearsLetters" INTEGER NOT NULL DEFAULT 0,
    "processingTimeMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateFeeProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LateFeeEntry_tenantId_idx" ON "LateFeeEntry"("tenantId");

-- CreateIndex
CREATE INDEX "LateFeeEntry_loanId_idx" ON "LateFeeEntry"("loanId");

-- CreateIndex
CREATE INDEX "LateFeeEntry_repaymentId_idx" ON "LateFeeEntry"("repaymentId");

-- CreateIndex
CREATE INDEX "LateFeeEntry_accrualDate_idx" ON "LateFeeEntry"("accrualDate");

-- CreateIndex
CREATE UNIQUE INDEX "LateFeeEntry_repaymentId_accrualDate_key" ON "LateFeeEntry"("repaymentId", "accrualDate");

-- CreateIndex
CREATE INDEX "LateFeeProcessingLog_processedAt_idx" ON "LateFeeProcessingLog"("processedAt");

-- CreateIndex
CREATE INDEX "LateFeeProcessingLog_trigger_idx" ON "LateFeeProcessingLog"("trigger");

-- AddForeignKey
ALTER TABLE "LateFeeEntry" ADD CONSTRAINT "LateFeeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFeeEntry" ADD CONSTRAINT "LateFeeEntry_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFeeEntry" ADD CONSTRAINT "LateFeeEntry_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "LoanRepayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
