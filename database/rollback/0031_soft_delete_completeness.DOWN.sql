-- T7.2 Fase C — rollback de soft delete completeness

BEGIN;

DROP INDEX IF EXISTS idx_permissions_active;
ALTER TABLE permissions DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_users_email_active;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_user_sessions_active;
ALTER TABLE user_sessions DROP COLUMN IF EXISTS deleted_at;

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

COMMIT;
