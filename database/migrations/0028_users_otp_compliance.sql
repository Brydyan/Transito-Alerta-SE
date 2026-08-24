-- T6.5 — Add OTP verification and compliance columns to users
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS verification_otp VARCHAR(64) NULL, -- stores SHA-256 hex hash (64 chars), not plain OTP
  ADD COLUMN IF NOT EXISTS verification_otp_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Index for fast unverified user lookups
CREATE INDEX IF NOT EXISTS idx_users_email_verified_at
  ON users (email_verified_at)
  WHERE email_verified_at IS NULL;

-- Index for soft-deleted user lookup (T6.8 GDPR)
CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON users (deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;
