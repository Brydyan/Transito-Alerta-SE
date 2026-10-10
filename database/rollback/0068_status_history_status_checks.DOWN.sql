-- database/rollback/0068_status_history_status_checks.DOWN.sql
-- Revierte 0068_status_history_status_checks.sql: devuelve los CHECK de
-- `status_history` al dominio de 0014 ('pending','in_progress','resolved').
--
-- ADVERTENCIA — este rollback es DESTRUCTIVO si la base ya contiene filas
-- que el dominio estrecho no admite, que es exactamente para lo que sirvió
-- 0068:
--
--   * `previous_status = 'created'` — sembrado por `IncidentsService.create()`
--     (incidents.service.ts:153) desde el Fix R-historial (sc-405).
--   * `new_status = 'closed'`        — escrito por
--     `IncidentWorkflowService.changeStatus()` (incident-workflow.service.ts:419).
--
-- Revertir con esas filas presentes hace fallar el ALTER, y el operador se
-- queda con el dominio NUEVO (el ALTER no aplica). Para volver atrás de
-- verdad hay que borrar primero las filas `created` y/o `closed` — y eso
-- destruye audit trail, que es justo lo que `status_history` existe para
-- guardar. Por eso el rollback es informativo: no se ejecuta en producción
-- sin una decisión explícita sobre qué filas del audit trail se sacrifican.
--
-- Si el rollback se corre contra una base SIN esas filas (el caso de un
-- entorno que nunca ejecutó el fix de sc-405 ni cerró incidentes), el
-- resultado es la restauración limpia del esquema de 0014.
--
-- Verificar antes de ejecutar:
--   SELECT count(*) FILTER (WHERE previous_status NOT IN ('pending','in_progress','resolved')) AS prev_fuera,
--          count(*) FILTER (WHERE new_status      NOT IN ('pending','in_progress','resolved')) AS new_fuera
--     FROM status_history;
--   Si cualquiera de los dos es > 0, este rollback NO es seguro.

BEGIN;

DO $$ BEGIN
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_previous_status;
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_new_status;
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_previous_status
    CHECK (previous_status IN ('pending', 'in_progress', 'resolved'));
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_new_status
    CHECK (new_status IN ('pending', 'in_progress', 'resolved'));
END $$;

COMMIT;