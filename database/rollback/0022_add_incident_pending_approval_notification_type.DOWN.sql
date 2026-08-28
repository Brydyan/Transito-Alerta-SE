-- 0022_add_incident_pending_approval_notification_type.DOWN.sql
-- Reverses 0022. Refuses if any row carries the new type.
--
-- Housekeeping (T8.2.C, 2026-08-27): the previous version of
-- this DOWN only re-added the 0011 `notifications_type_check`
-- constraint, but did NOT drop the new `valid_type` constraint
-- that 0022 introduced. Result: after DOWN(22), both
-- constraints existed side-by-side, and the R37.2 cycle
-- detected the residual `valid_type`. This version drops
-- `valid_type` and restores the 0011 constraint.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM notifications WHERE type = 'incident_pending_approval'
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0022: rows with type incident_pending_approval exist';
  END IF;
END $$;

-- Drop the new constraint that 0022 added.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_type;

-- Restore the original 0011 constraint with the EXACT name
-- (`valid_type`) and shape — the previous version used the
-- name `notifications_type_check`, which never existed in
-- 0011; the R37.2 cycle then diffed the constraint name
-- against walking(0001..i-1) which has `valid_type`.
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

COMMIT;
