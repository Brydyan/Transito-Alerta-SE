-- 0022_t7_schema_completeness.sql
-- Transito Alerta SE — T7 Schema Completeness Wave
-- `back/2026-08-27-t7-schema-completeness`
--
-- Group D consolidation (2026-10-14): fused from:
--   0033_comments_threading             — T7.4 comments.parent_id
--   0034_organizations_hierarchy_categories — T7.5 orgs.parent_id + incident_category_id
--   0035_domain_columns                 — T7.6 geo_zones.code, users.phone
--   0036_referential_integrity          — T7.7 leaf trigger + FK normalization
--   0037_index_parity                   — T7.8 4 missing indexes
--   0038_reference_data                 — T7.9.A incident category tree seed
--
-- Section order is load-bearing: 0022 (trigger) must precede 0022 (seed)
-- because check_is_leaf_category fires on every INSERT into incidents and
-- the idempotency indexes for the seed are required before ON CONFLICT can
-- find their arbiter.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0012 (incident_categories), 0015 (organizations),
--          0021 (deleted_at on incident_categories — used by leaf trigger).
--
-- Rollback: database/rollback/0022_t7_schema_completeness.DOWN.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1) T7.4 — comments threading (parent_id, depth-2 enforced in service)
--
--    FK self-ref ON DELETE CASCADE: deleting a parent at DB level
--    cascades to its children; soft-delete cascade via WITH RECURSIVE
--    lives in CommentsService.delete. CHECK only blocks direct
--    self-reference (R9.2); depth-max-2 enforced in CommentsService.create.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES comments (id) ON DELETE CASCADE;

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS chk_comments_no_self_parent;
ALTER TABLE comments
  ADD CONSTRAINT chk_comments_no_self_parent CHECK (parent_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);

-- ════════════════════════════════════════════════════════════════════════
-- 2) T7.5 — organizations hierarchy + category routing (D7/D8)
--
--    parent_id: institutional hierarchy, orthogonal to geo_zones tree.
--    incident_category_id: routing FK, NULL = transversal org (D7).
--    uq_organizations_zone dropped entirely (D7.5.A2b): legacy has
--    multiple orgs at different levels of the location tree all
--    notified for the same incident — not even a partial index by
--    parent_id would cover it (Codegraph audit, design.md §1.5).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES organizations (id) ON DELETE SET NULL;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS chk_organizations_no_self_parent;
ALTER TABLE organizations
  ADD CONSTRAINT chk_organizations_no_self_parent CHECK (parent_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON organizations (parent_id);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS incident_category_id uuid NULL
    REFERENCES incident_categories (id) ON DELETE SET NULL;

DROP INDEX IF EXISTS uq_organizations_zone;

CREATE INDEX IF NOT EXISTS idx_organizations_zone_category
  ON organizations (zone_id, incident_category_id);

-- ════════════════════════════════════════════════════════════════════════
-- 3) T7.6 — missing domain columns (R12/R13)
--
--    geo_zones.code: administrative code for import/export + external
--    matching (partial UNIQUE: NULLs are not unique in Postgres).
--    users.phone: present in legacy since create_users_table.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS code varchar(32) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_zones_code
  ON geo_zones (code) WHERE code IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone varchar(30) NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 4) T7.7 — referential integrity: leaf-category trigger + FK normalization
--
--    Fase B: check_is_leaf_category trigger — the only data invariant
--    ported from 4 legacy triggers (design.md D9). AND deleted_at IS NULL
--    (R14.4) and ERRCODE='check_violation' (R14.3 → 400 in
--    IncidentsService) are deliberate differences from legacy.
--    Requires 0021 (deleted_at on incident_categories).
--
--    Fase C: FK normalization (D13).
--    incidents.citizen_id: NOT NULL → SET NULL (R15.4).
--    incidents.assigned_to: NO ACTION → SET NULL.
--    incidents.organization_id: SET NULL (0015) → RESTRICT (R15.3).
--    comments.user_id: NOT NULL → SET NULL (NO CASCADE — comments.parent_id
--      is already CASCADE; a CASCADE on user_id would chain-delete depth-2
--      replies from third parties).
--    assignments.operator_id: NO ACTION → CASCADE (assignment without
--      operator is invalid; incident returns to assignable pool).
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_is_leaf_category() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM incident_categories
    WHERE parent_id = NEW.category_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INCIDENT_CATEGORY_NOT_LEAF: %', NEW.category_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_is_leaf_category ON incidents;
CREATE TRIGGER trg_check_is_leaf_category
BEFORE INSERT OR UPDATE ON incidents
FOR EACH ROW EXECUTE FUNCTION check_is_leaf_category();

