-- AlterTable
ALTER TABLE "BorrowerDirector" ADD COLUMN "isAuthorizedRepresentative" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: first director per borrower (lowest order, then id) is the authorized representative
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "borrowerId" ORDER BY "order" ASC, id ASC) AS rn
  FROM "BorrowerDirector"
)
UPDATE "BorrowerDirector" d
SET "isAuthorizedRepresentative" = true
FROM ranked r
WHERE d.id = r.id AND r.rn = 1;
