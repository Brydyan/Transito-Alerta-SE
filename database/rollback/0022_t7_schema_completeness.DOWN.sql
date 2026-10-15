-- 0022_t7_schema_completeness.DOWN.sql
-- Reverts Group D consolidation (T7.4–T7.9.A) in reverse section order.
--
-- Section order: 6→5→4→3→2→1 (seed → indexes → integrity → domain → orgs → comments)

BEGIN;

-- ── 7) users.geo_zone_id — drop jurisdiction assignment ──────────────────
DROP INDEX IF EXISTS idx_users_geo_zone_id;
ALTER TABLE users DROP COLUMN IF EXISTS geo_zone_id;

-- ── 6) T7.9.A — remove category seed and idempotency indexes ──────────────
-- Leaves first (parent_id IS NOT NULL) so no FK from a leaf to a root is
-- left dangling mid-statement (ON DELETE SET NULL makes order advisory but
-- it is a safety habit for clean rollbacks).
DELETE FROM incident_categories
 WHERE parent_id IS NOT NULL
   AND name IN (
     'Baches y Hundimientos', 'Semáforos Dañados', 'Señalización Vial', 'Alumbrado Público',
     'Agua Potable', 'Alcantarillado', 'Recolección de Residuos', 'Red Eléctrica',
     'Robos y Hurtos', 'Vandalismo', 'Accidentes de Tránsito',
     'Contaminación Ambiental', 'Tala de Árboles', 'Basureros Clandestinos',
     'Construcciones Ilegales', 'Obras Abandonadas', 'Veredas y Aceras Deterioradas'
   );

DELETE FROM incident_categories
 WHERE parent_id IS NULL
   AND name IN (
     'Infraestructura Vial', 'Servicios Básicos', 'Seguridad Ciudadana',
     'Medio Ambiente', 'Obras e Infraestructura'
   );

DROP INDEX IF EXISTS uq_incident_categories_child;
DROP INDEX IF EXISTS uq_incident_categories_root;

-- ── 5) T7.8 — drop parity indexes ────────────────────────────────────────
DROP INDEX IF EXISTS idx_incidents_citizen_id;
DROP INDEX IF EXISTS idx_incidents_priority;
DROP INDEX IF EXISTS idx_status_history_changed_by_user_id;
DROP INDEX IF EXISTS idx_comments_user_id;

-- ── 4) T7.7 — restore FKs to pre-0022 state + drop leaf trigger ──────────
-- assignments.operator_id: CASCADE → NO ACTION implicit.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_operator_id_fkey;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES users (id);

-- comments.user_id: SET NULL → NO ACTION implicit.
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id);
-- Restore NOT NULL only when no NULLs exist (safe for clean rollback;
-- a production rollback with anonymized rows stays nullable).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM comments WHERE user_id IS NULL) THEN
    ALTER TABLE comments ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- incidents.organization_id: RESTRICT → SET NULL (back to 0015 behaviour).
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_organization_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL;

-- incidents.assigned_to: SET NULL → NO ACTION implicit.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_assigned_to_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users (id);

-- incidents.citizen_id: SET NULL → NO ACTION implicit.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_citizen_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_citizen_id_fkey
  FOREIGN KEY (citizen_id) REFERENCES users (id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM incidents WHERE citizen_id IS NULL) THEN
    ALTER TABLE incidents ALTER COLUMN citizen_id SET NOT NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_check_is_leaf_category ON incidents;
DROP FUNCTION IF EXISTS check_is_leaf_category();

-- ── 3) T7.6 — drop domain columns ────────────────────────────────────────
ALTER TABLE users DROP COLUMN IF EXISTS phone;

DROP INDEX IF EXISTS uq_geo_zones_code;
ALTER TABLE geo_zones DROP COLUMN IF EXISTS code;

-- ── 2) T7.5 — drop organizations hierarchy + category routing ────────────
DROP INDEX IF EXISTS idx_organizations_zone_category;

-- Restore the original 0015 constraint (one org per zone, no partial by parent_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_zone
  ON organizations (zone_id) WHERE zone_id IS NOT NULL;

ALTER TABLE organizations DROP COLUMN IF EXISTS incident_category_id;

DROP INDEX IF EXISTS idx_organizations_parent_id;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS chk_organizations_no_self_parent;
ALTER TABLE organizations DROP COLUMN IF EXISTS parent_id;

-- ── 1) T7.4 — drop comments threading ────────────────────────────────────
DROP INDEX IF EXISTS idx_comments_parent_id;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_no_self_parent;
ALTER TABLE comments DROP COLUMN IF EXISTS parent_id;

COMMIT;
