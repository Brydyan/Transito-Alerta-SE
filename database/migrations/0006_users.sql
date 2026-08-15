-- 0006_users.sql
-- Transito Alerta SE — users profile columns + user_sessions (T2.3)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (users) to have been applied first.
--
-- NOTE: tasks.md's explicit renumbering only called out incidents=0004,
-- comments=0005, assignments=0006 ("etc."). Users (T2.3) also needs a
-- migration and lands between comments and assignments in build order, so
-- it takes 0006 and assignments is pushed to 0007. See apply-progress for
-- the full reconciliation.
--
-- Rollback: database/rollback/0006_users.DOWN.sql

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name      varchar(255),
  ADD COLUMN IF NOT EXISTS last_name       varchar(255),
  ADD COLUMN IF NOT EXISTS avatar_url      varchar(1024),
  ADD COLUMN IF NOT EXISTS role            varchar(50) NOT NULL DEFAULT 'reporter',
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations (id) ON DELETE SET NULL;

-- Lightweight device-tracking row, created on new-device login (spec R4).
-- Full revocation/audit semantics land in the Sessions module (R15, T3.9).
CREATE TABLE IF NOT EXISTS user_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_uuid varchar(255) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id, device_uuid);

COMMIT;
