-- 0021_t6_t7_schema_completeness.sql
-- Transito Alerta SE — T6/T7 Schema Completeness Wave
--
-- Group F consolidation (2026-10-14): fused from:
--   0024_comment_images           — T5.5 comment_images table
--   0025_incidents_soft_delete    — T6.2.A1 incidents.deleted_at
--   0026_assignments_soft_delete  — T6.2.A2 assignments.deleted_at + partial UNIQUE
--   0027_incidents_metrics_cols   — T6.3 claimed_at, resolution_date
--   0028_users_otp_compliance     — T6.5 OTP + compliance columns + users.deleted_at
--   0029_incident_images          — T6.6 incident_images table
--   0030_schema_migrations        — T7 D7.1 schema_migrations tracking table
--   0031_soft_delete_completeness — T7.2.A deleted_at on 10 remaining tables
--   0032_updated_at_columns       — T7.3 updated_at + set_updated_at() trigger on 15 tables
--
-- Section order is load-bearing:
--   • 0021 (comment_images) and 0029 (incident_images) must precede 0021,
--     which adds updated_at triggers to both tables.
--   • 0028 (users.deleted_at) must precede 0021, which uses ADD COLUMN IF NOT
--     EXISTS on users — idempotent but ordering avoids confusion.
--   • 0021 must run last (depends on all tables existing).
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0004 (incidents), 0005 (comments), 0007 (assignments),
--          0006 (users), 0009 (permissions catalog), 0011 (notifications).
--
-- Rollback: database/rollback/0021_t6_t7_schema_completeness.DOWN.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1) T5.5 — comment_images table
--
--    Grants use string format ('CREATE comment-images') — compatible with
--    the roles.permissions JSONB array at this point in the chain.
--    0026 converts all string-format entries to UUID format later.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comment_images (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid         NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  storage_key varchar(500) NOT NULL,
  url         varchar(1000) NOT NULL,
  mime_type   varchar(100) NOT NULL,
  file_size   int          NOT NULL CHECK (file_size > 0),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_images_comment ON comment_images (comment_id);

INSERT INTO permissions (resource, action) VALUES
  ('comment-images', 'CREATE'),
  ('comment-images', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

UPDATE roles
   SET permissions = permissions || jsonb_build_array('CREATE comment-images', 'DELETE comment-images')
 WHERE name IN ('operador_organizacion', 'operador_sistema', 'admin_organizacion', 'admin_sistema')
   AND NOT (permissions ?& array['CREATE comment-images', 'DELETE comment-images']);

-- ════════════════════════════════════════════════════════════════════════
-- 2) T6.2.A1 — incidents soft delete
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_deleted_at
  ON incidents (deleted_at)
  WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 3) T6.2.A2 — assignments soft delete + partial UNIQUE
--
--    Hard UNIQUE (incident_id only) is incompatible with soft delete:
--    a deleted assignment would block a new one for the same incident.
--    Replaced by partial UNIQUE (incident_id, operator_id) WHERE deleted_at IS NULL.
--    Drops both possible constraint names for schema portability.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS uq_assignments_incident;
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_incident_id_operator_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active
  ON assignments (incident_id, operator_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_deleted_at
  ON assignments (deleted_at)
  WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 4) T6.3 — incident metrics columns
--
--    claimed_at: timestamp of the last claim; NOT cleared on release
--    (keeps history). resolution_date: set when incident → resolved;
--    NULL if it reverts to in_progress.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolution_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN incidents.claimed_at IS
  'Timestamp del último claim; no se borra en release (historial)';
COMMENT ON COLUMN incidents.resolution_date IS
  'Timestamp cuando el incidente pasó a resolved; NULL si vuelve a in_progress';

CREATE INDEX IF NOT EXISTS idx_incidents_resolution_date
  ON incidents (resolution_date)
  WHERE resolution_date IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 5) T6.5 — users OTP + compliance columns
--
--    verification_otp stores the SHA-256 hex hash (64 chars), not the
--    plain OTP. deleted_at added here first; 0021 re-adds with IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS verification_otp VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS verification_otp_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verified_at
  ON users (email_verified_at)
  WHERE email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON users (deleted_at)
  WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 6) T6.6 — incident_images table
