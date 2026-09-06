-- 0044_incident_closed_reason.DOWN.sql
-- Reverses 0044_incident_closed_reason.sql. Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE incidents DROP COLUMN IF EXISTS closed_reason;

COMMIT;
