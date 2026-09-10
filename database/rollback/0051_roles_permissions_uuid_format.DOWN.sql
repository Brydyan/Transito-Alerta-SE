-- 0051_roles_permissions_uuid_format.DOWN.sql
-- F6 (`2026-09-08-f6-roles-redesign`) — reversa del UP
-- 0051. El UP normalizó `roles.permissions` (jsonb array) al
-- formato UUID. El DOWN revierte el array a strings formateados
-- "ACTION resource" (lo que había antes) para que el shape sea
-- idéntico al pre-F6.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
--
-- Idempotente: si una entrada ya es string formateado, se queda
-- como está. Si es UUID, se traduce vía el catálogo. La columna
-- `users.permissions` queda denormalizada desde `roles` al final
-- (mismo patrón que el UP).

BEGIN;

WITH perm_lookup AS (
  SELECT action, resource, id::text AS uuid
  FROM permissions
  WHERE deleted_at IS NULL
),
-- Para cada rol, traducir cada UUID al string formateado. Si un
-- elemento no es UUID (ya estaba como string), lo dejamos igual.
role_remap AS (
  SELECT
    r.id AS role_id,
    COALESCE(
      (
        SELECT jsonb_agg(
          COALESCE(p.action || ' ' || p.resource, elem)
        )
        FROM jsonb_array_elements_text(r.permissions) AS elem
        LEFT JOIN perm_lookup p ON p.uuid = elem
      ),
      r.permissions
    ) AS new_permissions
  FROM roles r
  WHERE r.deleted_at IS NULL
)
UPDATE roles r
   SET permissions = remap.new_permissions
  FROM role_remap remap
 WHERE r.id = remap.role_id
   AND r.permissions IS DISTINCT FROM remap.new_permissions;

-- Denormalizar a users.permissions (mismo patrón que el UP).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
