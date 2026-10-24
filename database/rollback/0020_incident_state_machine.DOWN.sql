-- 0020_incident_state_machine.DOWN.sql
-- Reverts Group E consolidation in reverse section order: 6→5→4→3→2→1
--
-- WARNING — section 6 rollback is DESTRUCTIVE if the DB contains
-- status_history rows with previous_status='created' or new_status='closed'.
-- Verify before running:
--   SELECT count(*) FILTER (WHERE previous_status NOT IN ('pending','in_progress','resolved')) AS prev_fuera,
--          count(*) FILTER (WHERE new_status      NOT IN ('pending','in_progress','resolved')) AS new_fuera
--     FROM status_history;
-- If either count > 0 the narrow CHECK will fail and the ALTER is a no-op —
-- the new domain stays in place (Postgres rolls back the DO block).

BEGIN;

-- ── 6) Restore status_history CHECKs to 0014 domain ──────────────────────
DO $$ BEGIN
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_previous_status;
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_new_status;
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_previous_status
    CHECK (previous_status IN ('pending', 'in_progress', 'resolved'));
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_new_status
    CHECK (new_status IN ('pending', 'in_progress', 'resolved'));
END $$;

-- ── 5) Drop incidents.closed_reason ──────────────────────────────────────
ALTER TABLE incidents DROP COLUMN IF EXISTS closed_reason;

-- ── 4) Drop status_history.notes ──────────────────────────────────────────
-- Data loss: any notes written are dropped.
ALTER TABLE status_history DROP COLUMN IF EXISTS notes;

-- ── 3) Restore notifications.type CHECK to 0011 domain ───────────────────
-- Refuse rollback if any row carries the new type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM notifications WHERE type = 'incident_pending_approval'
  ) THEN
    RAISE EXCEPTION 'cannot rollback: rows with type incident_pending_approval exist';
  END IF;
END $$;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_type;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name   = 'notifications'
       AND constraint_name = 'valid_type'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT valid_type
      CHECK (type IN (
        'incident.created',
        'incident.assigned',
        'incident.status_changed',
        'comment.added'
      ));
  END IF;
END $$;

-- ── 2) Drop decision columns ──────────────────────────────────────────────
-- Refuse if any decision is recorded (data loss).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM incidents WHERE approved_by IS NOT NULL OR rejected_by IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cannot rollback: incidents with decision columns populated exist';
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

-- ── 1) Restore incidents.status CHECK to 3-state domain ──────────────────
-- Refuse if any incident is already in 'closed'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM incidents WHERE status = 'closed') THEN
    RAISE EXCEPTION 'cannot rollback: incidents rows still in closed status';
  END IF;
END $$;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;

ALTER TABLE incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved'));

COMMIT;
