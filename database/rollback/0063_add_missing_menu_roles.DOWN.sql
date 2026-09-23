-- 0063_add_missing_menu_roles.DOWN.sql
-- Rollback: remove role assignments for Departamentos + Auditoría de Acceso.
-- Menu entries stay (they may be needed for other features).

BEGIN;

DELETE FROM menu_option_roles
WHERE menu_option_id IN (
  'b0000000-0000-0000-0000-000000000012',  -- Departamentos
  'b0000000-0000-0000-0000-000000000013'   -- Auditoría de Acceso
);

DELETE FROM schema_migrations WHERE version = '0063';

COMMIT;
