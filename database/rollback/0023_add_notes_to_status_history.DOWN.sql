-- 0023_add_notes_to_status_history.DOWN.sql
-- Reverses 0023. data loss: any notes written are dropped.

BEGIN;

ALTER TABLE status_history DROP COLUMN IF EXISTS notes;

COMMIT;
