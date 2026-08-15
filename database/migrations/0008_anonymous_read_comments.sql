-- 0008_anonymous_read_comments.sql
-- Transito Alerta SE — widen the anonymous permission ceiling with
-- "READ comments".
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires 0001
-- (users + anonymous seed row).
--
-- Product decision: an anonymous device reports an emergency without logging
-- in, and may read what the public posted and comment on it — but may never
-- modify anything, its own rows included. 0001 seeded the row without
-- "READ comments", so an anonymous device could write a comment and then not
-- read it back. 0001 is already applied, so it is left untouched and this
-- migration amends the row forward.
--
-- Runtime authority for the anonymous ceiling is auth.config.ts
-- (anonymousPermissions), which AuthService returns directly for this device.
-- This row is kept in sync so the database is not misleading to anyone
-- reading it, and so a future non-anonymous path sees the same list.
--
-- Idempotent: re-running is a no-op.
--
-- Rollback: database/rollback/0008_anonymous_read_comments.DOWN.sql

BEGIN;

UPDATE users
SET permissions = '["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]'::jsonb,
    updated_at  = now()
WHERE device_uuid = 'anonymous';

COMMIT;

-- Verify:
--   SELECT device_uuid, permissions FROM users WHERE device_uuid = 'anonymous';
--   expected: ["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]
