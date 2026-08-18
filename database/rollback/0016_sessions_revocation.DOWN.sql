-- database/rollback/0016_sessions_revocation.DOWN.sql
-- Drops ONLY what 0016 added. It must NEVER DROP TABLE user_sessions (0006)
-- nor DROP INDEX idx_user_sessions_user (0006).
-- The expires_at backfill is not separately reversible: the column goes away.

BEGIN;

UPDATE roles
   SET permissions = permissions - 'READ sessions' - 'DELETE sessions'
 WHERE name IN ('admin_sistema', 'admin_organizacion');

DELETE FROM permissions WHERE resource = 'sessions';

DROP INDEX IF EXISTS idx_user_sessions_revoked;
DROP INDEX IF EXISTS idx_user_sessions_active;

ALTER TABLE user_sessions
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS last_used_at,
  DROP COLUMN IF EXISTS revoked_at,
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS rotated_at,
  DROP COLUMN IF EXISTS previous_refresh_token_hash,
  DROP COLUMN IF EXISTS refresh_token_hash;

COMMIT;
