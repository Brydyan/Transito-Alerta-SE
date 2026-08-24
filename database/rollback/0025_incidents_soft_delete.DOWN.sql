-- Rollback T6.2.A1 — Remove soft-delete column from incidents
BEGIN;

DROP INDEX IF EXISTS idx_incidents_deleted_at;

ALTER TABLE incidents
  DROP COLUMN IF EXISTS deleted_at;

COMMIT;
