-- Rollback for 0007_assignments.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.

BEGIN;

DROP TABLE IF EXISTS assignments;

COMMIT;
