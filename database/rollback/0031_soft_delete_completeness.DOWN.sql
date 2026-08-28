-- T7.2 Fase C — rollback de soft delete completeness
--
-- Housekeeping (T8.2.C, 2026-08-27): this DOWN only drops the
-- `deleted_at` column and partial index on tables where 0031
-- actually added them. Tables where `deleted_at` predates 0031
-- are left alone, because dropping them would remove a column
-- that an earlier migration owns:
--   - users.deleted_at + idx_users_deleted_at: added by 0028
--   - idx_user_sessions_active:             added by 0016
--     (0031 re-uses the name with `IF NOT EXISTS`, so it never
--      replaced 0016's index; the DOWN must not drop 0016's)

BEGIN;

DROP INDEX IF EXISTS idx_roles_active;
ALTER TABLE roles DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_permissions_active;
ALTER TABLE permissions DROP COLUMN IF EXISTS deleted_at;

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

-- user_sessions: 0031 added `deleted_at` here, but the
-- `idx_user_sessions_active` index is owned by 0016 (it
-- pre-dates 0031 and uses `revoked_at IS NULL` semantics).
-- We drop the column (ours) but leave the index (0016's).
ALTER TABLE user_sessions DROP COLUMN IF EXISTS deleted_at;

-- 0031 also created this unique partial index on users.email;
-- no earlier migration owns it.
DROP INDEX IF EXISTS idx_users_email_active;

-- Intentionally NOT dropped (owned by 0028):
--   users.deleted_at, idx_users_deleted_at
-- Intentionally NOT dropped (owned by 0016):
--   idx_user_sessions_active

COMMIT;
