-- 0060_crud_submenu_entries.DOWN.sql — rollback CRUD sub-sub-menu entries
--
-- Removes all CRUD entries (Crear/Editar X) created by 0060, plus the
-- Departamentos parent menu that was added to support them.
--
-- Strategy: DELETE all menu_options rows where:
--   1. name IN ('Crear usuario', 'Editar usuario', ..., 'Crear categoría', 'Editar categoría')
--   2. OR id = 'b0000000-0000-0000-0000-000000000012' (Departamentos parent)
--
-- All menu_option_roles and menu_option_endpoints that reference these
-- entries cascade-delete due to FK ON DELETE CASCADE.

BEGIN;

DELETE FROM menu_options
WHERE (
  -- CRUD sub-menus created in 0060
  name IN (
    'Crear usuario',           'Editar usuario',
    'Crear rol',               'Editar rol',
    'Crear organización',      'Editar organización',
    'Crear departamento',      'Editar departamento',
    'Crear ubicación',         'Editar ubicación',
    'Crear categoría',         'Editar categoría'
  )
  -- OR the Departamentos parent added in 0060
  OR id = 'b0000000-0000-0000-0000-000000000012'
);

-- Record this migration
INSERT INTO schema_migrations (version, name, checksum) VALUES ('0060', '0060_crud_submenu_entries.DOWN.sql', 'manual');

COMMIT;
