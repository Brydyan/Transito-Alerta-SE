-- 0005_comments.sql
-- Transito Alerta SE — comments table (T2.2)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (users) and 0004 (incidents) to have been applied first.
--
-- NOTE: tasks.md originally called this file 0004_comments.sql; renumbered
-- to 0005 because incidents took the 0004 slot (see 0004_incidents.sql
-- header note and apply-progress).
--
-- Rollback: database/rollback/0005_comments.DOWN.sql

BEGIN;

-- content is sanitized application-side (CommentsService.sanitizeContent —
-- script tags stripped, remaining markup HTML-entity-escaped) BEFORE
-- INSERT; this column stores only sanitized text (spec R3).
CREATE TABLE IF NOT EXISTS comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text NOT NULL,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_incident ON comments (incident_id, created_at ASC);

COMMIT;
