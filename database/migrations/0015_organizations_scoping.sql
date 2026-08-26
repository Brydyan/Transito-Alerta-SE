-- 0015_organizations_scoping.sql
-- Transito Alerta SE — Organizations multi-tenancy + role hierarchy (T3.2)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (organizations, incidents, roles, users) and 0009
-- (roles.permissions, permissions catalog) to have been applied first.
-- Independent of 0014 (T3.4) in both directions — see proposal
-- "Dependencies" / Cross-task contract.
--
-- Establishes the organization as a real authorization boundary:
--   1. A partial UNIQUE index on organizations(zone_id) — enforced BEFORE
--      the backfill relies on one-org-per-zone, so a data anomaly aborts
--      the migration loudly instead of assigning incidents to an
--      arbitrary tenant (design "Backfill" section).
--   2. incidents.organization_id + index.
--   3. Backfill: incidents.zone_id -> organizations.zone_id join.
--      zone_id IS NULL stays organization_id IS NULL (a real state, not a
--      failure — spec "Backfill assigns organization from zone").
--   4. organizations permission catalog rows.
--   5. Four staff role seeds (admin_sistema, operador_sistema,
--      admin_organizacion, operador_organizacion) per proposal's
--      "Role matrix seeded by 0015" table. 'reporter' already seeded by
--      0009 and is not touched here.
--
-- Rollback: database/rollback/0015_organizations_scoping.DOWN.sql

BEGIN;

-- 1. Enforce the one-org-per-zone assumption BEFORE anything relies on it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_zone
  ON organizations (zone_id) WHERE zone_id IS NOT NULL;

-- 2. The scoping column.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_org_created
  ON incidents (organization_id, created_at DESC);

-- 3. Backfill: idempotent, safe on a database with production rows.
-- Rows with zone_id IS NULL stay NULL (R2: incidents outside every zone
-- are accepted and remain unassigned to any tenant).
UPDATE incidents i
   SET organization_id = o.id
  FROM organizations o
 WHERE i.zone_id = o.zone_id
   AND i.zone_id IS NOT NULL
   AND i.organization_id IS NULL;

-- 4. Permission catalog rows for the new 'organizations' resource.
INSERT INTO permissions (resource, action) VALUES
  ('organizations', 'READ'), ('organizations', 'CREATE'),
  ('organizations', 'UPDATE'), ('organizations', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- 5. Four staff role seeds (proposal "Role matrix seeded by 0015").
-- 'reporter' is already seeded by 0009 and is intentionally not touched.
INSERT INTO roles (name, description, permissions) VALUES
  (
    'admin_sistema',
    'System administrator — global scope across every organization',
    '["READ incidents", "CREATE incidents", "UPDATE incidents", "DELETE incidents",
      "READ comments", "CREATE comments", "UPDATE comments", "DELETE comments",
      "READ assignments", "ASSIGN assignments",
      "READ users", "UPDATE users",
      "READ roles", "ASSIGN roles",
      "READ organizations", "CREATE organizations", "UPDATE organizations", "DELETE organizations",
      "READ geo-zones", "CREATE geo-zones", "UPDATE geo-zones", "DELETE geo-zones",
      "READ incident-categories", "CREATE incident-categories", "UPDATE incident-categories", "DELETE incident-categories"
     ]'::jsonb
  ),
  (
    'operador_sistema',
    'System operator — global read scope, zero users/roles writes (defense in depth)',
    '["READ incidents",
      "READ comments",
      "READ assignments",
      "READ geo-zones",
      "READ incident-categories",
      "READ organizations"
     ]'::jsonb
  ),
  (
    'admin_organizacion',
    'Organization administrator — org scope',
    '["READ incidents", "CREATE incidents", "UPDATE incidents", "DELETE incidents",
      "READ comments", "CREATE comments", "UPDATE comments", "DELETE comments",
      "READ assignments", "ASSIGN assignments",
      "READ users", "UPDATE users",
      "READ roles", "ASSIGN roles",
      "READ organizations",
      "READ geo-zones",
      "READ incident-categories"
     ]'::jsonb
  ),
  (
    'operador_organizacion',
    'Organization operator — org_assigned scope (own assignments only)',
    '["READ incidents", "UPDATE incidents",
      "READ comments", "CREATE comments",
      "READ assignments",
      "READ geo-zones",
      "READ incident-categories"
     ]'::jsonb
  )
ON CONFLICT (name) DO NOTHING;

COMMIT;
