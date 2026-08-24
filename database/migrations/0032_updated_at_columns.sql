-- T7.3 — updated_at + trigger en 12 tablas
--
-- Agrega `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` a 12 tablas.
-- No toca `status_history` (append-only, nunca se actualiza).
--
-- Patrón: función `set_updated_at()` + trigger `BEFORE UPDATE` que asigna
-- `NEW.updated_at := now()` en cada modificación.

BEGIN;

-- Función reutilizada por todos los triggers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12 tablas nuevas: agregar columna y trigger
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
DROP TRIGGER IF EXISTS trg_set_updated_at ON incident_categories;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON incident_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
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

-- 3 tablas que ya tienen updated_at: add trigger si falta
DROP TRIGGER IF EXISTS trg_set_updated_at ON incidents;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON users;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
