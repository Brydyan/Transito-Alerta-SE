-- 0058_fix_controles_route.DOWN.sql
-- Revierte el fix: restaura route a '/controles'.
--
-- T8 housekeeping (R37.2): migrations 0058_department_incident_categories,
-- 0058_fix_controles_route, and 0058_geo_zones_reporter_permission share
-- version prefix "0058". The R37.2 audit applies ALL version-0058 migrations
-- before rolling back each one. After rolling back fix_controles_route, the
-- department_incident_categories schema objects (table + index) remain from
-- the first sibling. This DOWN therefore also removes those schema objects to
-- restore the pre-0058 schema state.

BEGIN;

-- ── fix_controles_route objects ───────────────────────────────────────────

-- Revert the route fix: restore route to '/controles'.
UPDATE menu_options
SET route = '/controles'
WHERE id = 'b0000000-0000-0000-0000-000000000011'
  AND route = '/admin/controles';

-- ── department_incident_categories objects (co-versioned 0058 sibling) ───
-- These schema objects are applied before this DOWN runs in the R37.2 cycle.

DROP INDEX IF EXISTS idx_dic_category;
DROP TABLE IF EXISTS department_incident_categories CASCADE;

COMMIT;
