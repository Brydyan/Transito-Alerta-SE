-- 0024_comment_images.sql
-- Transito Alerta SE — T5.5: comment image attachments.
-- MANUAL EXECUTION ONLY. Requires 0005 (comments table) applied first.
-- NOTE: Tasks.md designated this as 0020, but slots 0020-0023 were taken by
-- T5.6 migrations (closed status, decision columns, notification type, notes).
-- Renumbered to 0024 in apply-progress.
-- Rollback: database/rollback/0024_comment_images.DOWN.sql

BEGIN;

CREATE TABLE IF NOT EXISTS comment_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  storage_key varchar(500) NOT NULL,
  url         varchar(1000) NOT NULL,
  mime_type   varchar(100) NOT NULL,
  file_size   int NOT NULL CHECK (file_size > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_images_comment ON comment_images (comment_id);

-- Permission catalog rows
INSERT INTO permissions (resource, action) VALUES
  ('comment-images', 'CREATE'),
  ('comment-images', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant to staff roles via JSONB (no role_permissions join table in this project;
-- the same pattern used by 0019 for incident CLAIM/RELEASE).
UPDATE roles
   SET permissions = permissions || jsonb_build_array('CREATE comment-images', 'DELETE comment-images')
 WHERE name IN ('operador_organizacion', 'operador_sistema', 'admin_organizacion', 'admin_sistema')
   AND NOT (permissions ?& array['CREATE comment-images', 'DELETE comment-images']);

COMMIT;
