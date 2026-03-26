-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('FIRST_SUBSCRIPTION', 'ADDON_PURCHASE', 'RENEWAL');

-- AlterEnum
ALTER TYPE "TenantSubscriptionStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';
ALTER TYPE "TenantSubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

-- AlterEnum
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RENEWED';
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'OVERDUE_MARKED';
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'TENANT_SUSPENDED';
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'TENANT_REACTIVATED';
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE_ISSUED';
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'REFUND_PROCESSED';
ALTER TYPE "BillingEventType" ADD VALUE IF NOT EXISTS 'CANCELLATION_PROCESSED';

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "sequenceNumber" INTEGER,
ADD COLUMN "billingType" "BillingType",
ADD COLUMN "lineItemsSnapshot" JSONB;

-- AlterTable
ALTER TABLE "SubscriptionPaymentRequest"
ADD COLUMN "billingType" "BillingType",
ADD COLUMN "lineItems" JSONB;

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceInvoiceId" TEXT NOT NULL,
    "appliedToInvoiceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "isRefunded" BOOLEAN NOT NULL DEFAULT false,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRunLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "backfillFrom" TIMESTAMP(3),
    "tenantsProcessed" INTEGER NOT NULL DEFAULT 0,
    "invoicesCreated" INTEGER NOT NULL DEFAULT 0,
    "approvalsApplied" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_tenantId_periodStart_idx" ON "Invoice"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_sequenceNumber_idx" ON "Invoice"("tenantId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_itemType_idx" ON "InvoiceLineItem"("itemType");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_tenantId_yearMonth_key" ON "InvoiceSequence"("tenantId", "yearMonth");

-- CreateIndex
CREATE INDEX "InvoiceSequence_tenantId_idx" ON "InvoiceSequence"("tenantId");

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_idx" ON "CreditNote"("tenantId");

-- CreateIndex
CREATE INDEX "CreditNote_sourceInvoiceId_idx" ON "CreditNote"("sourceInvoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_appliedToInvoiceId_idx" ON "CreditNote"("appliedToInvoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_isRefunded_idx" ON "CreditNote"("isRefunded");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_appliedToInvoiceId_fkey" FOREIGN KEY ("appliedToInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
