-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE 'IN_ARREARS';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dischargeNotes" TEXT,
ADD COLUMN     "repaymentRate" DECIMAL(5,2),
ADD COLUMN     "totalLateFees" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentAllocation" ADD COLUMN     "isEarlyPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lateFee" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_allocationId_key" ON "PaymentReceipt"("allocationId");

-- CreateIndex
CREATE INDEX "PaymentReceipt_tenantId_idx" ON "PaymentReceipt"("tenantId");

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PaymentAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
