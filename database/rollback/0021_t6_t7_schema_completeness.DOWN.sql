-- 0021_t6_t7_schema_completeness.DOWN.sql
-- Reverts Group F consolidation in reverse section order: 9→8→7→6→5→4→3→2→1
--
-- Ownership notes (columns NOT dropped here because they predate this group):
--   users.updated_at, incidents.updated_at, incident_categories.updated_at
--     — owned by 0001, 0004, 0012 respectively.
--   idx_user_sessions_active (0016's revoked_at semantics) — NOT owned here
--     even though section 8 recreated it by the same name.

BEGIN;

-- ── 9) Drop updated_at triggers + columns ────────────────────────────────
DROP TRIGGER IF EXISTS trg_set_updated_at ON users;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incidents;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_images;
DROP TRIGGER IF EXISTS trg_set_updated_at ON comment_images;
DROP TRIGGER IF EXISTS trg_set_updated_at ON user_sessions;
DROP TRIGGER IF EXISTS trg_set_updated_at ON password_reset_tokens;
DROP TRIGGER IF EXISTS trg_set_updated_at ON invitations;
DROP TRIGGER IF EXISTS trg_set_updated_at ON permissions;
DROP TRIGGER IF EXISTS trg_set_updated_at ON roles;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_categories;
DROP TRIGGER IF EXISTS trg_set_updated_at ON geo_zones;
DROP TRIGGER IF EXISTS trg_set_updated_at ON organizations;
DROP TRIGGER IF EXISTS trg_set_updated_at ON notifications;
DROP TRIGGER IF EXISTS trg_set_updated_at ON assignments;
DROP TRIGGER IF EXISTS trg_set_updated_at ON comments;

DROP FUNCTION IF EXISTS set_updated_at();

ALTER TABLE incident_images    DROP COLUMN IF EXISTS updated_at;
ALTER TABLE comment_images     DROP COLUMN IF EXISTS updated_at;
ALTER TABLE user_sessions      DROP COLUMN IF EXISTS updated_at;
ALTER TABLE password_reset_tokens DROP COLUMN IF EXISTS updated_at;
ALTER TABLE invitations        DROP COLUMN IF EXISTS updated_at;
ALTER TABLE permissions        DROP COLUMN IF EXISTS updated_at;
ALTER TABLE roles              DROP COLUMN IF EXISTS updated_at;
ALTER TABLE incident_categories DROP COLUMN IF EXISTS updated_at;
ALTER TABLE geo_zones          DROP COLUMN IF EXISTS updated_at;
ALTER TABLE organizations      DROP COLUMN IF EXISTS updated_at;
ALTER TABLE notifications      DROP COLUMN IF EXISTS updated_at;
ALTER TABLE assignments        DROP COLUMN IF EXISTS updated_at;
ALTER TABLE comments           DROP COLUMN IF EXISTS updated_at;
-- Intentionally NOT dropped: users.updated_at (0001), incidents.updated_at (0004)

-- ── 8) Drop soft delete completeness (10 tables) ─────────────────────────
DROP INDEX IF EXISTS idx_roles_active;
ALTER TABLE roles DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_permissions_active;
ALTER TABLE permissions DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_users_email_active;
-- users.deleted_at dropped in section 5 below (owned there)

ALTER TABLE user_sessions DROP COLUMN IF EXISTS deleted_at;
-- idx_user_sessions_active intentionally NOT dropped (owned by 0016)

DROP INDEX IF EXISTS idx_organizations_active;
ALTER TABLE organizations DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_incident_categories_active;
ALTER TABLE incident_categories DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_geo_zones_active;
ALTER TABLE geo_zones DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_notifications_user_active;
ALTER TABLE notifications DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_password_reset_tokens_active;
ALTER TABLE password_reset_tokens DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_invitations_active;
ALTER TABLE invitations DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_comments_deleted_at;
ALTER TABLE comments DROP COLUMN IF EXISTS deleted_at;

-- ── 7) Drop schema_migrations table ──────────────────────────────────────
DROP TABLE IF EXISTS schema_migrations;

-- ── 6) Drop incident_images table + permissions ───────────────────────────
DROP TABLE IF EXISTS incident_images;
DELETE FROM permissions WHERE resource = 'incident-images';

-- ── 5) Drop users OTP + compliance columns ────────────────────────────────
DROP INDEX IF EXISTS idx_users_email_verified_at;
DROP INDEX IF EXISTS idx_users_deleted_at;

ALTER TABLE users
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS verification_otp,
  DROP COLUMN IF EXISTS verification_otp_expires_at,
  DROP COLUMN IF EXISTS terms_accepted_at,
  DROP COLUMN IF EXISTS terms_version,
  DROP COLUMN IF EXISTS deleted_at;

-- ── 4) Drop incidents metrics columns ─────────────────────────────────────
DROP INDEX IF EXISTS idx_incidents_resolution_date;

ALTER TABLE incidents
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS resolution_date;

-- ── 3) Restore assignments: drop soft delete + restore hard UNIQUE ─────────
DROP INDEX IF EXISTS uq_assignments_active;
DROP INDEX IF EXISTS idx_assignments_deleted_at;

ALTER TABLE assignments DROP COLUMN IF EXISTS deleted_at;

-- Restore the exact 0007 constraint (UNIQUE on incident_id only).
ALTER TABLE assignments
  ADD CONSTRAINT uq_assignments_incident UNIQUE (incident_id);

-- ── 2) Drop incidents soft delete ─────────────────────────────────────────
DROP INDEX IF EXISTS idx_incidents_deleted_at;
ALTER TABLE incidents DROP COLUMN IF EXISTS deleted_at;

-- ── 1) Drop comment_images table + permissions + revoke grants ────────────
UPDATE roles
   SET permissions = (
     SELECT jsonb_agg(elem)
       FROM jsonb_array_elements(permissions) AS elem
      WHERE elem NOT IN ('"CREATE comment-images"'::jsonb, '"DELETE comment-images"'::jsonb)
   )
 WHERE name IN ('operador_organizacion', 'operador_sistema', 'admin_organizacion', 'admin_sistema');

DELETE FROM permissions WHERE resource = 'comment-images';

DROP TABLE IF EXISTS comment_images;

COMMIT;
