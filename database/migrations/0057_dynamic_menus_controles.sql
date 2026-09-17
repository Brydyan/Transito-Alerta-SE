-- 0057_dynamic_menus_controles.sql
-- F5 fix (2026-09-14) — inserta la opción faltante "Controles" (/controles)
-- bajo GESTIÓN que la migración 0055 omitió (13 menúes en 0055, faltaba
-- el 14.º que expone el CRUD de menu-options en /app/controles).
--
-- Requiere: 0054 (schema con menu_options, menu_option_roles, permissions
-- catalog con menu-options:READ/CREATE/UPDATE/DELETE), 0055 (seed base).
--
-- DOWN: database/rollback/0057_dynamic_menus_controles.DOWN.sql
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. Seed menu_options — "Controles" bajo GESTIÓN
-- ────────────────────────────────────────────────────────────────
-- GESTIÓN group parent: a0000000-0000-0000-0000-000000000002
-- CATÁLOGOS group parent: a0000000-0000-0000-0000-000000000003 (order 90)
-- Controles va entre Organizaciones (80) y CATÁLOGOS (90) → 85.
INSERT INTO menu_options (id, name, route, icon, parent_id, display_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000011', 'Controles', '/controles', 'settings', 'a0000000-0000-0000-0000-000000000002', 85, true)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 2. Derive menu_option_roles desde el permiso menu-options:READ
-- ────────────────────────────────────────────────────────────────
-- El menú "Controles" expone el CRUD de menu-options:
--   READ   → master + operador_sistema (0054 concedió READ a ambos)
--   CREATE/UPDATE/DELETE → solo master (0054 concedió write solo a master)
-- can_write distingue: master=true (puede editar), operador_sistema=false (solo lectura).

-- master: can_read=true, can_write=true
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000011', r.id, true, true
FROM roles r
WHERE r.name = 'master'
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- operador_sistema: can_read=true, can_write=false
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000011', r.id, true, false
FROM roles r
WHERE r.name = 'operador_sistema'
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

COMMIT;
