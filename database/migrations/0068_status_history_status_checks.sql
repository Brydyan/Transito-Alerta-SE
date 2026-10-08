-- 0068_status_history_status_checks.sql
-- Transito Alerta SE — amplía el dominio de los CHECK de `status_history`.
--
-- Síntoma
-- -------
-- Dos flujos de producción fallan con 500 `QueryFailedError` al escribir en
-- `status_history`, porque los CHECK de la migración 0014 congelaron el
-- dominio cuando la tabla aún no conocía ni el estado `closed` ni el
-- sentinel `created`:
--
--   1) Cierre de incidencia — `PATCH /api/incidents/:id/status`
--      `IncidentWorkflowService.changeStatus()` (incident-workflow.service.ts:419)
--      inserta `new_status = 'closed'`, y `chk_status_history_new_status`
--      sólo admite `('pending','in_progress','resolved')`:
--        ERROR: new row for relation "status_history" violates check
--        constraint "chk_status_history_new_status"
--      → el cierre de una incidencia es IMPOSIBLE desde que sc-315 añadió
--        `closed` a la máquina de estados (incident-state-machine.ts).
--
--   2) Nacimiento de una incidencia — `IncidentsService.create()`
--      (incidents.service.ts:153) siembra `previous_status = 'created'`,
--      y `chk_status_history_previous_status` tampoco lo admite:
--        ERROR: new row for relation "status_history" violates check
--        constraint "chk_status_history_previous_status"
--      → el Fix R-historial (sc-405) sembró una fila que la base no acepta;
--        la tabla en vivo no contiene NINGUNA fila `created → pending`.
--
-- Causa raíz
-- ----------
-- `status_history` es el audit trail append-only del ciclo de vida (T3.4,
-- 0014). Su dominio debe ser el de la máquina de estados, no una lista
-- escrita a mano que quedó atrás. Los CHECK se reescriben AMBOS para
-- derivar de la misma fuente de verdad (`TRANSITIONS` en
-- incident-state-machine.ts: pending, in_progress, resolved, closed) más el
-- sentinel `created`, que la siembra de sc-405 usa como estado previo.
--
-- Decisión sobre el sentinel (asimetría deliberada)
-- ------------------------------------------------
--   previous_status IN ('created', 'pending', 'in_progress', 'resolved', 'closed')
--   new_status      IN ('pending', 'in_progress', 'resolved', 'closed')
--
-- `created` es un sentinel: no es un estado de la máquina, sólo marca "la
-- incidencia nace aquí". Por eso entra en `previous_status` y NO en
-- `new_status` — ningún flujo transiciona HACIA `created`, y admitirlo
-- abriría la puerta a un `new_status = 'created'` sin estación de origen.
--
-- `closed` entra en `previous_status` aunque hoy sea terminal
-- (`TRANSITIONS.closed = []`) y por tanto nunca se lea desde ahí: si el
-- grafo gana una reapertura, este CHECK no puede ser el segundo 500
-- esperándose detrás de la transición. `chk_status_history_transition`
-- (`previous_status <> new_status`) queda intacto: sigue prohibiendo el
-- no-op update.
--
-- Efecto colateral aceptado
-- -------------------------
-- Esto revierte la restricción que T7.9.D10 ("la transición de aprobación a
-- `closed` NO escribe fila en status_history") declaraba como invariante,
-- y con ella dos asserts de `backend/test/e2e/t7-volume-seed.e2e-spec.ts`
-- (el conteo `N-1` filas por incidente y el assert explícito de que
-- `approved → closed` no se registra). Ese "no arreglar esto" era correcto
-- mientras `closed` no fuera escribible: hoy `changeStatus()` escribe
-- `closed` igual, y el audit trail de un cierre es precisamente lo que no
-- puede faltar ("un cambio sin registro es peor que no haber cambiado",
-- sc-315). El seeder de volumen y sus asserts deben actualizarse aparte,
-- junto con la decisión de si el flujo de aprobación también emite la fila.
--
-- Idempotente: DROP IF EXISTS + ADD CONSTRAINT guardado. Re-ejecutar es
-- idempotente en el efecto (mismo conjunto, mismos CHECK).
--
-- Rollback: database/rollback/0068_status_history_status_checks.DOWN.sql

BEGIN;

-- PG no tiene ADD CONSTRAINT IF NOT EXISTS: primero se sueltan ambos CHECK
-- (guardado por IF EXISTS para tolerar la re-ejecución) y se vuelven a
-- declarar. El orden importa sólo en que las filas existentes deben
-- seguir validando: al AMPLIAR el dominio, ninguna fila previa puede violar
-- el conjunto nuevo, así que no hace falta validar antes de soltar.
DO $$ BEGIN
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_previous_status;
  ALTER TABLE status_history
    DROP CONSTRAINT IF EXISTS chk_status_history_new_status;
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_previous_status
    CHECK (previous_status IN ('created', 'pending', 'in_progress', 'resolved', 'closed'));
END $$;

DO $$ BEGIN
  ALTER TABLE status_history
    ADD CONSTRAINT chk_status_history_new_status
    CHECK (new_status IN ('pending', 'in_progress', 'resolved', 'closed'));
END $$;

COMMIT;

-- Verify:
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'status_history'::regclass
--      AND conname LIKE 'chk_status_history%'
--    ORDER BY conname;
--   expected: chk_status_history_new_status      → los 4 estados de la máquina
--             chk_status_history_previous_status → 'created' + los 4 estados
--             chk_status_history_transition      → previous_status <> new_status (intacto)
--
--   SELECT previous_status, new_status, count(*)
--     FROM status_history GROUP BY 1,2 ORDER BY 1,2;
--   Las filas existentes (pending→in_progress, in_progress→resolved) siguen válidas:
--   ampliar el dominio no invalida datos previos.