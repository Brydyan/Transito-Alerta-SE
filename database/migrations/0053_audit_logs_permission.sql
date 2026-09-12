-- 0053_audit_logs_permission.sql
-- Transito Alerta SE — F6 (`2026-09-11-f6-audit-logs-export`).
--
-- Adds the read-side permission for `audit_events` (migration 0045,
-- sc-327) that this change introduces. The write layer
-- (`AuditService.record`) is already wired and was the only thing
-- the AUD change shipped; the F6 change now exposes the table
-- via `GET /api/audit-logs` and `GET /api/audit-logs/export.csv`.
--
-- Same shape as 0049/0050/0052:
--   1. INSERT the catalog row idempotently
--      (ON CONFLICT on the (resource, action) UNIQUE).
--   2. Concede al rol `master` — concat al jsonb array, deduplicado.
--   3. Denormaliza a `users.permissions` de los master activos con
--      bump de `permission_version` para invalidar el cache
--      `perm:v3:uid:*` (T3.9 design §3 [R4]).
--
-- Sólo master (OD-2 del proposal): la extensión a `operador_sistema`
-- queda pendiente de decisión comercial. La matriz del change es
-- "admin-only" — el placeholder "Descargar reporte CSV…" de mock
-- 03-01 y la card "Auditoría de Acceso" de `/app/admin/users`
-- apuntan a esta funcionalidad.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
-- Requires 0009 (permissions table + roles.permissions JSONB), 0045
-- (audit_events table), 0049 (last permission-bearing migration),
-- 0051 (roles.permissions UUID format), 0052 (catalog pattern).
--
-- Rollback: database/rollback/0053_audit_logs_permission.DOWN.sql.

BEGIN;

-- 1) Catalog: inserta la fila del permiso (idempotente).
INSERT INTO permissions (resource, action) VALUES
  ('audit-logs', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- 2) Grant al rol `master`. Mismo patrón que 0052 — concatena la
--    UUID del catálogo y deduplica con `jsonb_agg(DISTINCT elem)`.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'audit-logs'
           AND p.action = 'READ')
     ) AS elem
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL;

-- 3) Denormalizar a `users.permissions` de los master activos.
--    Bumpear `permission_version` invalida `perm:v3:uid:*` (T3.9
--    design §3 [R4] + el patrón de 0049/0050/0052).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
