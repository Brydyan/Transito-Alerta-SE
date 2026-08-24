-- T7.2 Fase A — soft delete en 12 tablas
--
-- Agrega `deleted_at TIMESTAMPTZ NULL` a todas las tablas de dominio que aún
-- no la tenían. Soft delete ya existe en incidents (0025), assignments (0026),
-- users (0028) — esta migración completa el patrón en las 9 restantes.
--
-- Patrón: ADD COLUMN deleted_at, CREATE partial INDEX (WHERE deleted_at IS NULL)
-- para list queries rápidas, y parciales UNIQUE donde aplica.
--
-- Backfill: todas las filas existentes quedan con deleted_at IS NULL (activas).

BEGIN;

-- comments: respuestas a incidentes, nunca cascade a incidents
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at
  ON comments (incident_id) WHERE deleted_at IS NULL;

-- invitations: single-use tokens, debe ser unique AND active
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
-- Partial unique: no pode haber dos invitaciones con el mismo token_hash activas
-- (si una es blanda, otra puede existir con el mismo hash — eso es revoke)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_active
  ON invitations (token_hash) WHERE deleted_at IS NULL;

-- password_reset_tokens: single-use, same pattern
ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens (token) WHERE deleted_at IS NULL;

-- notifications: puede haber muchas por usuario, pero las activas se filtran
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_active
  ON notifications (user_id, created_at) WHERE deleted_at IS NULL;

-- geo_zones: jerarquía administrativa, nunca cascade a incidents
ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_geo_zones_active
  ON geo_zones (parent_id) WHERE deleted_at IS NULL;

-- incident_categories: árbol de categorías, no cascade
ALTER TABLE incident_categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_incident_categories_active
  ON incident_categories (parent_id) WHERE deleted_at IS NULL;

-- organizations: recurso crítico, but soft-deletable
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_active
  ON organizations (parent_id, zone_id) WHERE deleted_at IS NULL;

-- user_sessions: sesiones abiertas, la revocación usa revoked_at
-- deleted_at es para lógica de limpieza antigua, pero nunca se usa
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions (user_id) WHERE deleted_at IS NULL;

-- users: identidades, pero pueden borrarse lógicamente (GDPR, account termination)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
-- Partial unique: email must be unique among active users
-- (deleted users can reuse the email for signup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
  ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;

-- permissions: catálogo de permisos, raro que se borre pero puede pasar
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_active
  ON permissions (resource) WHERE deleted_at IS NULL;

COMMIT;
