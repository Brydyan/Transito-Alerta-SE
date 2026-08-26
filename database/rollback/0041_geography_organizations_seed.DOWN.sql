-- 0041_geography_organizations_seed.DOWN.sql
-- Reverses 0041_geography_organizations_seed.sql (design.md D6). Reverse
-- order of the UP file, one transaction, a LOUD guard instead of a silent
-- cascade: refuses to drop the organization if any user still references it
-- (data loss / dangling FK would otherwise be masked by ON DELETE SET NULL).
--
-- Deliberately does NOT touch `roles.permissions` — the notifications grants
-- belong to 0039 and have their own DOWN file.

BEGIN;

-- 0) Guard: abort loudly if any user still points at the seeded org.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
     WHERE o.name = 'CTE - Santa Elena'
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0041: users.organization_id still references CTE - Santa Elena';
  END IF;
END $$;

-- 1) Drop the organization.
DELETE FROM organizations WHERE name = 'CTE - Santa Elena';

-- 2) Drop the parroquias. Pattern is `EC-24-__-__` (two 2-digit groups after
--    EC-24), tighter than `EC-24-%`, which would also match the 3 cantons
--    (`EC-24-01`, `EC-24-02`, `EC-24-03`).
DELETE FROM geo_zones WHERE level = 'parroquia' AND code LIKE 'EC-24-__-__';

-- 3) Undo the code backfill on the 4 preexisting rows.
UPDATE geo_zones
   SET code = NULL
 WHERE code IN ('EC-24', 'EC-24-01', 'EC-24-02', 'EC-24-03');

COMMIT;
