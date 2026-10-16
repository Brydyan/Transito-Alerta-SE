-- 0035_audit_events_actor_set_null
--
-- Changes audit_events.actor_id FK from ON DELETE RESTRICT to ON DELETE SET NULL,
-- and relaxes the column to nullable.
--
-- Motivation: now that audit.record() is wired to citizen actions (CREATE_INCIDENT,
-- etc.), physically deleting a user (R15.4) is blocked by the RESTRICT constraint.
-- Audit trails must survive user deletion for compliance — the actor_id becomes NULL
-- to signal "deleted user" while the audit record is preserved.

ALTER TABLE audit_events
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL;
