-- 0048_close_anonymous_ceiling.DOWN.sql
-- Rollback for 0048 — restores the ceiling that 0048 removed.
--
-- Use ONLY if a manual decision is made to re-open the anonymous
-- reporting path. The product decision of 2026-09-02 was the
-- opposite, so this rollback is informational and SHOULD NOT be
-- applied without a fresh change.
BEGIN;

UPDATE users
SET permissions = '["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]'::jsonb,
    updated_at  = now()
WHERE device_uuid = 'anonymous';

COMMIT;
