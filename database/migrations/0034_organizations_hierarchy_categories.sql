-- T7.5 — jerarquía de organizaciones (parent_id) + ruteo por categoría
-- (incident_category_id). Ver design.md D7 (corrección) y D8.
--
-- D7.5.A2b — elimina uq_organizations_zone por completo (NO se reemplaza
-- por una versión parcial `WHERE parent_id IS NULL`): legacy tiene varias
-- organizaciones a distintos niveles del árbol de ubicaciones, todas
-- notificadas para el mismo incidente (R11.1/R11.2). Codegraph confirmó
-- que ni siquiera una versión parcial por parent_id alcanza — ver
-- Hallazgo 4 de la auditoría (design.md §1.5).

BEGIN;

-- Jerarquía institucional (ortogonal a la jerarquía territorial de geo_zones).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES organizations (id) ON DELETE SET NULL;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS chk_organizations_no_self_parent;
ALTER TABLE organizations
  ADD CONSTRAINT chk_organizations_no_self_parent CHECK (parent_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON organizations (parent_id);

-- Ruteo por categoría: FK simple, NULL = organización transversal (D7).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS incident_category_id uuid NULL
    REFERENCES incident_categories (id) ON DELETE SET NULL;

-- Elimina la restricción de una-org-por-zona: es incompatible con el
-- modelo de ancestría de legacy (D7).
DROP INDEX IF EXISTS uq_organizations_zone;

CREATE INDEX IF NOT EXISTS idx_organizations_zone_category
  ON organizations (zone_id, incident_category_id);

COMMIT;
