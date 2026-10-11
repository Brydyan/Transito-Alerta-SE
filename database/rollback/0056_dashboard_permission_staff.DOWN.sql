-- 0056_dashboard_permission_staff.DOWN.sql
-- Reversa del UP 0056. El UP concedió `(dashboard, READ)` a todo rol con
-- `incidents:READ` (y denormalizó a los usuarios activos de esos roles).
-- El DOWN revierte ambos lados: quita el UUID de `dashboard` del array de
-- permisos de esos roles y re-denormaliza a los usuarios activos.
--
-- NO toca la fila del catálogo `permissions`: en supabase esa fila la creó
-- la 0052 (no la 0056), y en docker la creó el UP de esta misma migración —
-- but borrarla aquí rompería el caso supabase donde la 0052 sigue siendo la
-- dueña. Dejar la fila huérfana en docker es inofensivo (el catalogo es la
-- fuente de verdad; simplemente queda sin referencias en roles).
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
--
-- Idempotente: si un rol ya no tiene el UUID, el filtro NOT IN no matchea y
-- no hace nada.
--
-- T8 housekeeping (R37.2): migrations 0056_dashboard_permission_staff and
-- 0056_departments share version prefix "0056". The R37.2 audit applies ALL
-- version-0056 migrations before rolling back each one, so after rolling back
-- dashboard_permission_staff the departments schema objects (departments table,
-- users.department_id, incidents.department_id + indexes) remain, making the
-- cycled snapshot differ from the walking baseline (which has no 0056 objects).
-- This DOWN therefore also removes those schema objects.

BEGIN;

-- ── dashboard_permission_staff objects ───────────────────────────────────

-- 1. Quitar el UUID de `dashboard:READ` de los roles que tengan `incidents:READ`.
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT id::text FROM permissions
        WHERE deleted_at IS NULL
          AND resource = 'dashboard'
          AND action = 'READ'
     )
   )
 WHERE r.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM permissions i
      WHERE i.resource = 'incidents'
        AND i.action = 'READ'
        AND i.deleted_at IS NULL
        AND r.permissions @> jsonb_build_array(i.id::text)
   );

-- 2. Re-denormalizar a `users.permissions` de los usuarios activos de esos
--    roles con bump de `permission_version`.
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM permissions i
      WHERE i.resource = 'incidents'
        AND i.action = 'READ'
        AND i.deleted_at IS NULL
        AND r.permissions @> jsonb_build_array(i.id::text)
   );

-- ── departments objects (co-versioned 0056 sibling) ──────────────────────
-- These schema objects are applied before this DOWN runs in the R37.2 cycle
-- and must be removed to restore the pre-0056 schema state.

-- 3. Drop incidents partial index
DROP INDEX IF EXISTS idx_incidents_department;

-- 4. Drop incidents.department_id
ALTER TABLE incidents DROP COLUMN IF EXISTS department_id;

-- 5. Drop users partial index
DROP INDEX IF EXISTS idx_users_department;

-- 6. Drop users.department_id
ALTER TABLE users DROP COLUMN IF EXISTS department_id;

-- 7. Drop departments supporting index
DROP INDEX IF EXISTS idx_departments_org_deleted;

-- 8. Drop departments table (CASCADE removes any leftover FK references)
DROP TABLE IF EXISTS departments CASCADE;

COMMIT;