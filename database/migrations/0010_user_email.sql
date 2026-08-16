-- 0010_user_email.sql
-- Transito Alerta SE — Mail module (T3.5)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (users) to have been applied first.
--
-- Design D11: UserEntity and every prior migration (0001..0009) have no
-- email column, which makes design D10's event -> recipient routing table
-- unimplementable (nothing to send to). Additive, nullable — every
-- anonymous identity and every pre-existing authenticated user simply has
-- email IS NULL, which IncidentMailListener treats as "skip, debug log",
-- never an error. The unique partial index only constrains rows that DO
-- have an email, so it never blocks the many NULL rows from coexisting.
--
-- Rollback: database/rollback/0010_user_email.DOWN.sql

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email varchar(320) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (email)
  WHERE email IS NOT NULL;

COMMIT;
