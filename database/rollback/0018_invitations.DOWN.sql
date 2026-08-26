-- Rollback for 0018_invitations.sql (T3.6)
-- Drop password_reset_tokens BEFORE invitations — no FK order dependency
-- between the two, but this keeps the drop order deterministic and mirrors
-- the DOWN convention of "reverse of the UP creation order" (invitations was
-- created first).

BEGIN;

DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS invitations;

UPDATE roles
   SET permissions = permissions - 'CREATE invitations' - 'READ invitations' - 'DELETE invitations'
 WHERE name IN ('admin_sistema', 'admin_organizacion');

DELETE FROM permissions WHERE resource = 'invitations' AND action IN ('CREATE', 'READ', 'DELETE');

COMMIT;
