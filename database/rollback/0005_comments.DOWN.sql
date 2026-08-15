-- Rollback for 0005_comments.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.

BEGIN;

DROP TABLE IF EXISTS comments;

COMMIT;
