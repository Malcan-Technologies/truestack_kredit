-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN "trueIdentityStatus" TEXT,
ADD COLUMN "trueIdentityResult" TEXT,
ADD COLUMN "trueIdentitySessionId" TEXT,
ADD COLUMN "trueIdentityOnboardingUrl" TEXT,
ADD COLUMN "trueIdentityExpiresAt" TIMESTAMP(3),
ADD COLUMN "trueIdentityLastWebhookAt" TIMESTAMP(3),
ADD COLUMN "trueIdentityRejectMessage" TEXT;

-- CreateTable
CREATE TABLE "TrueIdentitySession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "adminSessionId" TEXT NOT NULL,
    "onboardingUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "rejectMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrueIdentitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrueIdentityWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "signatureHeader" TEXT,
    "timestampHeader" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrueIdentityWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrueIdentityUsageDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrueIdentityUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrueIdentitySession_adminSessionId_key" ON "TrueIdentitySession"("adminSessionId");

-- CreateIndex
CREATE INDEX "TrueIdentitySession_tenantId_idx" ON "TrueIdentitySession"("tenantId");

-- CreateIndex
CREATE INDEX "TrueIdentitySession_borrowerId_idx" ON "TrueIdentitySession"("borrowerId");

-- CreateIndex
CREATE INDEX "TrueIdentitySession_status_idx" ON "TrueIdentitySession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrueIdentityWebhookEvent_idempotencyKey_key" ON "TrueIdentityWebhookEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TrueIdentityWebhookEvent_tenantId_idx" ON "TrueIdentityWebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "TrueIdentityWebhookEvent_status_idx" ON "TrueIdentityWebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrueIdentityUsageDaily_tenantId_usageDate_key" ON "TrueIdentityUsageDaily"("tenantId", "usageDate");

-- CreateIndex
CREATE INDEX "TrueIdentityUsageDaily_tenantId_idx" ON "TrueIdentityUsageDaily"("tenantId");

-- CreateIndex
CREATE INDEX "TrueIdentityUsageDaily_usageDate_idx" ON "TrueIdentityUsageDaily"("usageDate");

-- AddForeignKey
ALTER TABLE "TrueIdentitySession" ADD CONSTRAINT "TrueIdentitySession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrueIdentitySession" ADD CONSTRAINT "TrueIdentitySession_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrueIdentityWebhookEvent" ADD CONSTRAINT "TrueIdentityWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrueIdentityUsageDaily" ADD CONSTRAINT "TrueIdentityUsageDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
