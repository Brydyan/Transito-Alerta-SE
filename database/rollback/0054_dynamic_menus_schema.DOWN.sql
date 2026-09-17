-- 0054_dynamic_menus_schema.DOWN.sql
-- Rollback for F5 dynamic menus schema migration.
-- Drops the 4 tables, roles.scope column, permissions catalog rows,
-- and role grants.

BEGIN;

-- Drop junction tables first (FK dependencies)
DROP TABLE IF EXISTS menu_option_endpoints;
DROP TABLE IF EXISTS menu_option_roles;
DROP TABLE IF EXISTS api_endpoints;
DROP TABLE IF EXISTS menu_options;

-- Remove permissions catalog rows
DELETE FROM permissions
 WHERE resource = 'menu-options'
   AND action IN ('READ', 'CREATE', 'UPDATE', 'DELETE')
   AND deleted_at IS NULL;

-- Remove roles.scope column
ALTER TABLE roles DROP COLUMN IF EXISTS scope;

COMMIT;
