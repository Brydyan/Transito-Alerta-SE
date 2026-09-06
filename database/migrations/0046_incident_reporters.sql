-- 0046_incident_reporters.sql
-- Transito Alerta SE — AUD (sc-327): tabla de autoría sellada y
-- columna `is_anonymous` en `incidents`.
--
-- Rationale (D1 del design): la autoría real de una publicación
-- anónima NO vive en `incidents.citizen_id` (que es NOT NULL
-- y debe seguir siéndolo). En vez de:
--   (a) hacer `citizen_id` anulable (radio de impacto enorme:
--       revisar TODA consulta, entidad, DTO que asume valor);
--   (b) filtrar `citizen_id` en la API cuando `is_anonymous`
--       (patrón "regla a medias" del proyecto: una ruta nueva
--       que olvide filtrar filtra la identidad);
-- esta fase recicla la fila máscara (`users.device_uuid =
-- 'anonymous'`, sembrada en 0001 y liberada del techo de
-- autenticación por ANON/sc-326) como autoría "mostrada". El
-- autor real vive en `incident_reporters`, separado.
--
-- Consecuencia aceptada: `incidents.citizen_id` deja de
-- significar "la persona" y pasa a significar "la autoría
-- mostrada". La columna conserva el nombre (los tests
-- preexistentes la siguen usando) y se documenta en la
-- cabecera de la entidad.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0001 (users table, para FKs), 0004 (incidents
-- table), 0048 (la fila máscara existe y `permissions='[]'`
-- tras el cierre de ANON — la auditoría no depende del
-- contenido, pero documenta la reutilización).
--
-- Rollback: database/rollback/0046_incident_reporters.DOWN.sql

BEGIN;

-- Columna `is_anonymous` en `incidents`. Default false: las
-- incidencias preexistentes no son anónimas (no hay fila en
-- `incident_reporters` para ellas; la columna `citizen_id`
-- ya apunta al autor real, así que el comportamiento del
-- listado y el detalle no cambia para los datos históricos).
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN incidents.is_anonymous IS
  'AUD (sc-327) D1: si true, incidents.citizen_id apunta a la máscara (device_uuid=''anonymous'') y el autor real vive en incident_reporters. Default false en la migración para no reescribir datos históricos; las nuevas publicaciones anónimas lo setean explícitamente.';

-- Tabla de autoría real. Una fila por incidencia anónima.
-- PK sobre `incident_id` (1:1): una incidencia tiene un único
-- autor real. ON DELETE CASCADE: si la incidencia se borra
-- físicamente, el sello también. La fase usa soft delete, así
-- que la fila sobrevive (D7) — que es lo que se quiere.
CREATE TABLE IF NOT EXISTS incident_reporters (
  -- R8 (referential integrity) — el proyecto exige ON DELETE
  -- explícito en TODA FK (R32.1). El default implícito
  -- `NO ACTION` falla la compuerta de
  -- `t7-integrity-referential.e2e-spec.ts`.
  incident_id  uuid PRIMARY KEY REFERENCES incidents (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Índice por `user_id`: "qué incidencias anónimas publicó esta
-- persona" — la consulta que se usa cuando un master pide
-- revelar y hay que encontrar al autor.
CREATE INDEX IF NOT EXISTS idx_incident_reporters_user
  ON incident_reporters (user_id, created_at DESC);

COMMENT ON TABLE incident_reporters IS
  'AUD (sc-327) D1: autor real de las incidencias anónimas. Una fila por incidencia. La PK sobre incident_id refleja la cardinalidad 1:1 (una incidencia tiene un único autor). El acceso a esta tabla está protegido por el permiso REVEAL (ver 0047).';

COMMENT ON COLUMN incident_reporters.user_id IS
  'Autor real. NO DEBE aparecer en ninguna respuesta del módulo de incidencias sin pasar por la acción REVEAL (PermissionGuard).';

COMMIT;
