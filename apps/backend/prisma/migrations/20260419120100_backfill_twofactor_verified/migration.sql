-- Backfill Better Auth 2FA rows created before `TwoFactor.verified` existed.
-- If a user is already marked twoFactorEnabled=true, their existing TwoFactor secrets
-- should be treated as verified so cross-app TOTP challenges work.
UPDATE "TwoFactor" AS tf
SET "verified" = TRUE
FROM "User" AS u
WHERE tf."userId" = u."id"
  AND u."twoFactorEnabled" = TRUE
  AND tf."verified" = FALSE;
