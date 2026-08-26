-- T7.7 — integridad a nivel de base (design.md D9/D13, spec R14/R15).
--
-- Fase B: función + trigger de categoría hoja (única invariante de datos
-- portada de los 4 triggers legacy — ver D9). `AND deleted_at IS NULL`
-- (R14.4) y `ERRCODE = 'check_violation'` (R14.3, traducido a 400 por
-- IncidentsService) son diferencias deliberadas frente al legacy.
--
-- Fase C: normalización de FK (design.md D13). Requiere 0031 (deleted_at
-- en incident_categories, usado por el trigger).

BEGIN;

-- ---------------------------------------------------------------------
-- Fase B — trigger de categoría hoja
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Fase C — normalización de FK (design.md D13)
-- ---------------------------------------------------------------------

-- incidents.citizen_id: NO ACTION implícito, NOT NULL -> SET NULL (R15.4).
ALTER TABLE incidents ALTER COLUMN citizen_id DROP NOT NULL;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_citizen_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_citizen_id_fkey
  FOREIGN KEY (citizen_id) REFERENCES users (id) ON DELETE SET NULL;

-- incidents.assigned_to: NO ACTION implícito -> SET NULL (coherente con
-- claimed_by/approved_by/rejected_by, ya SET NULL).
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_assigned_to_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL;

-- incidents.organization_id: SET NULL (0015) -> RESTRICT (R15.3: borrar una
-- organización con incidentes debe rechazarse, no huerfanizarlos).
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_organization_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT;

-- comments.user_id: NO ACTION implícito, NOT NULL -> SET NULL. NO CASCADE:
-- comments.parent_id ya es CASCADE (0033); un user_id en CASCADE arrastraría
-- en cadena las respuestas de profundidad 2 de terceros.
ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- assignments.operator_id: NO ACTION implícito -> CASCADE. Una asignación
-- sin operador no es un estado válido; el incidente vuelve a ser asignable.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_operator_id_fkey;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES users (id) ON DELETE CASCADE;

COMMIT;
