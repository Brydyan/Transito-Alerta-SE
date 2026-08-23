-- 0023_add_notes_to_status_history.sql
-- Transito Alerta SE — T5.6: add `notes` column to status_history for the
-- reject reason (D4 design — reject writes a Comment-like notes row).
-- Rollback: 0023_add_notes_to_status_history.DOWN.sql

BEGIN;

ALTER TABLE status_history
  ADD COLUMN IF NOT EXISTS notes text;

COMMIT;
