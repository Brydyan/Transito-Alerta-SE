-- T7.8 — rollback de paridad de índices

BEGIN;

DROP INDEX IF EXISTS idx_incidents_citizen_id;
DROP INDEX IF EXISTS idx_incidents_priority;
DROP INDEX IF EXISTS idx_status_history_changed_by_user_id;
DROP INDEX IF EXISTS idx_comments_user_id;

COMMIT;
