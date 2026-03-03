-- Referral eligibility now activates after first approved subscription payment,
-- not immediately at registration.

-- Alter default for new records
ALTER TABLE "Referral"
ALTER COLUMN "isEligible" SET DEFAULT false;

-- Backfill existing unpaid referrals to ineligible
UPDATE "Referral"
SET "isEligible" = false
WHERE "isPaid" = false;
