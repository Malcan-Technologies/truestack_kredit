-- CreateEnum
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('FREE', 'PAID');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "subscribedAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionAmount" INTEGER,
ADD COLUMN     "subscriptionStatus" "TenantSubscriptionStatus" NOT NULL DEFAULT 'FREE';
