-- Backfill: ONLINE loans still in pre-attestation phase were stored as PENDING_DISBURSEMENT.
-- Must run after 20260327200000 so the new enum value is committed.
UPDATE "Loan"
SET status = 'PENDING_ATTESTATION'::"LoanStatus"
WHERE "loanChannel" = 'ONLINE'
  AND status = 'PENDING_DISBURSEMENT'::"LoanStatus"
  AND "attestationCompletedAt" IS NULL;
