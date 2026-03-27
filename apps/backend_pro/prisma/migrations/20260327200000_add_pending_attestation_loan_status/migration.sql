-- AlterEnum: add value only. PostgreSQL forbids using a new enum value in the same transaction as ADD VALUE;
-- backfill runs in a separate migration (20260327200001_*).
ALTER TYPE "LoanStatus" ADD VALUE 'PENDING_ATTESTATION';