-- incidents.citizen_id: NO ACTION implicit, NOT NULL → SET NULL (R15.4).
ALTER TABLE incidents ALTER COLUMN citizen_id DROP NOT NULL;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_citizen_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_citizen_id_fkey
  FOREIGN KEY (citizen_id) REFERENCES users (id) ON DELETE SET NULL;

-- incidents.assigned_to: NO ACTION implicit → SET NULL.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_assigned_to_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL;

-- incidents.organization_id: SET NULL (0015) → RESTRICT (R15.3).
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_organization_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT;

-- comments.user_id: NOT NULL → SET NULL (no CASCADE — see header note).
ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- assignments.operator_id: NO ACTION → CASCADE.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_operator_id_fkey;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES users (id) ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════
-- 5) T7.8 — index parity (D10, R16)
--
--    Only 4 of the 9 R16.1 indexes were genuinely missing. The other 5
--    (comments.parent_id, assignments.incident_id, geo_zones.code,
--    invitations.token_hash, password_reset_tokens.token_hash) are covered
--    by prior migrations or constraints in this same change. Creating
--    them again under a different name would be a real duplicate —
--    IF NOT EXISTS only guards against the same name, not same definition.
--    No CONCURRENTLY: migrations run inside BEGIN/COMMIT (D10).
-- ════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_by_user_id
  ON status_history (changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents (priority);
CREATE INDEX IF NOT EXISTS idx_incidents_citizen_id ON incidents (citizen_id);

-- ════════════════════════════════════════════════════════════════════════
-- 6) T7.9.A — incident category tree seed (reference data)
--
--    Must run AFTER section 4 (trigger exists before any incident INSERT).
--    5 root categories + 17 leaves = 22 rows total, copied verbatim from
--    GeoReporta/backend/database/seeders/IncidentCategorySeeder.php.
--
--    Idempotency (D11): Postgres does not fold NULL into a UNIQUE violation
--    so roots and leaves need separate partial UNIQUE indexes as ON CONFLICT
--    arbiters. Both indexes are created before the seed INSERT.
--    Parent ids resolved by name via CTE, never hardcoded.
-- ════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_root
  ON incident_categories (name) WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_child
  ON incident_categories (name, parent_id) WHERE parent_id IS NOT NULL;

WITH roots AS (
  INSERT INTO incident_categories (id, name, parent_id, created_at, updated_at)
  VALUES
    (gen_random_uuid(), 'Infraestructura Vial',     NULL, now(), now()),
    (gen_random_uuid(), 'Servicios Básicos',         NULL, now(), now()),
    (gen_random_uuid(), 'Seguridad Ciudadana',       NULL, now(), now()),
    (gen_random_uuid(), 'Medio Ambiente',            NULL, now(), now()),
    (gen_random_uuid(), 'Obras e Infraestructura',  NULL, now(), now())
  ON CONFLICT (name) WHERE parent_id IS NULL DO NOTHING
  RETURNING id, name
),
parents AS (
  SELECT id, name FROM roots
  UNION ALL
  SELECT id, name FROM incident_categories WHERE parent_id IS NULL
),
leaves (parent_name, name) AS (
  VALUES
    ('Infraestructura Vial',    'Baches y Hundimientos'),
    ('Infraestructura Vial',    'Semáforos Dañados'),
    ('Infraestructura Vial',    'Señalización Vial'),
    ('Infraestructura Vial',    'Alumbrado Público'),
    ('Servicios Básicos',       'Agua Potable'),
    ('Servicios Básicos',       'Alcantarillado'),
    ('Servicios Básicos',       'Recolección de Residuos'),
    ('Servicios Básicos',       'Red Eléctrica'),
    ('Seguridad Ciudadana',     'Robos y Hurtos'),
    ('Seguridad Ciudadana',     'Vandalismo'),
    ('Seguridad Ciudadana',     'Accidentes de Tránsito'),
    ('Medio Ambiente',          'Contaminación Ambiental'),
    ('Medio Ambiente',          'Tala de Árboles'),
    ('Medio Ambiente',          'Basureros Clandestinos'),
    ('Obras e Infraestructura', 'Construcciones Ilegales'),
    ('Obras e Infraestructura', 'Obras Abandonadas'),
    ('Obras e Infraestructura', 'Veredas y Aceras Deterioradas')
)
INSERT INTO incident_categories (id, name, parent_id, created_at, updated_at)
SELECT gen_random_uuid(), l.name, p.id, now(), now()
  FROM leaves l
  JOIN parents p ON p.name = l.parent_name
ON CONFLICT (name, parent_id) WHERE parent_id IS NOT NULL DO NOTHING;

COMMIT;
