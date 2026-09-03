# Fixes Required — 2026-08-29-fix-incident-state-machine (sc-315)

**Verify pass**: 2 (segunda pasada) — 2026-09-03
**Verdict**: PASS — 0 CRITICAL, 2 WARNING (ninguno bloqueante para el builder), 2 SUGGESTION

No queda nada CRITICAL accionable por el builder. Los 5 CRITICAL de la
pasada 1 (C1–C5) se re-verificaron con evidencia propia (lectura de
código, ejecución de tests, mutación en vivo sobre C2) y están cerrados.
Detalle completo en `verify-report.md` (sección "Pass 2").

Quedan dos items, ninguno para el builder:

1. **W3 — Inventario `closed` preexistente**: bloqueado por entorno
   (sin docker/Supabase) desde la ronda 1. Condición de salida: un
   humano con `psql` corre el conteo antes de promover 0043/0044 a
   producción. No es una tarea de código.
2. **W4 — `design.md` D5 no ratifica el comportamiento de `reject()`**:
   `IncidentApprovalService.reject()` ya no revierte el status (decisión
   coherente con D1, implementada y testeada en
   `incident-approval.service.spec.ts`), pero `design.md` D5 sólo habla
   de `approve()`. Es una actualización de contrato de una línea, tarea
   del arquitecto (Andy/Claude), no del builder — el builder ya
   documentó la decisión en JSDoc y en `apply-progress.md` y no debía
   tocar `design.md` por instrucción explícita.

Dos SUGGESTION informativas (test de integración `pending→closed` a
nivel de `changeStatus()`; nota sobre `incident-analytics.service.ts`
como segunda lista de estados fuera de alcance) — ver `verify-report.md`.

**Recomendación**: archivar el change. W4 se resuelve con una edición de
`design.md`, no con más implementación.
