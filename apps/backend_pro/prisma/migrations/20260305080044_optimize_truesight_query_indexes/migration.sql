-- CreateIndex
CREATE INDEX "Borrower_borrowerType_icNumber_idx" ON "Borrower"("borrowerType", "icNumber");

-- CreateIndex
CREATE INDEX "Borrower_borrowerType_ssmRegistrationNo_idx" ON "Borrower"("borrowerType", "ssmRegistrationNo");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_disbursementDate_tenantId_idx" ON "Loan"("borrowerId", "disbursementDate", "tenantId");

-- CreateIndex
CREATE INDEX "LoanApplication_borrowerId_idx" ON "LoanApplication"("borrowerId");
