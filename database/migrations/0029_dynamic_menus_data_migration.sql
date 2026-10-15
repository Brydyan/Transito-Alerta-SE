-- 0029_dynamic_menus_data_migration.sql
-- F5 (2026-08-29-f5-dynamic-menus) — seeds all menu_options and
-- menu_option_roles from the complete MENU_MAP state.
--
-- Group B consolidation (2026-10-14): fused data addenda and fixes from:
--   0057_dynamic_menus_controles     — "Controles" leaf missing from original seed
--   0060_crud_submenu_entries         — Departamentos parent + 12 CRUD leaves
--   0061_inherit_crud_submenu_perms   — role inheritance for CRUD leaves
--   0063_gestion_root_and_departments_matrix — GESTIÓN + Departamentos role fix
--   0064_fix_organizaciones_departamentos_routes — route corrections (baked in)
--
-- Group H absorption (2026-10-14): also fused:
--   0064_audit_logs_menu — "Auditoría de Acceso" menu option (F6, master only).
--     Uses WHERE NOT EXISTS guard (idempotent). Placed after the GESTIÓN matrix
--     so the parent (a0000000-...-002) already exists when this INSERT runs.
--
-- UUIDs are deterministic throughout so this file is fully idempotent
-- (ON CONFLICT (id) DO NOTHING / ON CONFLICT DO NOTHING guards everywhere).
-- 0057, 0060, 0061, 0063, 0064_fix, 0064_audit_logs_menu are no-ops after this merge.
--
-- Requires: 0028 (schema with menu_options, menu_option_roles tables).
--
-- DOWN: database/rollback/0029_dynamic_menus_data_migration.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Group parent rows  (a0000000-... series)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'INCIDENCIAS', '', NULL, NULL,  20, true),
  ('a0000000-0000-0000-0000-000000000002', 'GESTIÓN',     '', NULL, NULL,  60, true),
  ('a0000000-0000-0000-0000-000000000003', 'CATÁLOGOS',   '', NULL, NULL,  90, true)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Leaf items  (b0000000-... series)
--    Routes baked-in correctly (/admin/... prefix where applicable).
-- ════════════════════════════════════════════════════════════════════════

-- Dashboard (no group, top-level)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Dashboard', '/dashboard', 'layout-dashboard', NULL, 10, true)
ON CONFLICT (id) DO NOTHING;

-- INCIDENCIAS children
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Inicio',               '/inicio',      'home',        'a0000000-0000-0000-0000-000000000001', 20,  true),
  ('b0000000-0000-0000-0000-000000000003', 'Lista de Incidencias', '/incidencias', 'list',        'a0000000-0000-0000-0000-000000000001', 30,  true),
  ('b0000000-0000-0000-0000-000000000004', 'Mapa',                 '/mapa',        'map',         'a0000000-0000-0000-0000-000000000001', 40,  true),
  ('b0000000-0000-0000-0000-000000000005', 'Reportar',             '/reportar',    'plus-circle', 'a0000000-0000-0000-0000-000000000001', 50,  true)
ON CONFLICT (id) DO NOTHING;

-- GESTIÓN children (routes correct from day one; 0064_fix is a no-op after this)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000006', 'Usuarios',       '/admin/users',            'users',    'a0000000-0000-0000-0000-000000000002', 60,  true),
  ('b0000000-0000-0000-0000-000000000007', 'Roles',          '/admin/roles',            'shield',   'a0000000-0000-0000-0000-000000000002', 70,  true),
  ('b0000000-0000-0000-0000-000000000008', 'Organizaciones', '/admin/organizaciones',   'building-2','a0000000-0000-0000-0000-000000000002', 80,  true),
  ('b0000000-0000-0000-0000-000000000012', 'Departamentos',  '/admin/departamentos',    'network',  'a0000000-0000-0000-0000-000000000002', 81,  true),
  ('b0000000-0000-0000-0000-000000000011', 'Controles',      '/admin/controles',         'settings', 'a0000000-0000-0000-0000-000000000002', 85,  true)
ON CONFLICT (id) DO NOTHING;

-- CATÁLOGOS children
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000009', 'Categorías',  '/categorias', 'tag',     'a0000000-0000-0000-0000-000000000003', 90,  true),
  ('b0000000-0000-0000-0000-000000000010', 'Ubicaciones', '/ubicaciones','map-pin', 'a0000000-0000-0000-0000-000000000003', 100, true)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 3. CRUD leaves  (c0000000-... series — fixed UUIDs, fully idempotent)
