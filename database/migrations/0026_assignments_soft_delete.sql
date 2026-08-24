-- T6.2.A2 — Add soft-delete column to assignments table, replace hard UNIQUE with partial
BEGIN;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Drop the existing hard UNIQUE constraint (named uq_assignments_incident in migration 0007)
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS uq_assignments_incident;
-- Also try the alternative name in case this schema was created differently
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_incident_id_operator_id_key;

-- Partial UNIQUE: only one active (non-deleted) assignment per (incident, operator)
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active
  ON assignments (incident_id, operator_id)
  WHERE deleted_at IS NULL;

-- Index for deleted_at lookups
CREATE INDEX IF NOT EXISTS idx_assignments_deleted_at
  ON assignments (deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;
