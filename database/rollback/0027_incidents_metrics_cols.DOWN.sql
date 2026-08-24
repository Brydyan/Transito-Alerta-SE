-- Rollback T6.3 — Remove claimed_at and resolution_date from incidents
BEGIN;

DROP INDEX IF EXISTS idx_incidents_resolution_date;

ALTER TABLE incidents
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS resolution_date;

COMMIT;
