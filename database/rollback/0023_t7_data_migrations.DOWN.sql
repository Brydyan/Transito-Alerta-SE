-- 0023_t7_data_migrations.DOWN.sql
-- Reverts Group H consolidation in reverse section order: 2→1

BEGIN;

-- ── 2) T7.9.C — remove geography + org seed ──────────────────────────────
-- Guard: abort if any user still references the seeded org (data loss /
-- dangling FK would be masked by ON DELETE SET NULL).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
     WHERE o.name = 'CTE - Santa Elena'
  ) THEN
    RAISE EXCEPTION 'cannot rollback: users.organization_id still references CTE - Santa Elena';
  END IF;
END $$;

-- Drop the organization.
DELETE FROM organizations WHERE name = 'CTE - Santa Elena';

-- Drop the parroquias. Pattern 'EC-24-__-__' (two 2-digit groups after EC-24)
-- is tighter than 'EC-24-%' and avoids touching the 3 cantons (EC-24-01/02/03).
DELETE FROM geo_zones WHERE level = 'parroquia' AND code LIKE 'EC-24-__-__';

-- Undo the code backfill on the 4 preexisting rows.
UPDATE geo_zones
   SET code = NULL
 WHERE code IN ('EC-24', 'EC-24-01', 'EC-24-02', 'EC-24-03');

-- ── 1) T7.2 — restore original role names ────────────────────────────────
UPDATE roles SET name = 'admin_sistema'       WHERE name = 'master';
UPDATE roles SET name = 'admin_organizacion'  WHERE name = 'admin_org';
UPDATE roles SET name = 'operator_organizacion' WHERE name = 'operator_org';

COMMIT;
