-- 0038_reporter_menu_access
--
-- El rol `reporter` no tenía ninguna fila en `menu_option_roles`, por lo
-- que `getAccessibleOptions` devolvía [] vía INNER JOIN y el sidebar
-- quedaba vacío. El reporter sólo necesita dos entradas:
--   - Inicio     (READ incidents)  — ver el feed de incidencias
--   - Reportar   (CREATE incidents) — crear una nueva incidencia
--
-- IDs fijos definidos en 0029_dynamic_menus_data_migration.sql:
--   Inicio   → b0000000-0000-0000-0000-000000000002
--   Reportar → b0000000-0000-0000-0000-000000000005

BEGIN;

INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT
  mo.id,
  r.id,
  true,
  false
FROM menu_options mo
CROSS JOIN roles r
WHERE mo.id IN (
  'b0000000-0000-0000-0000-000000000002',  -- Inicio
  'b0000000-0000-0000-0000-000000000005'   -- Reportar
)
AND r.name = 'reporter'
ON CONFLICT (menu_option_id, role_id)
  DO UPDATE SET can_read = true, can_write = EXCLUDED.can_write;

COMMIT;
