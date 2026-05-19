-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "ssmFieldProvenance" JSONB;

-- CreateTable
CREATE TABLE "TrueSsmPull" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "usageType" TEXT NOT NULL,
    "usageId" TEXT,
    "requestRefNo" TEXT,
    "regNo" TEXT NOT NULL,
    "billedCredits" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "documentId" TEXT,
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrueSsmPull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrueSsmPull_idempotencyKey_key" ON "TrueSsmPull"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TrueSsmPull_tenantId_borrowerId_idx" ON "TrueSsmPull"("tenantId", "borrowerId");

-- CreateIndex
CREATE INDEX "TrueSsmPull_borrowerId_createdAt_idx" ON "TrueSsmPull"("borrowerId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrueSsmPull" ADD CONSTRAINT "TrueSsmPull_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrueSsmPull" ADD CONSTRAINT "TrueSsmPull_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrueSsmPull" ADD CONSTRAINT "TrueSsmPull_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BorrowerDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
