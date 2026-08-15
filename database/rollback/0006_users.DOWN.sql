-- Rollback for 0006_users.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.

BEGIN;

DROP TABLE IF EXISTS user_sessions;

ALTER TABLE users
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS avatar_url,
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS organization_id;

COMMIT;
