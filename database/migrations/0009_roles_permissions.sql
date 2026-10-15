-- 0009_roles_permissions.sql
-- Transito Alerta SE — Roles + Permissions modules (T3.1)
--
-- Group A consolidation (2026-10-14): fused catalog gaps and role-grant
-- fixes from 0039, 0043, 0047, 0049, 0050, 0052, 0053,
-- 0055_dashboard_permission_assignment, 0056_dashboard_permission_staff,
-- 0057_department_permissions, 0058_geo_zones_reporter_permission,
-- 0059_sanitize_roles_matrix, 0066_status_history_permission,
-- 0070_system_config_permission.
-- 0026_roles_permissions_uuid_format is kept to convert seeded strings to UUIDs.
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

-- CHECK includes all 9 action verbs from day one so that downstream
-- migrations (0019: CLAIM/RELEASE, and the now-fused CLOSE/REVEAL) never
-- need to regress the constraint. 0019 still drops+recreates the constraint
-- but does so with the full list; 0043/0047 are no-ops after this merge.
CREATE TABLE IF NOT EXISTS permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource   varchar(100) NOT NULL,
  action     varchar(20) NOT NULL CHECK (action IN (
               'READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN',
               'CLAIM', 'RELEASE', 'CLOSE', 'REVEAL'
             )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource, action)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_id            uuid REFERENCES roles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permission_version integer NOT NULL DEFAULT 1;

