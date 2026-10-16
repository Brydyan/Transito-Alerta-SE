-- Rollback 0035_audit_events_actor_set_null
--
-- WARNING: rows with actor_id IS NULL must be deleted or back-filled
-- before this rollback, otherwise the NOT NULL re-add will fail.

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE audit_events
  ALTER COLUMN actor_id SET NOT NULL;
