-- CreateTable
CREATE TABLE "ApplicationGuarantor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationGuarantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanGuarantor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "borrowerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "companyName" TEXT,
    "documentType" TEXT NOT NULL DEFAULT 'IC',
    "icNumber" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "agreementGeneratedAt" TIMESTAMP(3),
    "agreementPath" TEXT,
    "agreementFilename" TEXT,
    "agreementOriginalName" TEXT,
    "agreementMimeType" TEXT,
    "agreementSize" INTEGER,
    "agreementUploadedAt" TIMESTAMP(3),
    "agreementVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanGuarantor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationGuarantor_tenantId_idx" ON "ApplicationGuarantor"("tenantId");

-- CreateIndex
CREATE INDEX "ApplicationGuarantor_applicationId_idx" ON "ApplicationGuarantor"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationGuarantor_borrowerId_idx" ON "ApplicationGuarantor"("borrowerId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationGuarantor_applicationId_borrowerId_key" ON "ApplicationGuarantor"("applicationId", "borrowerId");

-- CreateIndex
CREATE INDEX "LoanGuarantor_tenantId_idx" ON "LoanGuarantor"("tenantId");

-- CreateIndex
CREATE INDEX "LoanGuarantor_loanId_idx" ON "LoanGuarantor"("loanId");

-- CreateIndex
CREATE INDEX "LoanGuarantor_borrowerId_idx" ON "LoanGuarantor"("borrowerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanGuarantor_loanId_borrowerId_key" ON "LoanGuarantor"("loanId", "borrowerId");

-- AddForeignKey
ALTER TABLE "ApplicationGuarantor" ADD CONSTRAINT "ApplicationGuarantor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationGuarantor" ADD CONSTRAINT "ApplicationGuarantor_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationGuarantor" ADD CONSTRAINT "ApplicationGuarantor_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanGuarantor" ADD CONSTRAINT "LoanGuarantor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanGuarantor" ADD CONSTRAINT "LoanGuarantor_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanGuarantor" ADD CONSTRAINT "LoanGuarantor_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
