-- 0069_emergency_dispatch.DOWN.sql
-- Rollback for 0069_emergency_dispatch.sql.
-- Drops the 5 columns added in 0069. WARNING: any data in those columns
-- is lost (telegram chat ids, override reasons, reminder counts).

BEGIN;

-- Drop in reverse order to keep any FK introspection happy.
ALTER TABLE incidents
  DROP COLUMN IF EXISTS last_reminded_at;

ALTER TABLE incidents
  DROP COLUMN IF EXISTS reminder_count;

ALTER TABLE assignments
  DROP COLUMN IF EXISTS cap_override_by;

ALTER TABLE assignments
  DROP COLUMN IF EXISTS cap_override_reason;

ALTER TABLE users
  DROP COLUMN IF EXISTS telegram_chat_id;

COMMIT;