--
--    Must precede section 9 (updated_at triggers reference this table).
--    Grant pattern uses jsonb_agg DISTINCT UNION ALL (different from
--    section 1's || operator — both are valid pre-0026 string format).
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS incident_images (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID         NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  storage_key TEXT         NOT NULL,
  url         TEXT         NOT NULL,
  mime_type   VARCHAR(100) NOT NULL,
  file_size   BIGINT       NOT NULL CHECK (file_size > 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_images_incident_id
  ON incident_images (incident_id);

INSERT INTO permissions (resource, action)
VALUES
  ('incident-images', 'CREATE'),
  ('incident-images', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'operador_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb
  ) sub
) WHERE name = 'operador_organizacion';

UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'admin_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb
  ) sub
) WHERE name = 'admin_organizacion';

-- ════════════════════════════════════════════════════════════════════════
-- 7) T7 D7.1 — schema_migrations tracking table
--
--    Backfill: if incidents table exists (= 0001-0023 already applied
--    manually on this DB), marks those versions as 'backfill' so the
--    runner skips them. ON CONFLICT DO NOTHING is idempotent.
--    Version names in the backfill reflect pre-consolidation history.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    varchar(8)  PRIMARY KEY,
  name       text        NOT NULL,
  checksum   char(64)    NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version, name, checksum, applied_at)
SELECT v.version, v.name, 'backfill', now()
FROM (
  VALUES
    ('0001', 'initial_schema'),
    ('0002', 'add_postgis_and_geo_zones'),
    ('0003', 'seed_geo_zones'),
    ('0004', 'incidents'),
    ('0005', 'comments'),
    ('0006', 'users'),
    ('0007', 'assignments'),
    ('0008', 'anonymous_read_comments'),
    ('0009', 'roles_permissions'),
    ('0010', 'user_email'),
    ('0011', 'notifications'),
    ('0012', 'incident_categories'),
    ('0013', 'geo_zones_hierarchy'),
    ('0014', 'status_history'),
    ('0015', 'organizations_scoping'),
    ('0016', 'sessions_revocation'),
    ('0017', 'users_password_identity'),
    ('0018', 'invitations'),
    ('0019', 'incident_claim'),
    ('0020', 'incident_state_machine')
) AS v(version, name)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'incidents'
)
ON CONFLICT (version) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 8) T7.2.A — soft delete completeness (10 remaining tables)
--
--    incidents (0025), assignments (0026), users (0028) already done above.
--    IF NOT EXISTS on users.deleted_at is intentionally idempotent.
--    user_sessions: deleted_at added here; idx_user_sessions_active is
--    owned by 0016 (uses revoked_at IS NULL semantics) — not recreated.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at
  ON comments (incident_id) WHERE deleted_at IS NULL;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_active
  ON invitations (token_hash) WHERE deleted_at IS NULL;

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens (token_hash) WHERE deleted_at IS NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_active
  ON notifications (user_id, created_at) WHERE deleted_at IS NULL;

ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_geo_zones_active
  ON geo_zones (parent_id) WHERE deleted_at IS NULL;

ALTER TABLE incident_categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_incident_categories_active
  ON incident_categories (parent_id) WHERE deleted_at IS NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_active
  ON organizations (zone_id) WHERE deleted_at IS NULL;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions (user_id) WHERE deleted_at IS NULL;

-- users: IF NOT EXISTS — already added in section 5.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
  ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_active
  ON permissions (resource) WHERE deleted_at IS NULL;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_roles_active
  ON roles (created_at) WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 9) T7.3 — updated_at columns + set_updated_at() trigger (15 tables)
--
--    Must run LAST — references comment_images (section 1) and
--    incident_images (section 6). Does NOT add updated_at to users,
--    incidents, or incident_categories — those columns predate 0021
--    (owned by 0001, 0004, 0012 respectively). Only adds the trigger.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON comments;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON assignments;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON notifications;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON organizations;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE geo_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON geo_zones;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON geo_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE incident_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE incident_categories SET updated_at = created_at WHERE created_at IS NOT NULL;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_categories;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON incident_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE roles SET updated_at = created_at WHERE created_at IS NOT NULL;
DROP TRIGGER IF EXISTS trg_set_updated_at ON roles;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON permissions;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON invitations;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON password_reset_tokens;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON password_reset_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON user_sessions;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON user_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE comment_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON comment_images;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON comment_images FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE incident_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_images;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON incident_images FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Triggers only (column already exists) for tables with pre-existing updated_at.
DROP TRIGGER IF EXISTS trg_set_updated_at ON incidents;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON users;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
