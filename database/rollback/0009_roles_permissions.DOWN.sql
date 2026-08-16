-- 0009_roles_permissions.DOWN.sql
-- Reverts T3.1 (Roles + Permissions modules).
--
-- WARNING: dropping `users.role_id`/`users.permission_version` removes the
-- pv-bump mechanism RolesService.assignRole relies on to invalidate cached
-- permission blobs — do not run this while the Roles module is still
-- deployed.

BEGIN;

ALTER TABLE users
  DROP COLUMN IF EXISTS permission_version,
  DROP COLUMN IF EXISTS role_id;

DROP TABLE IF EXISTS permissions;

DELETE FROM roles WHERE name = 'reporter';

ALTER TABLE roles
  DROP COLUMN IF EXISTS permissions;

COMMIT;
