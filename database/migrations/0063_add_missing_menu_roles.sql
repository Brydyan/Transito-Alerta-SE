-- 0063_add_missing_menu_roles.sql
-- Assigns role permissions to menu_options that were inserted but never got
-- role matrix entries in menu_option_roles. This prevents orphaned menu items
-- from being filtered out by MenusService.getAccessibleOptions().
--
-- Items fixed:
-- 1. Departamentos (id=b0000000-0000-0000-0000-000000000012, added by 0060)
--    Requires: READ departments
--    Should grant to: master, operador_sistema
--
-- 2. Auditoría de Acceso (id placeholder, needs insert too)
--    Requires: READ audit-logs
--    Should grant to: master, operador_sistema
--
-- Context: 0055 seeded 10 items + roles. 0060 added Departamentos parent
-- but forgot menu_option_roles. F1 spec + D3 require EVERY menu_option
-- to have a role assignment or getAccessibleOptions() filters it out.

BEGIN;

-- Ensure Departamentos exists in menu_options (idempotent)
INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  ('b0000000-0000-0000-0000-000000000012', 'Departamentos', '/admin/departamentos', 'building-2', 'a0000000-0000-0000-0000-000000000002', 82, true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Assign Departamentos roles: READ departments → master, operador_sistema
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000012', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Ensure Auditoría de Acceso exists (from MENU_MAP, line 120-125)
INSERT INTO menu_options
  (id, name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
VALUES
  ('b0000000-0000-0000-0000-000000000013', 'Auditoría de Acceso', '/admin/audit-logs', 'file-text', 'a0000000-0000-0000-0000-000000000002', 85, true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Assign Auditoría de Acceso roles: READ audit-logs → master, operador_sistema
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000013', r.id, true, false
FROM roles r
WHERE r.name IN ('master', 'operador_sistema')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Record this migration
INSERT INTO schema_migrations (version, name, checksum) VALUES ('0063', '0063_add_missing_menu_roles.sql', 'manual');

COMMIT;
