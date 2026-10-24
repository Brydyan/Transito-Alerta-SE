-- 0036_users_phone_unique
--
-- Partial unique index on users.phone.
-- NULL is excluded — users without phone and soft-deleted users
-- (whose phone is wiped to NULL by softDelete) are allowed freely.
-- Prevents two active users from sharing the same phone number.
--
-- Why a PARTIAL index (not a full UNIQUE constraint):
--   - users.phone is `varchar(30) NULL` per migration 0001. A full
--     UNIQUE would treat NULLs as distinct (Postgres multi-column
--     convention) and would still allow duplicates among rows with
--     the same phone — i.e. NULL would not block duplicates the way
--     we want.
--   - Soft-delete (users.service.ts:softDelete) wipes `phone = null`
--     for every ghosted user. A partial index WHERE phone IS NOT NULL
--     naturally excludes those tombstones, so they don't collide
--     with newly-created users who happen to share the same phone.
--
-- The service layer (users.service.ts adminCreate/adminUpdate) does
-- a pre-check with the same `phone IS NOT NULL` semantics, so a 409
-- surfaces with a friendly message instead of the raw 23505 the
-- DB-level index would otherwise emit.
--
-- Rollback: database/rollback/0036_users_phone_unique.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

CREATE UNIQUE INDEX uq_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL;

COMMIT;