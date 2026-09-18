-- Rollback 0057: drop department permissions
-- Transito Alerta SE — `back/2026-09-15-departments-module`
--
-- Symmetric to 0057_up.sql:
--   1. Soft-delete the 4 `departments` permission rows from `permissions`.
--   2. Remove their UUIDs from master/admin_org `roles.permissions`.
--   3. Denormalize back to `users.permissions` and bump version.

BEGIN;

-- 1) Soft-delete the 4 departments permission rows.
UPDATE permissions
   SET deleted_at = now()
 WHERE resource = 'departments'
   AND action IN ('READ', 'CREATE', 'UPDATE', 'DELETE')
   AND deleted_at IS NULL;

-- 2) Remove those UUIDs from any role that holds them (master + admin_org).
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT p.id::text
         FROM permissions p
        WHERE p.resource = 'departments'
          AND p.action IN ('READ', 'CREATE', 'UPDATE', 'DELETE')
     )
   )
 WHERE r.name IN ('master', 'admin_org')
   AND r.deleted_at IS NULL;

-- 3) Denormalize + bump version (forces perm:v3:uid:* re-resolution on
--    next authenticated request).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
