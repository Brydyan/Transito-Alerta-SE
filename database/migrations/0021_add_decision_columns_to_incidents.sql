-- 0021_add_decision_columns_to_incidents.sql
-- Transito Alerta SE — T5.6: admin approve/reject decision columns.
-- Rollback: 0021_add_decision_columns_to_incidents.DOWN.sql

BEGIN;

-- Decision columns. approved_* and rejected_* must be set as a pair (XOR
-- with each other) — enforced by 3 CHECK constraints below.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Pair constraint: both or neither of approved_by / approved_at.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_approved_pair_check'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_approved_pair_check
      CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR
        (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      );
  END IF;
END $$;

-- Pair constraint for rejected_*.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_rejected_pair_check'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_rejected_pair_check
      CHECK (
        (rejected_by IS NULL AND rejected_at IS NULL)
        OR
        (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)
      );
  END IF;
END $$;

-- XOR: cannot have both approved_by AND rejected_by set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_decision_xor_check'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_decision_xor_check
      CHECK (NOT (approved_by IS NOT NULL AND rejected_by IS NOT NULL));
  END IF;
END $$;

-- Partial index for the "show me approved-only" / "approved in last 7
-- days" style queries. Rejected doesn't need a dedicated index —
-- rejected counts are tiny relative to total incidents.
CREATE INDEX IF NOT EXISTS idx_incidents_approved_at
  ON incidents (approved_at)
  WHERE approved_at IS NOT NULL;

COMMIT;
