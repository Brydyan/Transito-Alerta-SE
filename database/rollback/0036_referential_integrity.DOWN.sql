-- T7.7 — rollback de integridad a nivel de base: restaura las FK a su
-- definición previa a 0036 y elimina el trigger/función de categoría hoja.
--
-- Housekeeping (T8.2.C, 2026-08-27): the previous version of this DOWN
-- intentionally did NOT restore NOT NULL on comments.user_id and
-- incidents.citizen_id, on the theory that "any row anonymized
-- (user_id = NULL) by 0036's SET NULL while applied would make
-- this ALTER fail". But that concern only applies WHEN 0036 has
-- actually been applied AND there are rows with NULL. For a
-- clean R37.2 cycle (the audit), no such rows exist, and the
-- walking base (0001..0035) has those columns as NOT NULL — so
-- the cycle was diffing on the nullability. This DOWN now
-- restores NOT NULL conditional on no NULLs existing (a
-- safe-and-strict rollback).

BEGIN;

-- Restaura assignments.operator_id a NO ACTION implícito.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_operator_id_fkey;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES users (id);

-- Restaura comments.user_id a NO ACTION implícito.
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id);
-- Restore NOT NULL only when no NULLs exist (safe for clean
-- rollback; production rollback with anonymized rows stays at
-- nullable — the comment in the original DOWN still applies).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM comments WHERE user_id IS NULL) THEN
    ALTER TABLE comments ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

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

-- Restaura incidents.citizen_id a NO ACTION implícito.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_citizen_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_citizen_id_fkey
  FOREIGN KEY (citizen_id) REFERENCES users (id);
-- Same conditional NOT NULL restoration as comments.user_id above.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM incidents WHERE citizen_id IS NULL) THEN
    ALTER TABLE incidents ALTER COLUMN citizen_id SET NOT NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_check_is_leaf_category ON incidents;
DROP FUNCTION IF EXISTS check_is_leaf_category();

COMMIT;
