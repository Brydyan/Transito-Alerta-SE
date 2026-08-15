-- Rollback for 0001_initial_schema.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.

BEGIN;

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS roles;

COMMIT;
