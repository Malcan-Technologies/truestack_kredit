-- CreateTable: TrueIdentityUsagePaid
-- Records which TrueIdentity usage days were covered by a paid invoice.
-- Prevents double-charging when usage spans invoice periods.

CREATE TABLE "TrueIdentityUsagePaid" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrueIdentityUsagePaid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrueIdentityUsagePaid_tenantId_invoiceId_usageDate_key" ON "TrueIdentityUsagePaid"("tenantId", "invoiceId", "usageDate");

-- CreateIndex
CREATE INDEX "TrueIdentityUsagePaid_tenantId_idx" ON "TrueIdentityUsagePaid"("tenantId");

-- CreateIndex
CREATE INDEX "TrueIdentityUsagePaid_tenantId_usageDate_idx" ON "TrueIdentityUsagePaid"("tenantId", "usageDate");

-- AddForeignKey
ALTER TABLE "TrueIdentityUsagePaid" ADD CONSTRAINT "TrueIdentityUsagePaid_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrueIdentityUsagePaid" ADD CONSTRAINT "TrueIdentityUsagePaid_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
