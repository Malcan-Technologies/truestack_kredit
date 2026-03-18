-- CreateEnum
CREATE TYPE "SubscriptionPaymentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SubscriptionPaymentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "requestId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "amountMyr" DECIMAL(12,2) NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionPaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAddOns" JSONB,
    "requestPayload" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "decisionMetadata" JSONB,
    "decisionReceivedAt" TIMESTAMP(3),
    "webhookDispatchedAt" TIMESTAMP(3),
    "webhookDelivered" BOOLEAN NOT NULL DEFAULT false,
    "webhookError" TEXT,

    CONSTRAINT "SubscriptionPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPaymentRequest_requestId_key" ON "SubscriptionPaymentRequest"("requestId");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_tenantId_status_idx" ON "SubscriptionPaymentRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_tenantId_requestedAt_idx" ON "SubscriptionPaymentRequest"("tenantId", "requestedAt");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_invoiceId_idx" ON "SubscriptionPaymentRequest"("invoiceId");

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentRequest" ADD CONSTRAINT "SubscriptionPaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentRequest" ADD CONSTRAINT "SubscriptionPaymentRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
