-- 0019_incident_claim.DOWN.sql
-- Reverses 0019_incident_claim.sql. Run in Supabase SQL Editor.

BEGIN;

-- 1) Drop the new permission rows.
DELETE FROM permissions
 WHERE resource = 'incidents'
   AND action IN ('CLAIM', 'RELEASE');

-- 2) Revert max_active_claims from organizations.
ALTER TABLE organizations DROP COLUMN IF EXISTS max_active_claims;

-- 3) Revert claimed_by from incidents (index drops automatically with the column).
DROP INDEX IF EXISTS idx_incidents_claimed_by;
ALTER TABLE incidents DROP COLUMN IF EXISTS claimed_by;

-- 4) Restore the original CHECK constraint on permissions.action.
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_action_check;

ALTER TABLE permissions
  ADD CONSTRAINT permissions_action_check
  CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN'));

-- 5) Drop the JSONB entries added to roles.permissions.
UPDATE roles
   SET permissions = (
     SELECT jsonb_agg(elem)
       FROM jsonb_array_elements(permissions) AS elem
      WHERE elem NOT IN ('"CLAIM incidents"'::jsonb, '"RELEASE incidents"'::jsonb)
   )
 WHERE name IN ('operador_organizacion', 'operador_sistema');

COMMIT;
