-- 0034_incident_images_drop_url.DOWN.sql
-- Rollback for migration 0034. Re-adds the `url TEXT NOT NULL`
-- column on `incident_images` and lets the application re-populate
-- it from `storage_key` if needed.
--
-- The DOWN does NOT recreate the 2 legacy rows that 0034 deleted —
-- that's by design (the rows were dead anyway and recreating them
-- would re-introduce the broken state).
--
-- MANUAL EXECUTION ONLY.

BEGIN;

ALTER TABLE incident_images
  ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT '';

-- After rolling back, the application code that populates `url`
-- must be restored as a separate change — this file only handles
-- the schema surface.

COMMIT;