-- =========================================================================
-- Permissions catalog — all resource+action pairs owned by this module.
-- Resources seeded by later migrations (organizations from 0015, geo-zones
-- from 0013, incident-categories from 0012) use ON CONFLICT DO NOTHING when
-- they arrive; geo-zones READ is included here because reporter requires it
-- and it must be in the catalog before 0051 (UUID conversion) runs.
-- =========================================================================
INSERT INTO permissions (resource, action) VALUES
  -- incidents (CRUD + state-machine actions fused from 0043/0047)
  ('incidents', 'READ'),  ('incidents', 'CREATE'),
  ('incidents', 'UPDATE'), ('incidents', 'DELETE'),
  ('incidents', 'CLOSE'), ('incidents', 'REVEAL'),
  -- comments
  ('comments', 'READ'),  ('comments', 'CREATE'),
  ('comments', 'UPDATE'), ('comments', 'DELETE'),
  -- assignments (READ/ASSIGN original + UPDATE/DELETE from 0052)
  ('assignments', 'READ'),  ('assignments', 'ASSIGN'),
  ('assignments', 'UPDATE'), ('assignments', 'DELETE'),
  -- users (READ/UPDATE original + CREATE/DELETE from 0049)
  ('users', 'READ'),   ('users', 'CREATE'),
  ('users', 'UPDATE'), ('users', 'DELETE'),
  -- roles (READ/ASSIGN original + CUD from 0050)
  ('roles', 'READ'),   ('roles', 'ASSIGN'),
  ('roles', 'CREATE'), ('roles', 'UPDATE'), ('roles', 'DELETE'),
  -- permissions (READ from 0049)
  ('permissions', 'READ'),
  -- notifications (READ+UPDATE from 0039)
  ('notifications', 'READ'), ('notifications', 'UPDATE'),
  -- dashboard (READ from 0052/0055/0056)
  ('dashboard', 'READ'),
  -- audit-logs (READ from 0053)
  ('audit-logs', 'READ'),
  -- departments (CRUD from 0057)
  ('departments', 'READ'),   ('departments', 'CREATE'),
  ('departments', 'UPDATE'), ('departments', 'DELETE'),
  -- status-history (READ from 0066)
  ('status-history', 'READ'),
  -- system-config (READ from 0070)
  ('system-config', 'READ'),
  -- geo-zones READ needed for reporter (full CRUD added by 0013)
  ('geo-zones', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- =========================================================================
-- Role seeds (string-format permissions; 0051 converts to UUIDs)
-- Old role names (admin_sistema, admin_organizacion, operator_organizacion)
-- preserved so that 0015 (ON CONFLICT DO NOTHING) and 0040 (rename) remain
-- valid no-ops and renames respectively on a fresh install.
-- =========================================================================

-- reporter: authenticated citizen. Mirrors the anonymous ceiling at seed
-- time but does NOT drive it (auth.config.ts governs CC2 independently).
INSERT INTO roles (name, description, permissions) VALUES (
  'reporter',
  'Default role for authenticated citizen reporters',
  '["READ incidents", "CREATE incidents",
    "READ comments", "CREATE comments",
    "READ geo-zones",
    "READ dashboard",
    "READ status-history"]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- admin_sistema → renamed to master by 0040. Full system-admin set.
INSERT INTO roles (name, description, permissions) VALUES (
  'admin_sistema',
  'System administrator — global scope across every organization',
  '["READ incidents",   "CREATE incidents",  "UPDATE incidents",  "DELETE incidents",
    "CLOSE incidents",  "REVEAL incidents",
    "READ comments",    "CREATE comments",   "UPDATE comments",   "DELETE comments",
    "READ assignments", "ASSIGN assignments", "UPDATE assignments", "DELETE assignments",
    "READ users",       "CREATE users",      "UPDATE users",      "DELETE users",
    "READ roles",       "ASSIGN roles",      "CREATE roles",      "UPDATE roles",   "DELETE roles",
    "READ permissions",
    "READ organizations", "CREATE organizations", "UPDATE organizations", "DELETE organizations",
    "READ geo-zones",     "CREATE geo-zones",     "UPDATE geo-zones",     "DELETE geo-zones",
    "READ incident-categories", "CREATE incident-categories",
    "UPDATE incident-categories", "DELETE incident-categories",
    "READ notifications",  "UPDATE notifications",
    "READ dashboard",
    "READ audit-logs",
    "READ departments",  "CREATE departments",  "UPDATE departments",  "DELETE departments",
    "READ status-history",
    "READ system-config"]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- agent_system: global read-only operator.
INSERT INTO roles (name, description, permissions) VALUES (
  'agent_system',
  'System operator — global read scope, zero users/roles writes (defense in depth)',
  '["READ incidents",
    "READ comments",
    "READ assignments",
    "READ geo-zones",
    "READ incident-categories",
    "READ organizations",
    "READ notifications",  "UPDATE notifications",
    "READ dashboard",
    "READ status-history",
    "READ system-config"]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- admin_organizacion → renamed to admin_org by 0040. Org-scoped admin.
INSERT INTO roles (name, description, permissions) VALUES (
  'admin_organizacion',
  'Organization administrator — org scope',
  '["READ incidents",    "CREATE incidents",   "UPDATE incidents",   "DELETE incidents",
    "CLOSE incidents",
    "READ comments",     "CREATE comments",    "UPDATE comments",    "DELETE comments",
    "READ assignments",  "ASSIGN assignments",
    "READ users",        "CREATE users",       "UPDATE users",       "DELETE users",
    "READ roles",        "ASSIGN roles",
    "READ permissions",
    "READ organizations",
    "READ geo-zones",
    "READ incident-categories",
    "READ notifications", "UPDATE notifications",
    "READ dashboard",
    "READ departments",  "CREATE departments",  "UPDATE departments",  "DELETE departments",
    "READ status-history"]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- operator_organizacion → renamed to operator_org by 0040. Org-assigned operator.
INSERT INTO roles (name, description, permissions) VALUES (
  'operator_organizacion',
  'Organization operator — org_assigned scope (own assignments only)',
  '["READ incidents",    "UPDATE incidents",
    "READ comments",     "CREATE comments",
    "READ assignments",
    "READ geo-zones",
    "READ incident-categories",
    "READ notifications", "UPDATE notifications",
    "READ dashboard",
    "READ status-history"]'::jsonb
) ON CONFLICT (name) DO NOTHING;

COMMIT;
