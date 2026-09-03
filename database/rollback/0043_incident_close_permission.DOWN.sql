-- 0043_incident_close_permission.DOWN.sql
-- Reverses 0043_incident_close_permission.sql. Run in Supabase SQL Editor.

BEGIN;

-- 1) Drop `CLOSE incidents` from users.permissions for affected users.
UPDATE users u
   SET permissions = permissions - 'CLOSE incidents'
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND u.permissions ? 'CLOSE incidents';

-- 2) Drop `CLOSE incidents` from roles.permissions.
UPDATE roles
   SET permissions = permissions - 'CLOSE incidents'
 WHERE name IN ('master', 'admin_org')
   AND permissions ? 'CLOSE incidents';

-- 3) Drop the (incidents, CLOSE) permission row.
DELETE FROM permissions
 WHERE resource = 'incidents'
   AND action = 'CLOSE';

-- 4) Restore the original CHECK constraint on permissions.action.
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_action_check;

ALTER TABLE permissions
  ADD CONSTRAINT permissions_action_check
  CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'CLAIM', 'RELEASE'));

-- 5) Bump permission_version to invalidate cached permissions.
UPDATE users u
   SET permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org');

COMMIT;
