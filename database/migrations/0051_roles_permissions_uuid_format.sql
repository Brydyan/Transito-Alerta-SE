-- 0051_roles_permissions_uuid_format.sql
-- Transito Alerta SE — F6 / `2026-09-08-f6-roles-redesign`.
--
-- Normaliza `roles.permissions` (jsonb array) al formato UUID.
-- El backend guarda los permisos en el formato que el cliente
-- envía — la mayoría de las filas existentes tienen strings
-- formateados ("READ incidents"), y `0050_admin_user_permissions`
-- + el `PATCH /api/roles/:id` nuevo del role-editor envían
-- UUIDs. Sin esta migration, el catálogo de roles queda con
-- dos formatos distintos (strings en `admin_org`, UUIDs en
-- `operador_org` después del primer PATCH), y la matriz de
-- permisos del role-editor no matchea los checkboxes
-- (asignados="READ incidents" vs catalogo.permisoId="uuid-...").
--
-- Idempotente: si un elemento ya es UUID (no matchea ningún
-- `action+resource` del catálogo), se queda como está.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

BEGIN;

-- Para cada rol, reemplazar cada string "ACTION resource" en
-- roles.permissions por su UUID del catálogo de permissions.
-- Las filas con `role.deleted_at IS NOT NULL` se excluyen (T7.2.C4).
WITH perm_lookup AS (
  SELECT action, resource, id::text AS uuid
  FROM permissions
  WHERE deleted_at IS NULL
),
-- Construir la lista nueva por rol: map cada string al UUID
-- si matchea, sino dejarlo igual.
role_remap AS (
  SELECT
    r.id AS role_id,
    COALESCE(
      (
        SELECT jsonb_agg(
          COALESCE(p.uuid, elem)  -- si matchea, UUID; sino, deja el elem
        )
        FROM jsonb_array_elements_text(r.permissions) AS elem
        LEFT JOIN perm_lookup p
          ON p.action = split_part(elem, ' ', 1)
         AND p.resource = split_part(elem, ' ', 2)
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

-- Denormalizar a users.permissions para los users activos con
-- esos roles (mantiene la coherencia con el patrón de los
-- cambios 0049/0050).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
