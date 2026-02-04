-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "authorizedRepIc" TEXT,
ADD COLUMN     "authorizedRepName" TEXT,
ADD COLUMN     "borrowerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "businessAddress" TEXT,
ADD COLUMN     "companyEmail" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "companyPhone" TEXT,
ADD COLUMN     "dateOfIncorporation" TIMESTAMP(3),
ADD COLUMN     "natureOfBusiness" TEXT,
ADD COLUMN     "numberOfEmployees" INTEGER,
ADD COLUMN     "paidUpCapital" DECIMAL(14,2),
ADD COLUMN     "ssmRegistrationNo" TEXT;

-- CreateTable
CREATE TABLE "BorrowerDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BorrowerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BorrowerDocument_tenantId_idx" ON "BorrowerDocument"("tenantId");

-- CreateIndex
CREATE INDEX "BorrowerDocument_borrowerId_idx" ON "BorrowerDocument"("borrowerId");

-- CreateIndex
CREATE INDEX "Borrower_borrowerType_idx" ON "Borrower"("borrowerType");

-- AddForeignKey
ALTER TABLE "BorrowerDocument" ADD CONSTRAINT "BorrowerDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerDocument" ADD CONSTRAINT "BorrowerDocument_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
