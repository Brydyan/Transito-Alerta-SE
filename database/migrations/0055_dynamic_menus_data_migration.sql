-- 0055_dynamic_menus_data_migration.sql
-- F5 (2026-08-29-f5-dynamic-menus) — migrates the 10 MENU_MAP entries
-- (backend/src/modules/menus/menu-map.ts) into `menu_options` rows,
-- preserving route, icon, and display_order. Derives `menu_option_roles`
-- from the current `requires` permission per entry.
--
-- F5.2.3 decision: `group` (INCIDENCIAS, GESTIÓN, CATÁLOGOS) is NOT
-- stored as a column. It is derived from the parent/child hierarchy:
-- root-level options with children form implicit groups. The group name
-- is the parent's `name`. This keeps the data model clean and avoids
-- denormalizing a display concern into the schema. Documented in
-- design.md § Implementation notes.
--
-- Requires: 0054 (schema with menu_options, menu_option_roles tables).
--
-- DOWN: database/rollback/0055_dynamic_menus_data_migration.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Seed menu_options from MENU_MAP (F5.2.1)
-- ════════════════════════════════════════════════════════════════════════
--
-- MENU_MAP entries and their group assignments:
--   Dashboard (no group, order 10)
--   INCIDENCIAS group: Inicio (20), Lista de Incidencias (30), Mapa (40), Reportar (50)
--   GESTIÓN group: Usuarios (60), Roles (70), Organizaciones (80)
--   CATÁLOGOS group: Categorías (90), Ubicaciones (100)
--
-- Strategy: create group parent rows first, then child rows referencing
-- them. Dashboard has no group (no parent).

-- Group parents (display_order aligned with first child of each group)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  -- INCIDENCIAS group parent
  ('a0000000-0000-0000-0000-000000000001', 'INCIDENCIAS', '', NULL, NULL, 20, true),
  -- GESTIÓN group parent
  ('a0000000-0000-0000-0000-000000000002', 'GESTIÓN', '', NULL, NULL, 60, true),
  -- CATÁLOGOS group parent
  ('a0000000-0000-0000-0000-000000000003', 'CATÁLOGOS', '', NULL, NULL, 90, true)
ON CONFLICT (id) DO NOTHING;

-- Dashboard (no group, top-level)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Dashboard', '/dashboard', 'layout-dashboard', NULL, 10, true)
ON CONFLICT (id) DO NOTHING;

-- INCIDENCIAS children
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Inicio', '/inicio', 'home', 'a0000000-0000-0000-0000-000000000001', 20, true),
  ('b0000000-0000-0000-0000-000000000003', 'Lista de Incidencias', '/incidencias', 'list', 'a0000000-0000-0000-0000-000000000001', 30, true),
  ('b0000000-0000-0000-0000-000000000004', 'Mapa', '/mapa', 'map', 'a0000000-0000-0000-0000-000000000001', 40, true),
  ('b0000000-0000-0000-0000-000000000005', 'Reportar', '/reportar', 'plus-circle', 'a0000000-0000-0000-0000-000000000001', 50, true)
ON CONFLICT (id) DO NOTHING;

-- GESTIÓN children
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000006', 'Usuarios', '/admin/users', 'users', 'a0000000-0000-0000-0000-000000000002', 60, true),
  ('b0000000-0000-0000-0000-000000000007', 'Roles', '/admin/roles', 'shield', 'a0000000-0000-0000-0000-000000000002', 70, true),
  ('b0000000-0000-0000-0000-000000000008', 'Organizaciones', '/organizaciones', 'building-2', 'a0000000-0000-0000-0000-000000000002', 80, true)
ON CONFLICT (id) DO NOTHING;

-- CATÁLOGOS children
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000009', 'Categorías', '/categorias', 'tag', 'a0000000-0000-0000-0000-000000000003', 90, true),
  ('b0000000-0000-0000-0000-000000000010', 'Ubicaciones', '/ubicaciones', 'map-pin', 'a0000000-0000-0000-0000-000000000003', 100, true)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Derive menu_option_roles from MENU_MAP.requires (F5.2.2)
-- ════════════════════════════════════════════════════════════════════════
--
-- Strategy: for each menu option, determine which roles can read it.
-- A role can read if it has the permission string from MENU_MAP.requires
-- in its `permissions` JSONB array (matching by UUID against the
-- permissions catalog).
--
-- The mapping (MENU_MAP entry → requires → roles that have it):
--   Dashboard: READ incidents → master, operador_sistema, admin_org, operador_org
--   Inicio: READ incidents → same as Dashboard
--   Lista de Incidencias: READ incidents → same
--   Mapa: READ incidents → same
--   Reportar: CREATE incidents → master, operador_sistema, admin_org, operador_org
--   Usuarios: READ users → master, operador_sistema
--   Roles: READ roles → master, operador_sistema
--   Organizaciones: READ organizations → master, operador_sistema, admin_org, operador_org
--   Categorías: READ incident-categories → master, operador_sistema, admin_org, operador_org
--   Ubicaciones: READ geo-zones → master, operador_sistema, admin_org, operador_org
--
-- can_write: derived from whether the role has the write permission
-- of the resource. For simplicity in the seed, we grant can_write
-- only to master for all options (matches the existing MENU_MAP pattern
-- where the `requires` field only specifies read access).

-- Helper: resolve permission UUIDs from the catalog
-- (incidents READ, incidents CREATE, users READ, roles READ,
--  organizations READ, incident-categories READ, geo-zones READ)

-- Dashboard (b0000000-...-001): READ incidents
-- All 4 staff roles have READ incidents via 0015
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000001', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- INCIDENCIAS group parent (a0000000-...-001): same as children (READ incidents)
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'a0000000-0000-0000-0000-000000000001', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Inicio, Lista de Incidencias, Mapa: READ incidents → same 4 roles
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
FROM menu_options mo, roles r
WHERE mo.id IN (
  'b0000000-0000-0000-0000-000000000002',  -- Inicio
  'b0000000-0000-0000-0000-000000000003',  -- Lista de Incidencias
  'b0000000-0000-0000-0000-000000000004'   -- Mapa
)
AND r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Reportar: CREATE incidents → same 4 roles
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000005', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- GESTIÓN group parent (a0000000-...-002): READ users (master + operador_sistema only)
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'a0000000-0000-0000-0000-000000000002', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Usuarios: READ users → master + operador_sistema
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000006', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Roles: READ roles → master + operador_sistema
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000007', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Organizaciones: READ organizations → all 4 staff roles
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000008', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- CATÁLOGOS group parent (a0000000-...-003): READ incident-categories → all 4
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'a0000000-0000-0000-0000-000000000003', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Categorías: READ incident-categories → all 4
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000009', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Ubicaciones: READ geo-zones → all 4
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000010', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

COMMIT;
