-- CreateTable: PaymentTransaction
-- This table stores payment transactions with auto-generated receipts
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptNumber" TEXT,
    "receiptPath" TEXT,
    "receiptGenAt" TIMESTAMP(3),
    "proofFilename" TEXT,
    "proofOriginalName" TEXT,
    "proofMimeType" TEXT,
    "proofSize" INTEGER,
    "proofPath" TEXT,
    "proofUploadedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_receiptNumber_key" ON "PaymentTransaction"("receiptNumber");
CREATE INDEX "PaymentTransaction_tenantId_idx" ON "PaymentTransaction"("tenantId");
CREATE INDEX "PaymentTransaction_loanId_idx" ON "PaymentTransaction"("loanId");
CREATE INDEX "PaymentTransaction_receiptNumber_idx" ON "PaymentTransaction"("receiptNumber");

-- Add transactionId to PaymentAllocation (optional for backward compatibility)
ALTER TABLE "PaymentAllocation" ADD COLUMN "transactionId" TEXT;

-- CreateIndex for transactionId
CREATE INDEX "PaymentAllocation_transactionId_idx" ON "PaymentAllocation"("transactionId");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old PaymentReceipt table (no longer needed, data moved to PaymentTransaction)
DROP TABLE IF EXISTS "PaymentReceipt";
