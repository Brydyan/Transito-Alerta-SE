-- Rollback T6.2.A2 — Remove soft-delete from assignments
BEGIN;

DROP INDEX IF EXISTS uq_assignments_active;
DROP INDEX IF EXISTS idx_assignments_deleted_at;

ALTER TABLE assignments
  DROP COLUMN IF EXISTS deleted_at;

-- Restore original hard UNIQUE constraint
ALTER TABLE assignments
  ADD CONSTRAINT assignments_incident_id_operator_id_key
    UNIQUE (incident_id, operator_id);

COMMIT;
