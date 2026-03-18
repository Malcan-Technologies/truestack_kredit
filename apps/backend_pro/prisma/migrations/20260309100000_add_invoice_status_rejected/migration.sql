-- Add REJECTED to InvoiceStatus enum (when payment approval is rejected)
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
