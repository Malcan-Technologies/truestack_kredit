-- TrueKredit Pro: remove SaaS subscription / invoicing / add-on purchase tables.
-- Tenants are licensed for full product access; see Tenant.proLicenseActivatedAt.

-- Drop dependent tables first (FK order)
DROP TABLE IF EXISTS "TrueIdentityUsagePaid" CASCADE;
DROP TABLE IF EXISTS "InvoiceLineItem" CASCADE;
DROP TABLE IF EXISTS "Receipt" CASCADE;
DROP TABLE IF EXISTS "CreditNote" CASCADE;
DROP TABLE IF EXISTS "SubscriptionPaymentRequest" CASCADE;
DROP TABLE IF EXISTS "Invoice" CASCADE;
DROP TABLE IF EXISTS "InvoiceSequence" CASCADE;
DROP TABLE IF EXISTS "BillingEvent" CASCADE;
DROP TABLE IF EXISTS "BillingRunLog" CASCADE;
DROP TABLE IF EXISTS "Subscription" CASCADE;
DROP TABLE IF EXISTS "TenantAddOn" CASCADE;

-- Tenant: drop subscription billing columns, add Pro license timestamp
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "subscriptionStatus";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "subscriptionAmount";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "subscribedAt";
ALTER TABLE "Tenant" ADD COLUMN "proLicenseActivatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Tenant" ADD COLUMN "truesendSettings" JSONB;

-- Enums only used by removed models
DROP TYPE IF EXISTS "SubscriptionStatus" CASCADE;
DROP TYPE IF EXISTS "TenantSubscriptionStatus" CASCADE;
DROP TYPE IF EXISTS "InvoiceStatus" CASCADE;
DROP TYPE IF EXISTS "BillingType" CASCADE;
DROP TYPE IF EXISTS "BillingEventType" CASCADE;
DROP TYPE IF EXISTS "SubscriptionPaymentRequestStatus" CASCADE;
