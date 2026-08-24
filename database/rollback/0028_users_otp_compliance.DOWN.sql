-- Rollback T6.5 — Remove OTP/compliance columns from users
BEGIN;

DROP INDEX IF EXISTS idx_users_email_verified_at;
DROP INDEX IF EXISTS idx_users_deleted_at;

ALTER TABLE users
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS verification_otp,
  DROP COLUMN IF EXISTS verification_otp_expires_at,
  DROP COLUMN IF EXISTS terms_accepted_at,
  DROP COLUMN IF EXISTS terms_version,
  DROP COLUMN IF EXISTS deleted_at;

COMMIT;
