-- Rollback for 0054_citizen_social_features.sql
-- Removes: tables (incident_followers, incident_corroborations), permission catalog entries, role grants, and user denormalization.
--
-- T8 housekeeping (R37.2): migrations 0054_citizen_social_features and
-- 0054_dynamic_menus_schema share version prefix "0054". The R37.2 audit
-- applies ALL version-0054 migrations before rolling back each one, so
-- after rolling back citizen_social_features the dynamic_menus schema
-- objects (menu_options family + roles.scope column) remain, making the
-- cycled snapshot differ from the walking baseline (which has no 0054
-- objects at all). This DOWN therefore also removes those objects so the
-- cycled DB is fully equivalent to the pre-0054 walking base.

BEGIN;

-- ── citizen_social_features objects ──────────────────────────────────────

-- 1) Remove permission UUIDs from roles.permissions
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

-- 2) Denormalize removal to users.permissions
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- 3) Drop tables
DROP TABLE IF EXISTS incident_corroborations;
DROP TABLE IF EXISTS incident_followers;

-- ── dynamic_menus_schema objects (co-versioned 0054 sibling) ─────────────
-- These objects are applied before this DOWN runs in the R37.2 cycle and
-- must be removed to restore the pre-0054 schema state.

-- 4) Remove menu-options permission UUIDs from roles.permissions
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

-- 5) Denormalize removal to users.permissions
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- 6) Drop junction tables first (FK dependencies), then base tables
DROP TABLE IF EXISTS menu_option_endpoints;
DROP TABLE IF EXISTS menu_option_roles;
DROP TABLE IF EXISTS api_endpoints;
DROP TABLE IF EXISTS menu_options;

-- 7) Remove menu-options permissions catalog rows
DELETE FROM permissions
 WHERE resource = 'menu-options'
   AND action IN ('READ', 'CREATE', 'UPDATE', 'DELETE')
   AND deleted_at IS NULL;

-- 8) Remove roles.scope column (also drops its CHECK constraint)
ALTER TABLE roles DROP COLUMN IF EXISTS scope;

COMMIT;
