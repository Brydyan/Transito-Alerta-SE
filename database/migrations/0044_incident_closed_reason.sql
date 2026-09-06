-- 0044_incident_closed_reason.sql
-- Transito Alerta SE — sc-315 (fix-incident-state-machine): persist the reason
-- for closing an incident without resolution.
--
-- Rationale (D4 del design): un cierre por imposibilidad sin explicación es
-- un registro inútil. La columna permite auditar por qué se dio de baja
-- una incidencia (falta de recursos, competencia de otra entidad, reporte
-- inválido, etc.) y se consulta desde la fila, no desde el historial —
-- porque alimenta informes directamente.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0004 (incidents table) and 0020 (closed CHECK constraint on status).
--
-- Rollback: database/rollback/0044_incident_closed_reason.DOWN.sql

BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS closed_reason text NULL;

-- No CHECK constraint on the value: free-form text by design, validated
-- for presence (NOT NULL at the application layer when status='closed').
-- Trimming and length limits are the app's job; the DB stays neutral so
-- a future schema change (categorised reasons, dropdown, etc.) doesn't
-- need another migration.

COMMENT ON COLUMN incidents.closed_reason IS
  'sc-315: motivo de cierre cuando status=closed. NULL en cualquier otro estado. La presencia la exige la app al transicionar a closed.';

COMMIT;
