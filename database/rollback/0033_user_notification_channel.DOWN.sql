-- 0033_user_notification_channel.DOWN.sql
-- Rollback for migration 0033. Drops the preferred_notification_channel
-- column. Reversible only while no production code reads the column — at
-- this change's scope there is no dispatch consumer yet, so a clean DROP
-- is safe.
--
-- MANUAL EXECUTION ONLY.

BEGIN;

ALTER TABLE users
  DROP COLUMN IF EXISTS preferred_notification_channel;

COMMIT;