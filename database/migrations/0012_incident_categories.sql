-- 0012_incident_categories.sql
-- Transito Alerta SE — Incident Categories module (T3.7)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
--
-- Adjacency-list table (design D1/D2): flat self-FK `parent_id`, no
-- TypeORM tree entity. ON DELETE SET NULL means deleting a parent promotes
-- its children to roots instead of cascading the delete down the tree.
--
-- `incidents.category_id` is schema-only in this task (no service/DTO
-- wiring) — ON DELETE RESTRICT means a category referenced by an incident
-- cannot be deleted; IncidentCategoriesService maps the resulting PG 23503
-- error to a 409 (design D6).
--
-- Rollback: database/rollback/0012_incident_categories.DOWN.sql

BEGIN;

CREATE TABLE IF NOT EXISTS incident_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(255) NOT NULL,
  parent_id  uuid REFERENCES incident_categories (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_categories_parent_id
  ON incident_categories (parent_id);

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES incident_categories (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_incidents_category_id
  ON incidents (category_id);

-- Permission catalog (design D5): resource is the HYPHENATED
-- 'incident-categories', matching PermissionGuard's inferResourceFromPath
-- off the real route segment (/api/incident-categories/...). Purely
-- informational catalog row — PermissionGuard compares the flat
-- "ACTION resource" string on the caller's own permission set, never this
-- table — but it must match exactly or nothing here is ever grantable.
INSERT INTO permissions (resource, action) VALUES
  ('incident-categories', 'READ'),
  ('incident-categories', 'CREATE'),
  ('incident-categories', 'UPDATE'),
  ('incident-categories', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
