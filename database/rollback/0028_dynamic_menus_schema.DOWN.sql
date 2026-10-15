-- 0028_dynamic_menus_schema.DOWN.sql
-- Rollback for F5 dynamic menus schema migration.
-- Drops the 4 tables, roles.scope column, permissions catalog rows,
-- and role grants.
--
-- T8 housekeeping (R37.2): migrations 0027_citizen_social_features and
-- 0028_dynamic_menus_schema share version prefix group (0027/0028). The R37.2 audit
-- applies ALL version-group migrations before rolling back each one, so
-- after rolling back dynamic_menus_schema the citizen_social_features
-- schema objects (incident_followers, incident_corroborations + indexes)
-- remain, making the cycled snapshot differ from the walking baseline.
-- This DOWN therefore also removes those objects.

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

-- ── citizen_social_features objects (co-versioned 0028 sibling) ──────────
-- These objects are applied before this DOWN runs in the R37.2 cycle.

-- Remove incident-followers/corroborations permission UUIDs from roles.permissions
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT p.id::text
       FROM permissions p
       WHERE p.resource IN ('incident-followers', 'incident-corroborations')
         AND p.deleted_at IS NULL
     )
   )
 WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
   AND r.deleted_at IS NULL;

-- Denormalize removal to users.permissions
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- Drop tables (indexes are dropped implicitly with the tables)
DROP TABLE IF EXISTS incident_corroborations;
DROP TABLE IF EXISTS incident_followers;

COMMIT;
