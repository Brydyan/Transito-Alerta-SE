-- 0046_incident_reporters.DOWN.sql
-- Rollback for 0046 — drops incident_reporters and the
-- `is_anonymous` column on incidents.
--
-- BORRADO DE DATOS: la tabla `incident_reporters` se elimina
-- con todas sus filas. Si AUD ya escribió autorías en
-- producción, esta migración destruye la única fuente de verdad
-- del autor real — la columna `incidents.citizen_id` apunta
-- a la máscara y, sin `incident_reporters`, el autor queda
-- irrecuperable.
--
-- Use sólo si la decisión de producto se revierte.

BEGIN;

DROP TABLE IF EXISTS incident_reporters CASCADE;

ALTER TABLE incidents
  DROP COLUMN IF EXISTS is_anonymous;

COMMIT;
