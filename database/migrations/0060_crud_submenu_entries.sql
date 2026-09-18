-- 0060 — CRUD sub-sub-menu entries
--
-- Adds "Crear X" + "Editar X" menu entries under each sub-menu that has
-- a CRUD route. Today the menu_options table has 2 levels (root groups
-- + leaf sub-menus); the CRUD pages (e.g., /admin/users/new) live in
-- the router but not as menu entries. Without these entries, clicking
-- "Usuarios" in the sidebar only opens the list — there's no way to
-- reach "Crear usuario" via the menu tree.
--
-- This migration does NOT introduce a new feature — it makes the menu
-- reflect the CRUD routes that already exist in app.routes.ts.
--
-- display_order convention (per task spec): sub-menus use increments
-- of 1 relative to their parent.
--
-- Routes match the router (admin-controles route paths in
-- frontend/src/app/app.routes.ts). The seed migration that introduced
-- the parent entries used slightly different paths
-- (e.g., /organizaciones vs /admin/organizaciones) — those existing
-- routes are NOT touched here.

BEGIN;

-- ── Departamentos parent menu (missing from 0055 seed) ──
-- Insert the parent "Departamentos" menu under GESTIÓN group if not already present.
-- This was added to MENU_MAP after the initial migration but never seeded as a menu_option.
INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  ('b0000000-0000-0000-0000-000000000012', 'Departamentos', '/departamentos', 'network', 'a0000000-0000-0000-0000-000000000002', 81, true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── Usuarios (parent b0000000-0000-0000-0000-000000000006, order 60) ──

INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Crear usuario',   '/admin/users/new', 'user-plus', 'b0000000-0000-0000-0000-000000000006', 61, true, now(), now()),
  (gen_random_uuid(), 'Editar usuario',  '/admin/users',     'user-edit', 'b0000000-0000-0000-0000-000000000006', 62, true, now(), now());

-- ── Roles (parent b0000000-0000-0000-0000-000000000007, order 70) ────────

INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Crear rol',   '/admin/roles/new', 'shield-plus',  'b0000000-0000-0000-0000-000000000007', 71, true, now(), now()),
  (gen_random_uuid(), 'Editar rol',  '/admin/roles',     'shield-check', 'b0000000-0000-0000-0000-000000000007', 72, true, now(), now());

-- ── Organizaciones (parent b0000000-0000-0000-0000-000000000008, order 80) ─

INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Crear organización',  '/admin/organizaciones/new', 'building-2-plus',   'b0000000-0000-0000-0000-000000000008', 81, true, now(), now()),
  (gen_random_uuid(), 'Editar organización', '/admin/organizaciones',     'building-2-edit',   'b0000000-0000-0000-0000-000000000008', 82, true, now(), now());

-- ── Departamentos (parent b0000000-0000-0000-0000-000000000012, order 90) ──

INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Crear departamento',  '/admin/departamentos/new', 'network-plus',  'b0000000-0000-0000-0000-000000000012', 91, true, now(), now()),
  (gen_random_uuid(), 'Editar departamento', '/admin/departamentos',     'network-edit',  'b0000000-0000-0000-0000-000000000012', 92, true, now(), now());

-- ── Ubicaciones (parent b0000000-0000-0000-0000-000000000010, order 110) ─

INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Crear ubicación',  '/admin/ubicaciones/new', 'map-pin-plus',  'b0000000-0000-0000-0000-000000000010', 111, true, now(), now()),
  (gen_random_uuid(), 'Editar ubicación', '/admin/ubicaciones',     'map-pin-edit',  'b0000000-0000-0000-0000-000000000010', 112, true, now(), now());

-- ── Categorías (parent b0000000-0000-0000-0000-000000000009, order 120) ──

INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Crear categoría',  '/admin/categorias/new', 'tag-plus',   'b0000000-0000-0000-0000-000000000009', 121, true, now(), now()),
  (gen_random_uuid(), 'Editar categoría', '/admin/categorias',     'tag-edit',   'b0000000-0000-0000-0000-000000000009', 122, true, now(), now());

-- Record this migration
INSERT INTO schema_migrations (version, name, checksum) VALUES ('0060', '0060_crud_submenu_entries.sql', 'manual');

COMMIT;
