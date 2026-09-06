-- 0045_audit_events.DOWN.sql
-- Rollback for 0045 — drops audit_events and its indexes.
--
-- Los índices se borran automáticamente con la tabla; el orden
-- no importa. Esta migración es informativa: si AUD ya escribió
-- eventos de producción, aplicarla borra el registro de
-- auditoría, que es exactamente lo que la fase intenta impedir.
-- Use sólo si la decisión de producto se revierte.

BEGIN;

DROP TABLE IF EXISTS audit_events CASCADE;

COMMIT;
