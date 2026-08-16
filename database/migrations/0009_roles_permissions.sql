-- 0009_roles_permissions.sql
-- Transito Alerta SE — Roles + Permissions modules (T3.1)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (roles, users) to have been applied first.
--
-- Formalizes R6 (Roles)/R7 (Permissions) and design D2/D3 groundwork from
-- T1.4: `roles.permissions` becomes the composed permission set a role
-- grants, `permissions` is a catalog table of valid resource+action pairs
-- (informational — PermissionGuard still compares flat "ACTION resource"
-- strings, no hardcoded resource map per D3), and `users.role_id` +
-- `users.permission_version` let RolesService.assignRole bump `pv` (D2) to
-- invalidate the cached `perm:*` Redis blob without reissuing tokens.
--
-- Rollback: database/rollback/0009_roles_permissions.DOWN.sql

BEGIN;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource   varchar(100) NOT NULL,
  action     varchar(20) NOT NULL CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource, action)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_id            uuid REFERENCES roles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permission_version integer NOT NULL DEFAULT 1;

-- Seeds a real 'reporter' role row, replacing the T1.4 inline stub
-- (users.role varchar default 'reporter', never backed by a roles row).
-- Its permission set intentionally MIRRORS the anonymous ceiling in
-- auth.config.ts at seed time but does NOT drive it: AuthService.
-- getPermissions/getPermissionsByUserId branch on device_uuid === the
-- configured anonymous device uuid and read the config value directly,
-- never this row. Widening this role later widens ONLY what an
-- authenticated user holding it can do, never the anonymous ceiling
-- (CC2 stays governed by auth.config.ts alone).
INSERT INTO roles (name, description, permissions)
VALUES (
  'reporter',
  'Default role for authenticated citizen reporters',
  '["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Permission catalog: valid resource+action pairs known today. Purely
-- informational (future admin/menu UI per R16/T3.10) — PermissionGuard's
-- authorization decision never queries this table, only the flat
-- "ACTION resource" strings on a user's resolved permission set (D3).
INSERT INTO permissions (resource, action) VALUES
  ('incidents', 'READ'), ('incidents', 'CREATE'), ('incidents', 'UPDATE'), ('incidents', 'DELETE'),
  ('comments', 'READ'), ('comments', 'CREATE'), ('comments', 'UPDATE'), ('comments', 'DELETE'),
  ('assignments', 'READ'), ('assignments', 'ASSIGN'),
  ('users', 'READ'), ('users', 'UPDATE'),
  ('roles', 'READ'), ('roles', 'ASSIGN')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