--    Previously seeded by 0060 with gen_random_uuid() (non-idempotent).
-- ════════════════════════════════════════════════════════════════════════

-- Usuarios CRUD (parent b0000000-...-006, order 60)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Crear usuario',  '/admin/users/new', 'user-plus', 'b0000000-0000-0000-0000-000000000006', 61, true),
  ('c0000000-0000-0000-0000-000000000002', 'Editar usuario', '/admin/users',     'user-edit', 'b0000000-0000-0000-0000-000000000006', 62, true)
ON CONFLICT (id) DO NOTHING;

-- Roles CRUD (parent b0000000-...-007, order 70)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000003', 'Crear rol',  '/admin/roles/new', 'shield-plus',  'b0000000-0000-0000-0000-000000000007', 71, true),
  ('c0000000-0000-0000-0000-000000000004', 'Editar rol', '/admin/roles',     'shield-check', 'b0000000-0000-0000-0000-000000000007', 72, true)
ON CONFLICT (id) DO NOTHING;

-- Organizaciones CRUD (parent b0000000-...-008, order 80)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000005', 'Crear organización',  '/admin/organizaciones/new', 'building-2-plus', 'b0000000-0000-0000-0000-000000000008', 81, true),
  ('c0000000-0000-0000-0000-000000000006', 'Editar organización', '/admin/organizaciones',     'building-2-edit', 'b0000000-0000-0000-0000-000000000008', 82, true)
ON CONFLICT (id) DO NOTHING;

-- Departamentos CRUD (parent b0000000-...-012, order 81)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000007', 'Crear departamento',  '/admin/departamentos/new', 'network-plus', 'b0000000-0000-0000-0000-000000000012', 91, true),
  ('c0000000-0000-0000-0000-000000000008', 'Editar departamento', '/admin/departamentos',     'network-edit', 'b0000000-0000-0000-0000-000000000012', 92, true)
ON CONFLICT (id) DO NOTHING;

-- Ubicaciones CRUD (parent b0000000-...-010, order 100)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000009', 'Crear ubicación',  '/admin/ubicaciones/new', 'map-pin-plus', 'b0000000-0000-0000-0000-000000000010', 111, true),
  ('c0000000-0000-0000-0000-000000000010', 'Editar ubicación', '/admin/ubicaciones',     'map-pin-edit', 'b0000000-0000-0000-0000-000000000010', 112, true)
ON CONFLICT (id) DO NOTHING;

-- Categorías CRUD (parent b0000000-...-009, order 90)
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000011', 'Crear categoría',  '/admin/categorias/new', 'tag-plus', 'b0000000-0000-0000-0000-000000000009', 121, true),
  ('c0000000-0000-0000-0000-000000000012', 'Editar categoría', '/admin/categorias',     'tag-edit', 'b0000000-0000-0000-0000-000000000009', 122, true)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 4. menu_option_roles — complete matrix from day one
--
-- Role rules (post-0063 canonical state):
--   all-staff (master, agent_system, admin_org, operator_org):
--     Dashboard, INCIDENCIAS group + its leaves, CATÁLOGOS group + its leaves
--   management-only (master, agent_system):
--     GESTIÓN group, Usuarios, Roles  [0029 original]
--   GESTIÓN extended (+ admin_org, operator_org per 0063):
--     GESTIÓN root, Organizaciones, Org CRUD leaves, Ubicaciones, Cat leaves
--   Departamentos (0063): master+agent_system CAN write, admin_org read-only
--   Controles (0057): master CAN write, agent_system read-only
-- ════════════════════════════════════════════════════════════════════════

-- ── Dashboard + INCIDENCIAS group + its 4 leaves: all 4 staff roles ─────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'b0000000-0000-0000-0000-000000000001',  -- Dashboard
  'a0000000-0000-0000-0000-000000000001',  -- INCIDENCIAS group
  'b0000000-0000-0000-0000-000000000002',  -- Inicio
  'b0000000-0000-0000-0000-000000000003',  -- Lista de Incidencias
  'b0000000-0000-0000-0000-000000000004',  -- Mapa
  'b0000000-0000-0000-0000-000000000005'   -- Reportar
)
AND r.name IN ('master', 'agent_system', 'admin_org', 'operator_org')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- ── GESTIÓN root: all 4 staff (0063 added admin_org + operator_org) ─────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'a0000000-0000-0000-0000-000000000002', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'agent_system', 'admin_org', 'operator_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;

