-- 0007_assignments.sql
-- Transito Alerta SE — assignments table (T2.4)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0004 (incidents) and 0001 (users).
--
-- NOTE: tasks.md said assignments=0006; pushed to 0007 here because Users
-- (T2.3) needed its own migration and landed first in build order — see
-- 0006_users.sql header + apply-progress.
--
-- Rollback: database/rollback/0007_assignments.DOWN.sql

BEGIN;

-- One active assignment per incident at a time (R5 — a second claim is a
-- 409 Conflict at the application layer); the unique constraint below is a
-- DB-level backstop against the same race under concurrent writes.
CREATE TABLE IF NOT EXISTS assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users (id),
  role        varchar(20) NOT NULL DEFAULT 'primary',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_assignments_incident UNIQUE (incident_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_operator ON assignments (operator_id);

COMMIT;
