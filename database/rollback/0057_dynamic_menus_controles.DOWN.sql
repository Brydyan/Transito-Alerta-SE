-- 0057_dynamic_menus_controles.DOWN.sql
-- Rollback for F5 fix — removes the "Controles" menu option and its
-- role matrix rows. Idempotent: only deletes the seeded id if present.

BEGIN;

DELETE FROM menu_option_roles
 WHERE menu_option_id = 'b0000000-0000-0000-0000-000000000011';

DELETE FROM menu_options
 WHERE id = 'b0000000-0000-0000-0000-000000000011';

COMMIT;
