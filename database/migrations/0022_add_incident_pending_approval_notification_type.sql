-- 0022_add_incident_pending_approval_notification_type.sql
-- Transito Alerta SE — T5.6: extend notifications.type CHECK with
-- 'incident_pending_approval' (the value emitted when an incident hits
-- 'resolved' and waits for admin moderation).
-- Rollback: 0022_add_incident_pending_approval_notification_type.DOWN.sql

BEGIN;

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

COMMIT;
