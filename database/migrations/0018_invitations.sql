-- 0018_invitations.sql
-- Transito Alerta SE — invitations + password_reset_tokens (T3.6)
-- MANUAL EXECUTION ONLY. Requires 0015 (staff roles) and 0017 (users.
-- password_hash, nullable device_uuid) to have been applied first.
-- Rollback: database/rollback/0018_invitations.DOWN.sql

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin_sistema') THEN
    RAISE EXCEPTION '0018 requires 0015 (staff roles) to have been applied first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               varchar(320) NOT NULL,
  role_id             uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  organization_id     uuid REFERENCES organizations (id) ON DELETE CASCADE,
  token_hash          char(64) NOT NULL UNIQUE,
  accepted_at         timestamptz,
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  invited_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_email      ON invitations (email);
CREATE INDEX IF NOT EXISTS idx_invitations_pending    ON invitations (expires_at)
  WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  char(64) NOT NULL UNIQUE,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- 2-column INSERT — 0009's permissions table has no `description` column,
-- and `action` is CHECKed over 5 verbs. No 'password-reset' row: that
-- endpoint is unauthenticated by definition (design corrections table).
INSERT INTO permissions (resource, action) VALUES
  ('invitations', 'CREATE'), ('invitations', 'READ'), ('invitations', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

UPDATE roles
   SET permissions = permissions ||
       '["CREATE invitations", "READ invitations", "DELETE invitations"]'::jsonb
 WHERE name IN ('admin_sistema', 'admin_organizacion')
   AND NOT permissions @> '["CREATE invitations"]'::jsonb;

COMMIT;
