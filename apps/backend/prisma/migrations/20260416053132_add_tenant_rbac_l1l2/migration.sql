-- Idempotent version: this migration may have partially applied in some
-- environments (e.g. when `verified` was added out-of-band), so guard each
-- DDL so re-running after a failed `prisma migrate deploy` succeeds.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "LoanChannel" AS ENUM ('ONLINE', 'PHYSICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'PENDING_L2_APPROVAL';

-- AlterTable
ALTER TABLE "LoanApplication"
    ADD COLUMN IF NOT EXISTS "l1DecisionNote" TEXT,
    ADD COLUMN IF NOT EXISTS "l1ReviewedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "l1ReviewedByMemberId" TEXT,
    ADD COLUMN IF NOT EXISTS "l2DecisionNote" TEXT,
    ADD COLUMN IF NOT EXISTS "l2ReviewedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "l2ReviewedByMemberId" TEXT,
    ADD COLUMN IF NOT EXISTS "loanChannel" "LoanChannel" NOT NULL DEFAULT 'PHYSICAL';

-- AlterTable
ALTER TABLE "TenantMember" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
ALTER TABLE "TenantMember" ALTER COLUMN "role" SET DEFAULT 'GENERAL_STAFF';

-- AlterTable
ALTER TABLE "TwoFactor" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TenantRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TenantRole_tenantId_idx" ON "TenantRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TenantRole_tenantId_key_key" ON "TenantRole"("tenantId", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TenantMember_roleId_idx" ON "TenantMember"("roleId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TenantRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TenantRole" ADD CONSTRAINT "TenantRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
