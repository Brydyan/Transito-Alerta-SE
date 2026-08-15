-- 0008_anonymous_read_comments.DOWN.sql
-- Reverts the anonymous permission ceiling to the 0001 seed value.
--
-- WARNING: after this runs, an anonymous device can still POST a comment but
-- can no longer read comments back. Revert auth.config.ts
-- (anonymousPermissions) in the same change, or the application config and
-- the database row will disagree.

BEGIN;

UPDATE users
SET permissions = '["READ incidents", "CREATE incidents", "CREATE comments"]'::jsonb,
    updated_at  = now()
WHERE device_uuid = 'anonymous';

COMMIT;
