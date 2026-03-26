-- CreateTable
CREATE TABLE "BorrowerProfileLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BorrowerProfileLink_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "activeBorrowerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BorrowerProfileLink_userId_borrowerId_key" ON "BorrowerProfileLink"("userId", "borrowerId");

-- CreateIndex
CREATE INDEX "BorrowerProfileLink_userId_idx" ON "BorrowerProfileLink"("userId");

-- CreateIndex
CREATE INDEX "BorrowerProfileLink_tenantId_idx" ON "BorrowerProfileLink"("tenantId");

-- CreateIndex
CREATE INDEX "BorrowerProfileLink_borrowerId_idx" ON "BorrowerProfileLink"("borrowerId");

-- CreateIndex
CREATE INDEX "Session_activeBorrowerId_idx" ON "Session"("activeBorrowerId");

-- AddForeignKey
ALTER TABLE "BorrowerProfileLink" ADD CONSTRAINT "BorrowerProfileLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerProfileLink" ADD CONSTRAINT "BorrowerProfileLink_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerProfileLink" ADD CONSTRAINT "BorrowerProfileLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeBorrowerId_fkey" FOREIGN KEY ("activeBorrowerId") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;
