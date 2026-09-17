-- 0054_dynamic_menus_schema.sql
-- F5 (2026-08-29-f5-dynamic-menus) — creates the 4 tables for dynamic
-- menus, adds `roles.scope` column (Q1), registers menu-options permissions
-- in the catalog and grants them, seeds `api_endpoints` with current routes.
--
-- Tables:
--   menu_options          — self-referencing adjacency list (D3), soft delete (D6)
--   menu_option_roles     — composite PK, physical delete (D6)
--   api_endpoints         — catalog of assignable endpoints (D5)
--   menu_option_endpoints — junction, composite PK, physical delete (D6)
--
-- Requires: 0009 (permissions catalog), 0015/0040 (role names),
--           0049/0050/0051/0052 (latest permission-bearing migrations).
--
-- DOWN: database/rollback/0054_dynamic_menus_schema.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. menu_options — self-referencing adjacency list (D3)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE menu_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar NOT NULL,
  route         varchar NOT NULL,
  icon          varchar NULL,
  parent_id     uuid NULL REFERENCES menu_options(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  deleted_at    timestamptz NULL DEFAULT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_options_parent_order
  ON menu_options (parent_id, display_order)
  WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 2. menu_option_roles — composite PK, physical delete (D6)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE menu_option_roles (
  menu_option_id uuid NOT NULL REFERENCES menu_options(id) ON DELETE CASCADE,
  role_id        uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  can_read       boolean NOT NULL DEFAULT false,
  can_write      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (menu_option_id, role_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- 3. api_endpoints — catalog (D5)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE api_endpoints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method      varchar NOT NULL,
  path        varchar NOT NULL,
  description text NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method, path)
);

-- ════════════════════════════════════════════════════════════════════════
-- 4. menu_option_endpoints — junction, composite PK (D6)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE menu_option_endpoints (
  menu_option_id uuid NOT NULL REFERENCES menu_options(id) ON DELETE CASCADE,
  endpoint_id    uuid NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_option_id, endpoint_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- 5. roles.scope — Q1 resolution (three scopes: platform, organization, public)
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS scope varchar(20) NOT NULL DEFAULT 'organization'
    CHECK (scope IN ('platform', 'organization', 'public'));

-- Scope assignments (verified against 0015/0040 seed):
--   master, operador_sistema → platform
--   admin_org, operador_org  → organization (DEFAULT)
--   reporter                 → public
UPDATE roles SET scope = 'platform' WHERE name IN ('master', 'operador_sistema');
UPDATE roles SET scope = 'public'   WHERE name = 'reporter';

-- ════════════════════════════════════════════════════════════════════════
-- 6. Permissions catalog — menu-options resource (F5.1.6)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action) VALUES
  ('menu-options', 'READ'),
  ('menu-options', 'CREATE'),
  ('menu-options', 'UPDATE'),
  ('menu-options', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 7. Grant permissions to roles (F5.1.6)
--    READ → master + operador_sistema
--    CREATE/UPDATE/DELETE → master only
-- ════════════════════════════════════════════════════════════════════════

-- Grant READ menu-options to master and operador_sistema
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'menu-options'
           AND p.action = 'READ')
     ) AS elem
   )
 WHERE r.name IN ('master', 'operador_sistema')
   AND r.deleted_at IS NULL
   AND NOT (r.permissions ? (
     SELECT p.id::text FROM permissions p
      WHERE p.resource = 'menu-options' AND p.action = 'READ' AND p.deleted_at IS NULL
   ));

-- Grant CREATE/UPDATE/DELETE menu-options to master only
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'menu-options'
           AND p.action IN ('CREATE', 'UPDATE', 'DELETE'))
     ) AS elem
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL
   AND NOT (r.permissions ? (
     SELECT p.id::text FROM permissions p
      WHERE p.resource = 'menu-options' AND p.action = 'CREATE' AND p.deleted_at IS NULL
   ));

-- ════════════════════════════════════════════════════════════════════════
-- 8. Denormalize to users.permissions (F5.1.7 — same pattern as F4)
-- ════════════════════════════════════════════════════════════════════════

