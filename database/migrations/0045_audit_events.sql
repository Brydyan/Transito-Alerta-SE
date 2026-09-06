-- 0045_audit_events.sql
-- Transito Alerta SE — AUD (sc-327): tabla genérica de auditoría.
--
-- Rationale (design D3): una tabla `audit_events` única para
-- todas las acciones auditables (no una por caso de uso).
-- El costo del genérico es un `metadata jsonb` menos tipado;
-- el costo del dedicado es la fragmentación — responder
-- "qué pasó con esta incidencia" acabaría exigiendo consultar
-- N tablas.
--
-- `justification` es anulable EN EL ESQUEMA y obligatoria POR
-- ACCIÓN: la revelación (REVEAL incidents) y la excepción al
-- tope de F7 la exigen; una acción de sólo lectura podría no
-- necesitarla. Poner la restricción en el servicio y no en la
-- columna permite que F7 entre sin migración adicional.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0001 (users table, para la FK de actor_id).
--
-- Rollback: database/rollback/0045_audit_events.DOWN.sql

BEGIN;

CREATE TABLE IF NOT EXISTS audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AUD D3 + R8 (referential integrity) — el ON DELETE es
  -- RESTRICT (no se borra un usuario si tiene eventos de
  -- auditoría). El proyecto exige ON DELETE explícito en
  -- TODA FK (R32.1). El default implícito `NO ACTION` falla
  -- la compuerta de `t7-integrity-referential.e2e-spec.ts`.
  actor_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action        varchar(64) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id   uuid,
  -- AUD D3: nullable en el esquema, obligatorio por acción.
  -- Ver IncidentsService.reveal y AuditService.record.
  justification text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices (D3):
--   (resource_type, resource_id, created_at DESC) — "qué pasó
--     con esta incidencia", el caso más común.
--   (actor_id, created_at DESC) — "qué hizo este operador",
--     para investigaciones y métricas.
CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON audit_events (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_events (actor_id, created_at DESC);

COMMENT ON TABLE audit_events IS
  'AUD (sc-327): registro genérico e inmutable de acciones auditables. La escritura participa de la misma transacción que la acción auditada (D4).';

COMMENT ON COLUMN audit_events.action IS
  'Acción ejecutada (ej: REVEAL). El conjunto de valores válidos se controla por la app — la columna es varchar(64) para no crear una migración por cada acción nueva.';

COMMENT ON COLUMN audit_events.justification IS
  'AUD D3: nullable en el esquema, obligatorio por acción. La revelación de autoría y la excepción al tope de F7 lo exigen. La app rechaza con 400 si la acción lo requiere y el campo viene vacío.';

COMMIT;
