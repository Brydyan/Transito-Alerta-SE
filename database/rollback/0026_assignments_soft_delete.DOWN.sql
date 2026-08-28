-- Rollback T6.2.A2 — Remove soft-delete from assignments
-- Housekeeping (T8.2.C, 2026-08-27): restore the original 0007 hard
-- UNIQUE on (incident_id) only. The previous version of this DOWN
-- recreated a UNIQUE on (incident_id, operator_id) which silently
-- changed the schema and made the R37.2 cycle diff against walking.
BEGIN;

DROP INDEX IF EXISTS uq_assignments_active;
DROP INDEX IF EXISTS idx_assignments_deleted_at;

ALTER TABLE assignments
  DROP COLUMN IF EXISTS deleted_at;

-- Restore the exact constraint name and shape from 0007
-- (UNIQUE on incident_id only, not the pair).
ALTER TABLE assignments
  ADD CONSTRAINT uq_assignments_incident
    UNIQUE (incident_id);

COMMIT;
