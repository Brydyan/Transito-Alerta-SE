-- Rollback for 0017_users_password_identity.sql (T3.6)
-- Fails LOUDLY (never invents a UUID) if any device_uuid IS NULL row exists
-- on either table — proposal rollback step 3. Delete/backfill those rows by
-- hand before re-running this rollback if it aborts.

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE device_uuid IS NULL) THEN
    RAISE EXCEPTION '0017 rollback aborted: users has rows with device_uuid IS NULL — resolve them manually first';
  END IF;
  IF EXISTS (SELECT 1 FROM user_sessions WHERE device_uuid IS NULL) THEN
    RAISE EXCEPTION '0017 rollback aborted: user_sessions has rows with device_uuid IS NULL — resolve them manually first';
  END IF;
END $$;

ALTER TABLE user_sessions ALTER COLUMN device_uuid SET NOT NULL;
ALTER TABLE users         ALTER COLUMN device_uuid SET NOT NULL;

ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

COMMIT;
