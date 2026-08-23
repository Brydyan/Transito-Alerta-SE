-- 0020_add_closed_status_to_incidents.DOWN.sql
-- Reverses 0020.

BEGIN;

-- Refuse the rollback if any incident is already in 'closed' — those rows
-- would be silently orphaned with no valid status otherwise.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM incidents WHERE status = 'closed') THEN
    RAISE EXCEPTION 'cannot rollback 0020: incidents rows still in closed status';
  END IF;
END $$;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;

ALTER TABLE incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved'));

COMMIT;
