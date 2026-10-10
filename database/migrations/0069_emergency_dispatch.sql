-- 0069_emergency_dispatch.sql
-- 2026-08-29-f7-emergency-dispatch
-- Adds the schema surface needed by the emergency-dispatch change:
--   1) Telegram chat id for `admin_org` and `operador_org` (D6, B.2).
--   2) Per-assignment cap-override audit fields (D3, A.3).
--   3) Incident reminder counter for the critical-pending repique (D10, B.5).
--
-- No permission catalog changes — `ASSIGN assignments` already belongs to
-- `master` and `admin_org` (per 0015), which is exactly the population
-- that should be able to override the cap. A separate `OVERRIDE` permission
-- would be a second lock on the same door (A.5.7, Q2 resuelta).
--
-- Requires: 0001 (users), 0007 (assignments), 0004 (incidents),
--           0015 (organizations + scoping), 0017 (users relaxations).
--
-- DOWN: database/rollback/0069_emergency_dispatch.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

-- 1) Telegram chat id (design D6 — destino a nivel de usuario, no de
-- organización). Nullable: not every admin/operator configures Telegram,
-- and the listener must skip absent ones without failing.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id text NULL;

COMMENT ON COLUMN users.telegram_chat_id IS
  'Telegram chat_id for emergency-dispatch notifications. '
  'Used by admin_org (initial + reminder repique) and operador_org '
  '(assignment notifications). NULL = user has not configured Telegram; '
  'the listener must skip without failing.';

-- 2) Cap-override audit fields on assignments (design D3, A.3).
-- The project has no separate audit table (verified), so the override
-- trail lives on the assignment row itself. That is sufficient because
-- the override belongs to that specific assignment.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS cap_override_reason text NULL;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS cap_override_by uuid NULL REFERENCES users(id);

COMMENT ON COLUMN assignments.cap_override_reason IS
  'Free-text justification when an admin assigned an operator above '
  'the per-org active-claim cap. NULL = no override was used. Required '
  'when cap_override_by is set.';

COMMENT ON COLUMN assignments.cap_override_by IS
  'User id (master or admin_org) who authorized the cap override. NULL '
  '= no override was used. Foreign key to users(id) so revoking the '
  'author cascades to a NULL.';

-- 3) Critical-pending reminder state (design D10, B.5).
-- The repique scheduler increments `reminder_count` and stamps
-- `last_reminded_at` so restarting the process does not reset the cadence.
-- The 12-reminder cap (1h) is enforced in application code; this column
-- is the durable counter the scheduler reads/writes.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS reminder_count int NOT NULL DEFAULT 0;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz NULL;

COMMENT ON COLUMN incidents.reminder_count IS
  'Number of Telegram reminder pings sent while the incident is critical '
  'and still in pending. The scheduler reads this to decide escalation '
  '(>= 6 → master+operador_sistema) and stop (>= 12 → mark unattended).';

COMMENT ON COLUMN incidents.last_reminded_at IS
  'Timestamp of the last Telegram reminder. The scheduler sends a new '
  'reminder only when NOW() - last_reminded_at >= 5 minutes, so a restart '
  'of the process does not reset the cadence.';

COMMIT;
