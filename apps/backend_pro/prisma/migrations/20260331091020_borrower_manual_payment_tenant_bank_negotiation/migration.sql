-- CreateEnum
CREATE TYPE "BorrowerManualPaymentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LoanApplicationOfferParty" AS ENUM ('ADMIN', 'BORROWER');

-- CreateEnum
CREATE TYPE "LoanApplicationOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "lenderAccountHolderName" TEXT,
ADD COLUMN     "lenderAccountNumber" TEXT,
ADD COLUMN     "lenderBankCode" TEXT,
ADD COLUMN     "lenderBankOtherName" TEXT;

-- CreateTable
CREATE TABLE "LoanApplicationOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "term" INTEGER NOT NULL,
    "fromParty" "LoanApplicationOfferParty" NOT NULL,
    "status" "LoanApplicationOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LoanApplicationOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorrowerManualPaymentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "BorrowerManualPaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "receiptPath" TEXT,
    "receiptFilename" TEXT,
    "receiptOriginalName" TEXT,
    "receiptMimeType" TEXT,
    "receiptSize" INTEGER,
    "paymentTransactionId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerManualPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoanApplicationOffer_tenantId_idx" ON "LoanApplicationOffer"("tenantId");

-- CreateIndex
CREATE INDEX "LoanApplicationOffer_applicationId_idx" ON "LoanApplicationOffer"("applicationId");

-- CreateIndex
CREATE INDEX "LoanApplicationOffer_applicationId_status_idx" ON "LoanApplicationOffer"("applicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BorrowerManualPaymentRequest_paymentTransactionId_key" ON "BorrowerManualPaymentRequest"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "BorrowerManualPaymentRequest_tenantId_idx" ON "BorrowerManualPaymentRequest"("tenantId");

-- CreateIndex
CREATE INDEX "BorrowerManualPaymentRequest_loanId_idx" ON "BorrowerManualPaymentRequest"("loanId");

-- CreateIndex
CREATE INDEX "BorrowerManualPaymentRequest_borrowerId_idx" ON "BorrowerManualPaymentRequest"("borrowerId");

-- CreateIndex
CREATE INDEX "BorrowerManualPaymentRequest_status_idx" ON "BorrowerManualPaymentRequest"("status");

-- CreateIndex
CREATE INDEX "BorrowerManualPaymentRequest_tenantId_status_idx" ON "BorrowerManualPaymentRequest"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "LoanApplicationOffer" ADD CONSTRAINT "LoanApplicationOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanApplicationOffer" ADD CONSTRAINT "LoanApplicationOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerManualPaymentRequest" ADD CONSTRAINT "BorrowerManualPaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerManualPaymentRequest" ADD CONSTRAINT "BorrowerManualPaymentRequest_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerManualPaymentRequest" ADD CONSTRAINT "BorrowerManualPaymentRequest_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerManualPaymentRequest" ADD CONSTRAINT "BorrowerManualPaymentRequest_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
