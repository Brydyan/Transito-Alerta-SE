-- 0022_add_incident_pending_approval_notification_type.DOWN.sql
-- Reverses 0022. Refuses if any row carries the new type.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM notifications WHERE type = 'incident_pending_approval'
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0022: rows with type incident_pending_approval exist';
  END IF;
END $$;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'incident.created',
    'incident.assigned',
    'incident.status_changed',
    'comment.added'
  ));

COMMIT;
