-- 0021_add_decision_columns_to_incidents.DOWN.sql
-- Reverses 0021. Refuses to drop the columns if any decision is recorded
-- (data loss).

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM incidents WHERE approved_by IS NOT NULL OR rejected_by IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0021: incidents with decision columns populated exist';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_incidents_approved_at;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_decision_xor_check;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_rejected_pair_check;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_approved_pair_check;
ALTER TABLE incidents DROP COLUMN IF EXISTS rejection_reason;
ALTER TABLE incidents DROP COLUMN IF EXISTS rejected_at;
ALTER TABLE incidents DROP COLUMN IF EXISTS rejected_by;
ALTER TABLE incidents DROP COLUMN IF EXISTS approved_at;
ALTER TABLE incidents DROP COLUMN IF EXISTS approved_by;

COMMIT;
