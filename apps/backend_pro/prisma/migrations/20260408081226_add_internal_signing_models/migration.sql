-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "agreementSignatureFields" JSONB;

-- CreateTable
CREATE TABLE "StaffSigningProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "icNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'MY',
    "documentType" TEXT NOT NULL DEFAULT 'MYKAD',
    "designation" TEXT,
    "certSerialNo" TEXT,
    "certStatus" TEXT,
    "certValidFrom" TIMESTAMP(3),
    "certValidTo" TIMESTAMP(3),
    "kycComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSigningProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffKycSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "externalSessionId" TEXT NOT NULL,
    "onboardingUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "rejectMessage" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffKycSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInternalSignature" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerIc" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signaturePath" TEXT,
    "agreementVersion" INTEGER NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "x1" DOUBLE PRECISION NOT NULL,
    "y1" DOUBLE PRECISION NOT NULL,
    "x2" DOUBLE PRECISION NOT NULL,
    "y2" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LoanInternalSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffSigningProfile_tenantId_idx" ON "StaffSigningProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSigningProfile_tenantId_userId_key" ON "StaffSigningProfile"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSigningProfile_tenantId_icNumber_key" ON "StaffSigningProfile"("tenantId", "icNumber");

-- CreateIndex
CREATE INDEX "StaffDocument_profileId_idx" ON "StaffDocument"("profileId");

-- CreateIndex
CREATE INDEX "StaffDocument_tenantId_idx" ON "StaffDocument"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffKycSession_externalSessionId_key" ON "StaffKycSession"("externalSessionId");

-- CreateIndex
CREATE INDEX "StaffKycSession_tenantId_idx" ON "StaffKycSession"("tenantId");

-- CreateIndex
CREATE INDEX "StaffKycSession_profileId_idx" ON "StaffKycSession"("profileId");

-- CreateIndex
CREATE INDEX "LoanInternalSignature_loanId_idx" ON "LoanInternalSignature"("loanId");

-- CreateIndex
CREATE INDEX "LoanInternalSignature_tenantId_idx" ON "LoanInternalSignature"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInternalSignature_loanId_role_key" ON "LoanInternalSignature"("loanId", "role");

-- AddForeignKey
ALTER TABLE "StaffSigningProfile" ADD CONSTRAINT "StaffSigningProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSigningProfile" ADD CONSTRAINT "StaffSigningProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StaffSigningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffKycSession" ADD CONSTRAINT "StaffKycSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffKycSession" ADD CONSTRAINT "StaffKycSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StaffSigningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInternalSignature" ADD CONSTRAINT "LoanInternalSignature_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInternalSignature" ADD CONSTRAINT "LoanInternalSignature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInternalSignature" ADD CONSTRAINT "LoanInternalSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
