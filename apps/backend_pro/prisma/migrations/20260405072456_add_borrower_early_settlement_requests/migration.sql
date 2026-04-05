-- CreateEnum
CREATE TYPE "BorrowerEarlySettlementRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "BorrowerEarlySettlementRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "status" "BorrowerEarlySettlementRequestStatus" NOT NULL DEFAULT 'PENDING',
    "snapshotEligible" BOOLEAN NOT NULL,
    "snapshotReason" TEXT,
    "snapshotTotalSettlement" DECIMAL(12,2),
    "snapshotTotalWithoutLateFees" DECIMAL(12,2),
    "snapshotOutstandingLateFees" DECIMAL(12,2),
    "snapshotDiscountAmount" DECIMAL(12,2),
    "snapshotRemainingPrincipal" DECIMAL(12,2),
    "snapshotRemainingInterest" DECIMAL(12,2),
    "snapshotUnpaidInstallments" INTEGER,
    "borrowerNote" VARCHAR(1000),
    "reference" VARCHAR(200),
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByMemberId" TEXT,
    "paymentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerEarlySettlementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BorrowerEarlySettlementRequest_paymentTransactionId_key" ON "BorrowerEarlySettlementRequest"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "BorrowerEarlySettlementRequest_tenantId_idx" ON "BorrowerEarlySettlementRequest"("tenantId");

-- CreateIndex
CREATE INDEX "BorrowerEarlySettlementRequest_loanId_idx" ON "BorrowerEarlySettlementRequest"("loanId");

-- CreateIndex
CREATE INDEX "BorrowerEarlySettlementRequest_borrowerId_idx" ON "BorrowerEarlySettlementRequest"("borrowerId");

-- CreateIndex
CREATE INDEX "BorrowerEarlySettlementRequest_status_idx" ON "BorrowerEarlySettlementRequest"("status");

-- CreateIndex
CREATE INDEX "BorrowerEarlySettlementRequest_tenantId_status_idx" ON "BorrowerEarlySettlementRequest"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "BorrowerEarlySettlementRequest" ADD CONSTRAINT "BorrowerEarlySettlementRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerEarlySettlementRequest" ADD CONSTRAINT "BorrowerEarlySettlementRequest_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerEarlySettlementRequest" ADD CONSTRAINT "BorrowerEarlySettlementRequest_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerEarlySettlementRequest" ADD CONSTRAINT "BorrowerEarlySettlementRequest_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
