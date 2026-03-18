-- Add structured address columns for borrower records
ALTER TABLE "Borrower"
ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "addressLine2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "postcode" TEXT,
ADD COLUMN "country" TEXT;

-- Backfill line 1 from existing legacy address fields
UPDATE "Borrower"
SET "addressLine1" = COALESCE("businessAddress", "address")
WHERE "addressLine1" IS NULL
  AND COALESCE("businessAddress", "address") IS NOT NULL;
