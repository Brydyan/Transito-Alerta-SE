-- 0049_admin_user_permissions.DOWN.sql
-- Reverses 0049_admin_user_permissions.sql. Run in Supabase SQL Editor.

BEGIN;

-- 1) Remove CREATE/DELETE users and READ permissions from
--    users.permissions (denormalized copy). Bump version so the next
--    JWT validation invalidates the perm:v3:uid:* cache.
UPDATE users u
   SET permissions = u.permissions - 'CREATE users' - 'DELETE users' - 'READ permissions',
       permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org');

-- 2) Remove CREATE/DELETE users from roles.permissions and the
--    master-only READ permissions. (admin_org never had READ
--    permissions, so the second UPDATE only touches master.)
UPDATE roles
   SET permissions = permissions - 'CREATE users' - 'DELETE users'
 WHERE name IN ('master', 'admin_org');

UPDATE roles
   SET permissions = permissions - 'READ permissions'
 WHERE name = 'master';

-- 3) Remove the catalog rows. WARNING: only safe if NO user has these
--    perms in their denormalized copy. The checks above ensure that.
--    If a downstream change added them outside the role grant, this
--    DELETE will fail with a FK violation (or silently no-op if no FK).
DELETE FROM permissions
 WHERE resource = 'users'
   AND action IN ('CREATE', 'DELETE');

DELETE FROM permissions
 WHERE resource = 'permissions'
   AND action = 'READ';

COMMIT;
