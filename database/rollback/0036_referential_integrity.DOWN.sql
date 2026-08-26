-- T7.7 — rollback de integridad a nivel de base: restaura las FK a su
-- definición previa a 0036 y elimina el trigger/función de categoría hoja.

BEGIN;

-- Restaura assignments.operator_id a NO ACTION implícito.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_operator_id_fkey;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES users (id);

-- Restaura comments.user_id a NO ACTION implícito + NOT NULL.
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id);
-- NOT reinstating NOT NULL: any row anonymized (user_id = NULL) by 0036's
-- SET NULL while applied would make this ALTER fail. Nullable is the safe
-- rollback state.

-- Restaura incidents.organization_id a SET NULL (comportamiento de 0015).
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_organization_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL;

-- Restaura incidents.assigned_to a NO ACTION implícito.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_assigned_to_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users (id);

-- Restaura incidents.citizen_id a NO ACTION implícito (sin restaurar NOT
-- NULL, mismo motivo que comments.user_id arriba).
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_citizen_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_citizen_id_fkey
  FOREIGN KEY (citizen_id) REFERENCES users (id);

DROP TRIGGER IF EXISTS trg_check_is_leaf_category ON incidents;
DROP FUNCTION IF EXISTS check_is_leaf_category();

COMMIT;
