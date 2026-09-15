-- Rollback for 0055_dashboard_permission_assignment.sql
-- Transito Alerta SE — Revert dashboard READ permission assignment from staff roles
--
-- Context: UP 0055 added `READ dashboard` permission UUID to master, operador_sistema,
-- and operador_org. This DOWN reverses the change:
-- 1. Remove the dashboard READ UUID from roles.permissions arrays (all 3 roles)
-- 2. Denormalize to users.permissions + bump permission_version to invalidate Redis cache
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Idempotent: if the permission is not in the array, the UPDATE simply does nothing.

BEGIN;

-- 1) Remove dashboard READ from master role.permissions array
--    Uses jsonb_array_elements_text + filter pattern from 0052.DOWN (inline subquery, no temp table)
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT id::text FROM permissions
        WHERE deleted_at IS NULL
          AND resource = 'dashboard'
          AND action = 'READ'
     )
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL;

-- 2) Denormalize: sync users.permissions + bump permission_version for all 3 roles
UPDATE users u
   SET permissions = r.permissions,
       permission_version = permission_version + 1,
       updated_at = now()
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'operador_sistema', 'operador_org')
   AND u.deleted_at IS NULL;

COMMIT;
