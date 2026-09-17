-- 0055_dynamic_menus_data_migration.DOWN.sql
-- Rollback for F5 data migration.
-- Removes all seeded menu_options and menu_option_roles rows.

BEGIN;

DELETE FROM menu_option_roles;
DELETE FROM menu_options;

COMMIT;
