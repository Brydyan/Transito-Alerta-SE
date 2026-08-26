-- T7.5 — rollback de jerarquía de organizaciones y ruteo por categoría

BEGIN;

DROP INDEX IF EXISTS idx_organizations_zone_category;

-- Restaura la restricción original de 0015 (una org por zona, sin partial
-- por parent_id — así era antes de esta migración).
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_zone
  ON organizations (zone_id) WHERE zone_id IS NOT NULL;

ALTER TABLE organizations DROP COLUMN IF EXISTS incident_category_id;

DROP INDEX IF EXISTS idx_organizations_parent_id;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS chk_organizations_no_self_parent;
ALTER TABLE organizations DROP COLUMN IF EXISTS parent_id;

COMMIT;
