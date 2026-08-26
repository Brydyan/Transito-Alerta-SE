-- T7 D7.1 — Tracking de migraciones aplicadas
--
-- Tabla `schema_migrations` es la fuente de verdad del estado del esquema.
-- Cada migración registra su versión, nombre, checksum SHA-256 (para detectar
-- drift — cualquier edición de un archivo ya aplicado es un error operativo),
-- y timestamp de aplicación.
--
-- Por defecto, NADA auto-aplica. El operador pega cada .sql en Supabase en
-- orden numérico y registra manualmente (CC3 — Comité de Control, Decision).
-- Esta tabla es la fuente de verdad programática, usada por el runner (D7.1
-- Fase B) para:
-- - Saltar migraciones ya aplicadas en local/testing
-- - Detectar drift por checksum
-- - Reportar status via `--status`
--
-- La migración 0030 es CREATE TABLE IF NOT EXISTS (inocua) + backfill
-- condicional: si `incidents` table existe (= schema 0001–0029 ya aplicadas
-- en esta BD), inserta 0001–0029 como "previously applied".

BEGIN;

-- Rastreo de migraciones
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     varchar(8)  PRIMARY KEY,  -- e.g., "0030"
  name        text        NOT NULL,     -- e.g., "schema_migrations"
  checksum    char(64)    NOT NULL,     -- SHA-256 del archivo
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- Backfill condicional: marca 0001–0029 como aplicadas si el esquema ya existe.
-- Esto hace que la primera pasada del runner en una base con 0001–0029 ya
-- existentes no intente re-aplicarlas. El EXISTS check es el "test" de que la
-- base no está vacía.
INSERT INTO schema_migrations (version, name, checksum, applied_at)
SELECT v.version, v.name, 'backfill', now()
FROM (
  VALUES
    ('0001', 'initial_schema'),
    ('0002', 'add_postgis_and_geo_zones'),
    ('0003', 'seed_geo_zones'),
    ('0004', 'create_users_table'),
    ('0005', 'create_comments_table'),
    ('0006', 'create_assignments_table'),
    ('0007', 'create_user_sessions_table'),
    ('0008', 'add_anonymous_user'),
    ('0009', 'create_roles_and_permissions'),
    ('0010', 'create_notifications_table'),
    ('0011', 'create_incident_categories'),
    ('0012', 'organize_permissions_by_resource'),
    ('0013', 'geo_zones_hierarchy_and_locations_index'),
    ('0014', 'status_history_and_log_trigger'),
    ('0015', 'add_staff_roles_and_permissions'),
    ('0016', 'assign_audit_permissions'),
    ('0017', 'create_invitations_table'),
    ('0018', 'create_password_reset_tokens'),
    ('0019', 'add_password_identity'),
    ('0020', 'add_incident_state_closed'),
    ('0021', 'add_approval_columns'),
    ('0022', 'add_incident_pending_approval_notification'),
    ('0023', 'add_status_history_notes'),
    ('0024', 'create_comment_images'),
    ('0025', 'soft_delete_incidents_and_assignments'),
    ('0026', 'add_incident_metrics'),
    ('0027', 'add_otp_and_compliance'),
    ('0028', 'create_incident_images'),
    ('0029', 'add_incident_images_relationships')
) AS v(version, name)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'incidents'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
