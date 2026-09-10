-- 0050_roles_crud_permissions.DOWN.sql
-- Reverses 0050_roles_crud_permissions.sql.

BEGIN;

-- 1) Quitar CREATE/UPDATE/DELETE roles de users.permissions.
UPDATE users u
   SET permissions = u.permissions - 'CREATE roles' - 'UPDATE roles' - 'DELETE roles',
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.permissions ? 'CREATE roles';

-- 2) Quitar de roles.permissions.
UPDATE roles
   SET permissions = permissions - 'CREATE roles' - 'UPDATE roles' - 'DELETE roles'
 WHERE name = 'master'
   AND permissions ? 'CREATE roles';

-- 3) Soft-delete de las filas del catálogo (no hard-delete —
--    mismas reglas que en 0049).
UPDATE permissions
   SET deleted_at = now()
 WHERE resource = 'roles'
   AND action IN ('CREATE', 'UPDATE', 'DELETE')
   AND deleted_at IS NULL;

COMMIT;
