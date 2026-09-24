-- 0063_gestion_root_and_departments_matrix.DOWN.sql
-- Rollback for 0063.
-- Reverts to the exact pre-0063 state:
--   - GESTIÓN root: back to master + operador_sistema only
--   - Departamentos parent: back to NO role rows (pre-0063 it was empty —
--     0060 created the menu with no rows and 0061 copied nothing from an
--     empty parent, so the only rows that can exist here are 0063's own)
--   - Crear/Editar departamento: back to no role rows

BEGIN;

-- 1) Remove the roles 0063 granted on the GESTIÓN root
DELETE FROM menu_option_roles
WHERE menu_option_id = 'a0000000-0000-0000-0000-000000000002'
  AND role_id IN (
    SELECT id FROM roles WHERE name IN ('admin_org', 'operador_org') AND deleted_at IS NULL
  );

-- 2) Remove every role row 0063 created/updated on the Departamentos parent
--    (master, operador_sistema, admin_org). Pre-0063 this menu had no rows,
--    so deleting exactly the rows the migration wrote restores the state.
DELETE FROM menu_option_roles
WHERE menu_option_id = 'b0000000-0000-0000-0000-000000000012'
  AND role_id IN (
    SELECT id FROM roles WHERE name IN ('master', 'operador_sistema', 'admin_org') AND deleted_at IS NULL
  );

-- 3) Remove all role rows 0063 inherited to the CRUD children
DELETE FROM menu_option_roles
WHERE menu_option_id IN (
  SELECT id FROM menu_options
  WHERE parent_id = 'b0000000-0000-0000-0000-000000000012'
    AND name IN ('Crear departamento', 'Editar departamento')
    AND deleted_at IS NULL
);

COMMIT;