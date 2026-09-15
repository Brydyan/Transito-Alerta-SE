-- Rollback for 0055_dashboard_permission_assignment.sql
-- Transito Alerta SE — Revert dashboard READ permission assignment from master role
--
-- Context: UP 0055 added `READ dashboard` permission UUID to master (and attempted
-- 'operator', which doesn't exist). This DOWN reverses the change:
-- 1. Remove the dashboard READ UUID from roles.permissions arrays (master only, since 'operator' never existed)
-- 2. Denormalize to users.permissions + bump permission_version to invalidate Redis cache
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Idempotent: if the permission is not in the array, the UPDATE simply does nothing.

BEGIN;

-- 1) Get dashboard READ permission UUID
CREATE TEMPORARY TABLE dashboard_perm AS
  SELECT id FROM permissions
  WHERE resource = 'dashboard' AND action = 'READ'
    AND deleted_at IS NULL;

-- 2) Remove dashboard READ from master role.permissions array
--    Uses jsonb_array_elements_text + filter pattern from 0052.DOWN
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (SELECT id::text FROM dashboard_perm)
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL;

-- 3) Denormalize: sync users.permissions + bump permission_version for master users
UPDATE users u
   SET permissions = r.permissions,
       permission_version = permission_version + 1,
       updated_at = now()
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL;

COMMIT;
