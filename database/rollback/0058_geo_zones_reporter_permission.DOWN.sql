-- 0058_geo_zones_reporter_permission.DOWN.sql
-- Rollback: remove READ geo-zones from reporter role.

BEGIN;

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

COMMIT;
