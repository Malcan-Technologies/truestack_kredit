-- CreateTable
CREATE TABLE "BorrowerPerformanceProjection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'NO_HISTORY',
    "onTimeRate" DECIMAL(5,2),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalLoans" INTEGER NOT NULL DEFAULT 0,
    "activeLoans" INTEGER NOT NULL DEFAULT 0,
    "inArrearsLoans" INTEGER NOT NULL DEFAULT 0,
    "defaultedLoans" INTEGER NOT NULL DEFAULT 0,
    "completedLoans" INTEGER NOT NULL DEFAULT 0,
    "writtenOffLoans" INTEGER NOT NULL DEFAULT 0,
    "pendingDisbursementLoans" INTEGER NOT NULL DEFAULT 0,
    "readyForDefaultLoans" INTEGER NOT NULL DEFAULT 0,
    "paidOnTimeCount" INTEGER NOT NULL DEFAULT 0,
    "paidLateCount" INTEGER NOT NULL DEFAULT 0,
    "overdueCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerPerformanceProjection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BorrowerPerformanceProjection_borrowerId_key" ON "BorrowerPerformanceProjection"("borrowerId");

-- CreateIndex
CREATE INDEX "BorrowerPerformanceProjection_tenantId_idx" ON "BorrowerPerformanceProjection"("tenantId");

-- CreateIndex
CREATE INDEX "BorrowerPerformanceProjection_riskLevel_idx" ON "BorrowerPerformanceProjection"("riskLevel");

-- CreateIndex
CREATE INDEX "BorrowerPerformanceProjection_onTimeRate_idx" ON "BorrowerPerformanceProjection"("onTimeRate");

-- AddForeignKey
ALTER TABLE "BorrowerPerformanceProjection" ADD CONSTRAINT "BorrowerPerformanceProjection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerPerformanceProjection" ADD CONSTRAINT "BorrowerPerformanceProjection_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
