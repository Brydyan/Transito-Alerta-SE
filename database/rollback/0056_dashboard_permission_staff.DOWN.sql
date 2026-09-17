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

BEGIN;

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

COMMIT;