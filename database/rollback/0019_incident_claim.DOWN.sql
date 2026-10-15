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

-- 4) permissions_action_check is now owned by 0009 (roles_permissions, consolidated).
--    0019 does NOT drop or recreate it; narrowing it here would conflict with
--    the wider action set that 0009 manages (CLOSE, REVEAL, etc.).

-- 5) Drop the JSONB entries added to roles.permissions.
UPDATE roles
   SET permissions = (
     SELECT jsonb_agg(elem)
       FROM jsonb_array_elements(permissions) AS elem
      WHERE elem NOT IN ('"CLAIM incidents"'::jsonb, '"RELEASE incidents"'::jsonb)
   )
 WHERE name IN ('operator_organizacion', 'agent_system');

COMMIT;
