-- 0017_users_password_identity.sql
-- Transito Alerta SE — password identity groundwork (T3.6)
-- MANUAL EXECUTION ONLY. Requires 0010 (users.email) to have been applied
-- first. Additive/relaxing ALTER only — no data is deleted, no existing
-- row's device_uuid is touched.
-- Rollback: database/rollback/0017_users_password_identity.DOWN.sql

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'users' AND column_name = 'email') THEN
    RAISE EXCEPTION '0017 requires 0010 (users.email) to have been applied first';
  END IF;
END $$;

-- bcrypt $2b$12$... ; NULL = device-only account (D7).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash char(60);

-- Identity moves to email for password-identity users. users_device_uuid_key
-- is KEPT (D7) — Postgres UNIQUE permits unlimited NULLs, so password-only
-- users coexist while two real devices still cannot share a uuid.
ALTER TABLE users        ALTER COLUMN device_uuid DROP NOT NULL;

-- 0006:29 had user_sessions.device_uuid NOT NULL — without relaxing this,
-- every password login 500s on the session INSERT (design D7).
ALTER TABLE user_sessions ALTER COLUMN device_uuid DROP NOT NULL;

COMMIT;
