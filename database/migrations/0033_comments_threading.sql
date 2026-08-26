-- T7.4 — comentarios anidados (profundidad máxima 2, D6)
--
-- Agrega `parent_id` a `comments` con FK self-referencial ON DELETE CASCADE
-- (borrar el comentario padre en base arrastra sus hijos a nivel de Postgres;
-- el soft delete en cascada de la profundidad completa vive en el servicio,
-- vía WITH RECURSIVE — ver CommentsService.delete).
--
-- El CHECK sólo corta la auto-referencia directa (R9.2); la profundidad
-- máxima 2 se enforcea en CommentsService.create (D6), no en base.

BEGIN;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES comments (id) ON DELETE CASCADE;

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS chk_comments_no_self_parent;
ALTER TABLE comments
  ADD CONSTRAINT chk_comments_no_self_parent CHECK (parent_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);

COMMIT;
