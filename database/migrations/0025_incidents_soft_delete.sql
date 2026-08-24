-- T6.2.A1 — Add soft-delete column to incidents table
BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Partial index for fast "active" lookups
CREATE INDEX IF NOT EXISTS idx_incidents_deleted_at
  ON incidents (deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;
