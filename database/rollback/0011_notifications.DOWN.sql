-- T3.3: Rollback notifications table

DROP INDEX IF EXISTS idx_notifications_incident;
DROP INDEX IF EXISTS idx_notifications_user_read;
DROP INDEX IF EXISTS idx_notifications_user_created;
DROP TABLE IF EXISTS notifications;
