-- 0048_close_anonymous_ceiling.sql
-- Transito Alerta SE — ANON (sc-327) — close the anonymous device
-- permission ceiling.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (users + anonymous seed row with permissions != NULL) and
-- 0008 (which expanded that ceiling to include READ/CREATE comments
-- and READ/CREATE incidents).
--
-- Product decision 2026-09-02: an anonymous device cannot
-- authenticate anymore (see `back/2026-09-02-anon-close-anonymous-reporting`).
-- The ceiling it WOULD have had (READ/CREATE incidents and
-- READ/CREATE comments) is now empty. This migration aligns the
-- denormalized snapshot in the row with the new configuration.
--
-- The row is NOT deleted. AUD (`back/2026-09-02-aud-audit-trail-and-identity-reveal`)
-- uses it as the publication-side mask for incidents and comments
-- filed under the anonymous identity. Removing the row here
-- would break FK constraints and force a follow-up migration in
-- AUD to recreate the row with the same id — which is exactly
-- the kind of "two-step masquerade" this comment is here to
-- prevent. Future maintainers: do NOT delete this row.
--
-- This migration is a one-time reset of `users.permissions` for
-- the anonymous row. It is idempotent: re-running sets the
-- column to `[]` again, which is a no-op once it already is.
--
-- The 0008 migration is left untouched. "Rewriting" it would
-- change the historical record of what was applied when, and
-- the right answer is "another migration that undoes its
-- effect" — which is this one. See the
-- `back/2026-09-02-anon-close-anonymous-reporting/tasks.md` for
-- the rationale (section "B.3" del design).
--
-- Rollback: database/rollback/0048_close_anonymous_ceiling.DOWN.sql

BEGIN;

UPDATE users
SET permissions = '[]'::jsonb,
    updated_at  = now()
WHERE device_uuid = 'anonymous';

COMMIT;

-- Verify:
--   SELECT device_uuid, permissions FROM users WHERE device_uuid = 'anonymous';
--   expected: []
