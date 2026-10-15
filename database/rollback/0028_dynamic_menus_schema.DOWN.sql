-- 0028_dynamic_menus_schema.DOWN.sql
-- Rollback for F5 dynamic menus schema migration.
-- Drops the 4 tables, roles.scope column, permissions catalog rows,
-- and role grants.
--
-- NOTE: incident_corroborations and incident_followers are owned by 0027,
-- not 0028. They are NOT dropped here; 0027's own DOWN.sql handles them.

BEGIN;

-- ── dynamic_menus_schema objects ─────────────────────────────────────────

-- Remove menu-options permission UUIDs from roles.permissions
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT p.id::text FROM permissions p
        WHERE p.resource = 'menu-options'
          AND p.deleted_at IS NULL
     )
   )
 WHERE r.deleted_at IS NULL;

-- Denormalize removal to users.permissions
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

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

-- Remove roles.scope column (also drops its CHECK constraint)
ALTER TABLE roles DROP COLUMN IF EXISTS scope;

COMMIT;
