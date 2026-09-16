-- 0059_sanitize_roles_matrix.DOWN.sql
-- Reverses 0059_sanitize_roles_matrix.sql.
--
-- Restaura la situación PRE-sanitization: revive los roles legacy
-- (deleted_at -> NULL) y quita de los roles canónicos los permisos que
-- la 0049/0053 agregaron. NO restaura los strings crudos de la 0029
-- (eso requeriría reconstruir el estado exacto de cada rol legacy, y la
-- 0051 los reemplazó por UUIDs en los roles que ya estaban migrados).
-- Si necesitás replicar los strings, consultá database/migrations/
-- 0029_incident_images.sql.

BEGIN;

-- 1) Quitar de roles.permissions por UUID de catálogo (los permisos viven
--    en formato UUID post-0051, así que se filtran por id::text del
--    catálogo, no por string).
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) elem
    WHERE elem NOT IN (
      SELECT p.id::text FROM permissions p
       WHERE p.deleted_at IS NULL
         AND (
           (p.resource = 'users' AND p.action IN ('CREATE', 'DELETE')) OR
           (p.resource = 'permissions' AND p.action = 'READ') OR
           (p.resource = 'audit-logs' AND p.action = 'READ')
         )
    )
   )
 WHERE r.name IN ('master', 'admin_org')
   AND r.deleted_at IS NULL;

-- 2) Revivir los roles legacy (deleted_at -> NULL).
UPDATE roles
   SET deleted_at = NULL
 WHERE name IN ('admin_sistema', 'admin_organizacion', 'operador_organizacion');

-- 3) Soft-delete de las filas del catálogo agregadas (users CREATE/DELETE,
--    permissions READ, audit-logs READ).
UPDATE permissions
   SET deleted_at = now()
 WHERE deleted_at IS NULL
   AND (
     (resource = 'users' AND action IN ('CREATE', 'DELETE')) OR
     (resource = 'permissions' AND action = 'READ') OR
     (resource = 'audit-logs' AND action = 'READ')
   );

-- 4) Re-denormalizar users desde roles (perfiles restaurados).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.deleted_at IS NULL
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE;

COMMIT;