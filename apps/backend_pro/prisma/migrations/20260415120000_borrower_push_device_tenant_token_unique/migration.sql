-- Drop global unique on token only; enforce uniqueness per tenant for multi-tenant isolation.
DROP INDEX IF EXISTS "BorrowerPushDevice_token_key";

CREATE UNIQUE INDEX "BorrowerPushDevice_tenantId_token_key" ON "BorrowerPushDevice"("tenantId", "token");
