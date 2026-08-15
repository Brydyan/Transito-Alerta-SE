-- Rollback for 0004_incidents.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.

BEGIN;

DROP TABLE IF EXISTS incidents;

COMMIT;
