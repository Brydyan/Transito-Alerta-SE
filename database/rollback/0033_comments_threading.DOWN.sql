-- T7.4 — rollback de comentarios anidados

BEGIN;

DROP INDEX IF EXISTS idx_comments_parent_id;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_no_self_parent;
ALTER TABLE comments DROP COLUMN IF EXISTS parent_id;

COMMIT;
