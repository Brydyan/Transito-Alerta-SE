-- 0061_inherit_crud_submenu_perms.DOWN.sql — rollback inherited CRUD permissions
--
-- Removes all menu_option_roles rows that were created by 0061 to inherit
-- parent permissions to CRUD children (Crear/Editar X entries).
--
-- Strategy: DELETE from menu_option_roles where menu_option_id references
-- one of the 12 CRUD child entries (identified by name pattern).

BEGIN;

DELETE FROM menu_option_roles
WHERE menu_option_id IN (
  SELECT id FROM menu_options
  WHERE name IN (
    'Crear usuario',           'Editar usuario',
    'Crear rol',               'Editar rol',
    'Crear organización',      'Editar organización',
    'Crear departamento',      'Editar departamento',
    'Crear ubicación',         'Editar ubicación',
    'Crear categoría',         'Editar categoría'
  )
);

-- Record this migration
INSERT INTO schema_migrations (version, name, checksum) VALUES ('0061', '0061_inherit_crud_submenu_perms.DOWN.sql', 'manual');

COMMIT;
