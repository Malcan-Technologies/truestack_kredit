-- CreateTable
CREATE TABLE "TruestackKycSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "directorId" TEXT,
    "externalSessionId" TEXT NOT NULL,
    "onboardingUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "rejectMessage" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TruestackKycSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TruestackKycSession_externalSessionId_key" ON "TruestackKycSession"("externalSessionId");

-- CreateIndex
CREATE INDEX "TruestackKycSession_tenantId_idx" ON "TruestackKycSession"("tenantId");

-- CreateIndex
CREATE INDEX "TruestackKycSession_borrowerId_idx" ON "TruestackKycSession"("borrowerId");

-- CreateIndex
CREATE INDEX "TruestackKycSession_borrowerId_directorId_idx" ON "TruestackKycSession"("borrowerId", "directorId");

-- AddForeignKey
ALTER TABLE "TruestackKycSession" ADD CONSTRAINT "TruestackKycSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruestackKycSession" ADD CONSTRAINT "TruestackKycSession_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruestackKycSession" ADD CONSTRAINT "TruestackKycSession_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "BorrowerDirector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
