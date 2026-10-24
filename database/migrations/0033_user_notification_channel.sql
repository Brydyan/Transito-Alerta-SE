-- 0033_user_notification_channel.sql
-- 2026-10-15-user-status-notif-channel (D4) — preferred_notification_channel
-- Stores the user's preferred notification channel (email | telegram) on the
-- user record. Preference only — no dispatch logic in this change. Backed by
-- a future listener (out of scope).
--
-- Design D4 chose VARCHAR(20) DEFAULT 'email' NOT NULL over a PostgreSQL
-- ENUM type to keep the door open for new channels without ALTER TYPE
-- migration friction.
--
-- Requires: 0001 (users).
--
-- Rollback: database/rollback/0033_user_notification_channel.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_notification_channel varchar(20) NOT NULL DEFAULT 'email';

COMMENT ON COLUMN users.preferred_notification_channel IS
  'User preferred notification channel. Values: email (default), telegram.'
  ' Used by future dispatch logic (out of scope of this change).'
  ' Migration 0033 / change 2026-10-15-user-status-notif-channel (D4).';

COMMIT;