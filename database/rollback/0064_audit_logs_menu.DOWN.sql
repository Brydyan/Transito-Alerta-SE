-- 0064_audit_logs_menu.DOWN.sql
-- Rollback for 0064.
-- Reverts to the exact pre-0064 state:
--   - "Auditoría de Acceso" menu option: removed entirely (it did not exist
--     before 0064 — no migration ever seeded it)
--   - its menu_option_roles rows: removed by the ON DELETE CASCADE declared
--     in 0054, so no separate DELETE is needed
--
-- Following the 0063 convention, this file reverts data only and leaves the
-- schema_migrations row in place; `run-migrations.ts --down --to <version>`
-- owns the bookkeeping.

BEGIN;

-- 1) Drop the menu option. menu_option_roles cascades (0054: ON DELETE CASCADE).
--    Matched by route rather than by name so the revert is independent of a
--    rename, and scoped to non-deleted rows so a soft-deleted lookalike that
--    predates 0064 is never touched.
DELETE FROM menu_options
WHERE route = '/admin/audit-logs'
  AND deleted_at IS NULL;

COMMIT;
