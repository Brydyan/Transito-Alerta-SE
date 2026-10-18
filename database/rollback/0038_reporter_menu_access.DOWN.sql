-- Rollback 0038_reporter_menu_access
-- Elimina el acceso de menu del rol reporter a Inicio y Reportar.

BEGIN;

DELETE FROM menu_option_roles
WHERE menu_option_id IN (
  'b0000000-0000-0000-0000-000000000002',  -- Inicio
  'b0000000-0000-0000-0000-000000000005'   -- Reportar
)
AND role_id = (SELECT id FROM roles WHERE name = 'reporter');

COMMIT;
