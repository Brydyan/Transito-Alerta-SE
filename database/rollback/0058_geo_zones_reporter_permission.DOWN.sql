-- 0058_geo_zones_reporter_permission.DOWN.sql
-- Rollback: remove READ geo-zones from reporter role.
--
-- T8 housekeeping (R37.2): migrations 0058_department_incident_categories,
-- 0058_fix_controles_route, and 0058_geo_zones_reporter_permission share
-- version prefix "0058". The R37.2 audit applies ALL version-0058 migrations
-- before rolling back each one. After rolling back geo_zones_reporter_permission,
-- the department_incident_categories schema objects (table + index) remain from
-- the first sibling. This DOWN therefore also removes those schema objects to
-- restore the pre-0058 schema state.

BEGIN;

-- ── geo_zones_reporter_permission objects ─────────────────────────────────

-- Remove geo-zones READ from roles.permissions array.
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT id::text FROM permissions
        WHERE deleted_at IS NULL
          AND resource = 'geo-zones'
          AND action = 'READ'
     )
   )
 WHERE r.name = 'reporter'
   AND r.deleted_at IS NULL;

-- Denormalize to users.permissions + bump permission_version.
UPDATE users u
   SET permissions = r.permissions,
       permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'reporter'
   AND u.deleted_at IS NULL;

-- ── department_incident_categories objects (co-versioned 0058 sibling) ───
-- These schema objects are applied before this DOWN runs in the R37.2 cycle.

DROP INDEX IF EXISTS idx_dic_category;
DROP TABLE IF EXISTS department_incident_categories CASCADE;

COMMIT;
