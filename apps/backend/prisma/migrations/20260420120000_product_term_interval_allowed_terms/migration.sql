-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "termInterval" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "allowedTerms" JSONB NOT NULL DEFAULT '[]';

-- Enforce minimum 2-month tenure (no 1-month-only products)
UPDATE "Product" SET "minTerm" = 2 WHERE "minTerm" < 2;
UPDATE "Product" SET "maxTerm" = GREATEST("maxTerm", 2) WHERE "maxTerm" < 2;
