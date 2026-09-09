-- 0049_admin_user_permissions.sql
-- F6 (2026-09-08-f6-new-user-form) — closes a pre-existing catalog gap
-- that 0009 left open: `CREATE users` and `DELETE users` were never
-- seeded, so the F6 admin form's `POST /api/users` returns 403 to every
-- user (including master). Grants both to `master` and `admin_org`
-- (the 2 roles that legitimately create/delete other users), and
-- denormalizes to the existing user rows.
--
-- Also folds the `(READ, permissions)` row that was inserted manually
-- during the F6 verify session without a migration. Without the catalog
-- row, `GET /api/permissions` (used by the F6 form's "SIN ACCESO"
-- preview) returns 403 to every role except those that already had it
-- inline — and no role ever had it inline because the row never existed.
--
-- Pattern matches 0019 (CLAIM/RELEASE), 0043 (CLOSE incidents), 0047
-- (REVEAL incidents): the rules in `claude-qa.md` "regla a medias"
-- and the "builder guide" line about touching BOTH `roles.permissions`
-- AND `users.permissions` apply here.
--
-- Requires: 0009 (permissions table), 0017 (users), 0040 (role names),
-- 0048 (last permission-bearing migration).
--
-- DOWN: database/rollback/0049_admin_user_permissions.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

-- 1) Catalog: insert the 3 missing perms idempotently. ON CONFLICT on
--    the (resource, action) unique index makes the step safe to re-run.
INSERT INTO permissions (resource, action) VALUES
  ('users', 'CREATE'),
  ('users', 'DELETE'),
  ('permissions', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- 2) Grant to master and admin_org (the 2 roles that legitimately
--    create/delete other users). operador_sistema, operador_org and
--    reporter do NOT get CREATE/DELETE users — they should not be able
--    to manage other accounts. master also gets READ permissions so
--    the F6 role-preview's "SIN ACCESO" list renders. The `?` operator
--    checks key existence; the NOT (permissions ? '...') guard makes
--    this idempotent.
UPDATE roles
   SET permissions = permissions || '["CREATE users", "DELETE users", "READ permissions"]'::jsonb
 WHERE name IN ('master', 'admin_org')
   AND NOT (permissions ? 'CREATE users');

UPDATE roles
   SET permissions = permissions || '["READ permissions"]'::jsonb
 WHERE name = 'master'
   AND NOT (permissions ? 'READ permissions');

-- 3) Propagate to users.permissions for existing master and admin_org
--    users. Without this, a user created BEFORE this migration keeps
--    the OLD denormalized permission set and sees 403 on POST /api/users.
--    The same role_id qualification + NOT EXISTS guard makes this
--    idempotent. The "regla a medias" pattern: the bug already happened
--    once in 0009, do not repeat it here.
UPDATE users u
   SET permissions = u.permissions || '["CREATE users", "DELETE users", "READ permissions"]'::jsonb,
       permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND NOT (u.permissions ? 'CREATE users');

UPDATE users u
   SET permissions = u.permissions || '["READ permissions"]'::jsonb,
       permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND NOT (u.permissions ? 'READ permissions');

COMMIT;
