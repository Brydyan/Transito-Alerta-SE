-- T7.8 — paridad de índices (design.md D10, spec R16). De los 9 índices de
-- R16.1, sólo 4 faltaban de verdad — los otros 5 (comments.parent_id,
-- assignments.incident_id, geo_zones.code, invitations.token_hash,
-- password_reset_tokens.token_hash) ya estaban cubiertos por migraciones
-- previas de este mismo change o por constraints anteriores (ver D10,
-- tabla de auditoría T7.8.A4). Crearlos de nuevo bajo otro nombre habría
-- sido un duplicado real — `IF NOT EXISTS` sólo protege contra el mismo
-- nombre, no contra la misma definición repetida.
--
-- Sin `CONCURRENTLY`: las migraciones corren dentro de BEGIN/COMMIT y
-- CONCURRENTLY no es válido en transacción (D10).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_by_user_id
  ON status_history (changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents (priority);
CREATE INDEX IF NOT EXISTS idx_incidents_citizen_id ON incidents (citizen_id);

COMMIT;
