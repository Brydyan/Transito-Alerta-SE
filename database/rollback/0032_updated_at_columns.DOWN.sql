-- T7.3 Fase C — rollback updated_at

BEGIN;

DROP TRIGGER IF EXISTS trg_set_updated_at ON comment_images;
DROP TRIGGER IF EXISTS trg_set_updated_at ON comments;
DROP TRIGGER IF EXISTS trg_set_updated_at ON assignments;
DROP TRIGGER IF EXISTS trg_set_updated_at ON notifications;
DROP TRIGGER IF EXISTS trg_set_updated_at ON organizations;
DROP TRIGGER IF EXISTS trg_set_updated_at ON geo_zones;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_categories;
DROP TRIGGER IF EXISTS trg_set_updated_at ON roles;
DROP TRIGGER IF EXISTS trg_set_updated_at ON permissions;
DROP TRIGGER IF EXISTS trg_set_updated_at ON invitations;
DROP TRIGGER IF EXISTS trg_set_updated_at ON password_reset_tokens;
DROP TRIGGER IF EXISTS trg_set_updated_at ON user_sessions;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_images;
DROP TRIGGER IF EXISTS trg_set_updated_at ON incidents;
DROP TRIGGER IF EXISTS trg_set_updated_at ON users;

DROP FUNCTION IF EXISTS set_updated_at();

ALTER TABLE comment_images DROP COLUMN IF EXISTS updated_at;
ALTER TABLE comments DROP COLUMN IF EXISTS updated_at;
ALTER TABLE assignments DROP COLUMN IF EXISTS updated_at;
ALTER TABLE notifications DROP COLUMN IF EXISTS updated_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS updated_at;
ALTER TABLE geo_zones DROP COLUMN IF EXISTS updated_at;
ALTER TABLE incident_categories DROP COLUMN IF EXISTS updated_at;
ALTER TABLE roles DROP COLUMN IF EXISTS updated_at;
ALTER TABLE permissions DROP COLUMN IF EXISTS updated_at;
ALTER TABLE invitations DROP COLUMN IF EXISTS updated_at;
ALTER TABLE password_reset_tokens DROP COLUMN IF EXISTS updated_at;
ALTER TABLE user_sessions DROP COLUMN IF EXISTS updated_at;
ALTER TABLE incident_images DROP COLUMN IF EXISTS updated_at;

COMMIT;
