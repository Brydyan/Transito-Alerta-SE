-- 0010_user_email.DOWN.sql
-- Reverts T3.5 (Mail module) — 0010_user_email.sql.
--
-- WARNING: dropping `users.email` removes the only address source
-- IncidentMailListener/MailService resolve recipients from — do not run
-- this while the Mail module is still deployed.

BEGIN;

DROP INDEX IF EXISTS users_email_unique_idx;

ALTER TABLE users
  DROP COLUMN IF EXISTS email;

COMMIT;