-- Propagate to master users
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- Propagate to operador_sistema users
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'operador_sistema'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 9. Seed api_endpoints with current application routes (D5)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO api_endpoints (method, path, description) VALUES
  -- Auth
  ('POST', '/api/auth/login', 'Device login'),
  ('POST', '/api/auth/refresh', 'Refresh JWT'),
  ('POST', '/api/auth/logout', 'Invalidate session'),
  ('GET',  '/api/auth/me', 'Current user context'),
  -- Incidents
  ('GET',    '/api/incidents', 'List incidents'),
  ('POST',   '/api/incidents', 'Create incident'),
  ('GET',    '/api/incidents/stats', 'Incident statistics'),
  ('GET',    '/api/incidents/weekly-stats', 'Weekly statistics'),
  ('GET',    '/api/incidents/feed', 'Incident feed'),
  ('GET',    '/api/incidents/:id', 'Get incident by ID'),
  ('PATCH',  '/api/incidents/:id', 'Update incident'),
  ('DELETE', '/api/incidents/:id', 'Delete incident'),
  -- Comments
  ('GET',    '/api/incidents/:incidentId/comments', 'List comments'),
  ('POST',   '/api/incidents/:incidentId/comments', 'Create comment'),
  ('PATCH',  '/api/comments/:id', 'Update comment'),
  ('DELETE', '/api/comments/:id', 'Delete comment'),
  -- Users
  ('GET',    '/api/users', 'List users'),
  ('POST',   '/api/users', 'Create user'),
  ('GET',    '/api/users/:id', 'Get user by ID'),
  ('PATCH',  '/api/users/:id', 'Update user'),
  ('DELETE', '/api/users/:id', 'Delete user'),
  -- Roles
  ('GET',    '/api/roles', 'List roles'),
  ('POST',   '/api/roles', 'Create role'),
  ('GET',    '/api/roles/:id', 'Get role by ID'),
  ('PATCH',  '/api/roles/:id', 'Update role'),
  ('DELETE', '/api/roles/:id', 'Delete role'),
  -- Organizations
  ('GET',    '/api/organizations', 'List organizations'),
  ('POST',   '/api/organizations', 'Create organization'),
  ('GET',    '/api/organizations/:id', 'Get organization by ID'),
  ('PATCH',  '/api/organizations/:id', 'Update organization'),
  -- Incident categories
  ('GET',    '/api/incident-categories', 'List categories'),
  ('POST',   '/api/incident-categories', 'Create category'),
  ('GET',    '/api/incident-categories/:id', 'Get category by ID'),
  ('PATCH',  '/api/incident-categories/:id', 'Update category'),
  ('DELETE', '/api/incident-categories/:id', 'Delete category'),
  -- Geo zones
  ('GET',    '/api/geo-zones', 'List geo zones'),
  ('POST',   '/api/geo-zones', 'Create geo zone'),
  ('GET',    '/api/geo-zones/:id', 'Get geo zone by ID'),
  ('PATCH',  '/api/geo-zones/:id', 'Update geo zone'),
  ('DELETE', '/api/geo-zones/:id', 'Delete geo zone'),
  -- Assignments
  ('GET',    '/api/assignments', 'List assignments'),
  ('POST',   '/api/assignments', 'Create assignment'),
  ('PATCH',  '/api/assignments/:id', 'Update assignment'),
  ('DELETE', '/api/assignments/:id', 'Delete assignment'),
  -- Notifications
  ('GET',    '/api/notifications', 'List notifications'),
  ('PATCH',  '/api/notifications/:id', 'Mark notification read'),
  ('DELETE', '/api/notifications/:id', 'Delete notification'),
  -- Dashboard
  ('GET',    '/api/operator/dashboard', 'Operator dashboard'),
  -- Permissions
  ('GET',    '/api/permissions', 'List permissions catalog'),
  -- Sessions
  ('GET',    '/api/sessions', 'List user sessions'),
  ('DELETE', '/api/sessions/:id', 'Revoke session'),
  -- Invitations
  ('POST',   '/api/invitations', 'Create invitation'),
  ('GET',    '/api/invitations', 'List invitations'),
  ('DELETE', '/api/invitations/:id', 'Delete invitation'),
  -- Audit logs
  ('GET',    '/api/audit-logs', 'List audit events'),
  ('GET',    '/api/audit-logs/export.csv', 'Export audit events as CSV'),
  -- Menu options (F5.5.4)
  ('GET',    '/api/menu-options', 'List menu options'),
  ('GET',    '/api/menu-options/endpoints', 'Paginated endpoint catalog'),
  ('GET',    '/api/menu-options/:id', 'Get menu option by ID'),
  ('POST',   '/api/menu-options', 'Create menu option'),
  ('PATCH',  '/api/menu-options/:id', 'Update menu option'),
  ('DELETE', '/api/menu-options/:id', 'Delete menu option (soft)'),
  ('GET',    '/api/menu-options/:id/roles', 'Get role matrix for menu option'),
  ('PUT',    '/api/menu-options/:id/roles/:roleId', 'Set role access on menu option'),
  ('PUT',    '/api/menu-options/:id/endpoints', 'Assign endpoints to menu option')
ON CONFLICT (method, path) DO NOTHING;

COMMIT;
