-- 0034_incident_images_drop_url.sql
-- 2026-10-06-incident-images-read-path (D2) — drop the unused `url` column
-- on `incident_images` and purge the two legacy rows that point at
-- the dummy `storage.example.com` host the previous
-- `IncidentImageStorageService.getSignedUrl` stub emitted.
--
-- Design D2 explicitly rejects repurposing `url` to hold the
-- storage_key (the entity already has `storage_key`). Dropping the
-- column eliminates the duplicate, stale source of truth and
-- enforces the spec requirement to not persist fabricated URLs.
--
-- Requires: 0021 (incident_images table).
--
-- Rollback: database/rollback/0034_incident_images_drop_url.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

-- 1) Drop the unused `url` column. The `IncidentImageEntity` mapping
--    is removed in the same change so a fresh deploy is consistent
--    with the schema.
ALTER TABLE incident_images
  DROP COLUMN IF EXISTS url;

-- 2) Purge the legacy rows. The pre-change upload stub fabricated
--    `https://storage.example.com/{key}?sig={hex}` URLs against a
--    `storage_key` that was never actually written; without this
--    delete the list endpoint would still hand the frontend rows it
--    can never render (D3 — the read path returns only the byte
--    route, not the URL).
DELETE FROM incident_images;

COMMIT;