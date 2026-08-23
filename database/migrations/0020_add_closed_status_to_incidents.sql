-- 0020_add_closed_status_to_incidents.sql
-- Transito Alerta SE — T5.6: extend IncidentStatus with 'closed' (admin
-- approve flow). Rollback: 0020_add_closed_status_to_incidents.DOWN.sql

BEGIN;

-- Extend the existing CHECK constraint to allow the 'closed' status.
-- The 4-state set mirrors GeoReporta's full lifecycle
-- (pending -> in_progress -> resolved -> closed).
ALTER TABLE incidents
  DROP CONSTRAINT IF EXISTS incidents_status_check;

ALTER TABLE incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed'));

COMMIT;
