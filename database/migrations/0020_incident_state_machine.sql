-- 0020_incident_state_machine.sql
-- Transito Alerta SE — Incident State Machine Extensions
--
-- Group E consolidation (2026-10-14): fused from:
--   0020_add_closed_status_to_incidents              — T5.6 status CHECK
--   0021_add_decision_columns_to_incidents           — T5.6 approved/rejected columns
--   0022_add_incident_pending_approval_notification_type — T5.6 notification type
--   0023_add_notes_to_status_history                 — T5.6 status_history.notes
--   0044_incident_closed_reason                      — sc-315 incidents.closed_reason
--   0068_status_history_status_checks                — bugfix status_history CHECKs
--
-- Section order is load-bearing: 0068 (status_history CHECK expansion) must
-- run last — it widens the domain after the rest of the state machine
-- surface (status column, decision columns, closed_reason) is in place.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0004 (incidents), 0011 (notifications), 0014 (status_history).
--
-- Rollback: database/rollback/0020_incident_state_machine.DOWN.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1) T5.6 — extend incidents.status CHECK with 'closed'
--
--    The 4-state set mirrors GeoReporta's full lifecycle:
--    pending → in_progress → resolved → closed.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE incidents
  DROP CONSTRAINT IF EXISTS incidents_status_check;

ALTER TABLE incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed'));

-- ════════════════════════════════════════════════════════════════════════
-- 2) T5.6 — admin approve/reject decision columns
--
--    approved_* and rejected_* must be set as a pair (XOR with each
--    other), enforced by 3 CHECK constraints below.
--    Partial index for "approved in last N days" style queries —
--    rejected counts are tiny relative to total incidents, no index needed.
-- ════════════════════════════════════════════════════════════════════════
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

CREATE INDEX IF NOT EXISTS idx_incidents_approved_at
  ON incidents (approved_at)
  WHERE approved_at IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 3) T5.6 — extend notifications.type CHECK with 'incident_pending_approval'
--
--    Emitted when an incident hits 'resolved' and waits for admin
--    moderation. Drops both possible constraint names (notifications_type_check
--    from older schemas and valid_type from 0011) before re-adding.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS valid_type;

ALTER TABLE notifications
  ADD CONSTRAINT valid_type
  CHECK (type IN (
    'incident.created',
    'incident.assigned',
    'incident.status_changed',
    'comment.added',
    'incident_pending_approval'
  ));

-- ════════════════════════════════════════════════════════════════════════
-- 4) T5.6 — status_history.notes
--
--    Free-text column for the reject reason (D4: rejection writes a
--    Comment-like notes row into status_history).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE status_history
  ADD COLUMN IF NOT EXISTS notes text;

-- ════════════════════════════════════════════════════════════════════════
-- 5) sc-315 — incidents.closed_reason
--
--    Persists the reason for closing an incident without resolution.
--    No CHECK on the value: free-form text, validated for presence at the
--    application layer when status='closed'. Keeping the DB neutral avoids
--    a future migration if reasons become categorised (dropdown, enum).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS closed_reason text NULL;

COMMENT ON COLUMN incidents.closed_reason IS
  'sc-315: motivo de cierre cuando status=closed. NULL en cualquier otro estado. La presencia la exige la app al transicionar a closed.';

-- ════════════════════════════════════════════════════════════════════════
-- 6) Bugfix — status_history CHECK expansion (must run last)
--
--    0014 froze the domain when the table did not yet know 'closed' or
--    the 'created' sentinel, causing two production 500s:
--      a) IncidentWorkflowService.changeStatus() writing new_status='closed'
--         violated chk_status_history_new_status.
--      b) IncidentsService.create() seeding previous_status='created'
--         violated chk_status_history_previous_status.
--
--    Deliberate asymmetry:
--      previous_status: ('created','pending','in_progress','resolved','closed')
--      new_status:      ('pending','in_progress','resolved','closed')
--    'created' is a birth sentinel — no flow transitions TOWARD it.
--    'closed' goes in previous_status even though it is currently terminal
--    so a future graph reopening does not hit a second 500.
--    chk_status_history_transition (previous_status <> new_status) untouched.
-- ════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_previous_status;
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_new_status;
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_previous_status
    CHECK (previous_status IN ('created', 'pending', 'in_progress', 'resolved', 'closed'));
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_new_status
    CHECK (new_status IN ('pending', 'in_progress', 'resolved', 'closed'));
END $$;

COMMIT;
