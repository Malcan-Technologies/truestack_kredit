-- CreateTable
CREATE TABLE "PaymentIdempotency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminderDispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "repaymentId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "reminderDateMYT" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentIdempotency_tenantId_createdAt_idx" ON "PaymentIdempotency"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIdempotency_status_idx" ON "PaymentIdempotency"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIdempotency_tenantId_endpoint_idempotencyKey_key" ON "PaymentIdempotency"("tenantId", "endpoint", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentReminderDispatch_tenantId_reminderDateMYT_idx" ON "PaymentReminderDispatch"("tenantId", "reminderDateMYT");

-- CreateIndex
CREATE INDEX "PaymentReminderDispatch_loanId_repaymentId_idx" ON "PaymentReminderDispatch"("loanId", "repaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminderDispatch_tenantId_loanId_repaymentId_reminde_key" ON "PaymentReminderDispatch"("tenantId", "loanId", "repaymentId", "reminderType", "reminderDateMYT");