-- ── Usuarios + Roles: management-only ────────────────────────────────────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'b0000000-0000-0000-0000-000000000006',  -- Usuarios
  'b0000000-0000-0000-0000-000000000007'   -- Roles
)
AND r.name IN ('master', 'agent_system')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- ── Usuarios + Roles CRUD leaves: same as parent (management-only) ───────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'c0000000-0000-0000-0000-000000000001',  -- Crear usuario
  'c0000000-0000-0000-0000-000000000002',  -- Editar usuario
  'c0000000-0000-0000-0000-000000000003',  -- Crear rol
  'c0000000-0000-0000-0000-000000000004'   -- Editar rol
)
AND r.name IN ('master', 'agent_system')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- ── Organizaciones + its CRUD leaves: all 4 staff ────────────────────────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'b0000000-0000-0000-0000-000000000008',  -- Organizaciones
  'c0000000-0000-0000-0000-000000000005',  -- Crear organización
  'c0000000-0000-0000-0000-000000000006'   -- Editar organización
)
AND r.name IN ('master', 'agent_system', 'admin_org', 'operator_org')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- ── Departamentos parent: master+agent_system WRITE, admin_org READ ──
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000012', r.id,
       true,
       CASE WHEN r.name = 'admin_org' THEN false ELSE true END
FROM roles r
WHERE r.name IN ('master', 'agent_system', 'admin_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read  = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

-- ── Departamentos CRUD leaves: inherit Departamentos matrix ──────────────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id,
       true,
       CASE WHEN r.name = 'admin_org' THEN false ELSE true END
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'c0000000-0000-0000-0000-000000000007',  -- Crear departamento
  'c0000000-0000-0000-0000-000000000008'   -- Editar departamento
)
AND r.name IN ('master', 'agent_system', 'admin_org')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read  = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

-- ── Controles: master WRITE, agent_system READ ───────────────────────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000011', r.id,
       true,
       CASE WHEN r.name = 'master' THEN true ELSE false END
FROM roles r
WHERE r.name IN ('master', 'agent_system')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- ── CATÁLOGOS group + Categorías + Ubicaciones + their CRUD leaves ───────
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'a0000000-0000-0000-0000-000000000003',  -- CATÁLOGOS group
  'b0000000-0000-0000-0000-000000000009',  -- Categorías
  'b0000000-0000-0000-0000-000000000010',  -- Ubicaciones
  'c0000000-0000-0000-0000-000000000009',  -- Crear ubicación
  'c0000000-0000-0000-0000-000000000010',  -- Editar ubicación
  'c0000000-0000-0000-0000-000000000011',  -- Crear categoría
  'c0000000-0000-0000-0000-000000000012'   -- Editar categoría
)
AND r.name IN ('master', 'agent_system', 'admin_org', 'operator_org')
AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Auditoría de Acceso menu option (absorbed from 0064_audit_logs_menu)
--
--    F6 shipped the complete audit-logs screen but never seeded the
--    menu_options row (the same process gap that 0060 fixed for
--    Departamentos). Placed under GESTIÓN root (a0000000-...-002),
--    display_order 85 (between Departamentos 81 and Controles 85 →
--    audit-logs takes 85, Controles bumped to 88 if needed).
--
--    Access: master ONLY. Route guard requires READ audit-logs (0009);
--    granting the menu to extra roles would produce a visible item that
--    permissionGuard then rejects — a phantom entry.
--
--    WHERE NOT EXISTS guard: idempotent, safe to re-run.
--
--    Operational note: Redis menu cache (menu:v1:user:{userId}, 1h TTL)
--    must be flushed after applying for the change to be visible.
-- ════════════════════════════════════════════════════════════════════════
INSERT INTO menu_options
  (name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
SELECT 'Auditoría de Acceso', '/admin/audit-logs', 'file-text',
       'a0000000-0000-0000-0000-000000000002', 85, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM menu_options
  WHERE route = '/admin/audit-logs' AND deleted_at IS NULL
);

INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT m.id, r.id, true, false
FROM menu_options m, roles r
WHERE m.route = '/admin/audit-logs'
  AND m.deleted_at IS NULL
  AND r.name = 'master'
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read  = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

COMMIT;
