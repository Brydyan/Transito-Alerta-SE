# Apply progress: Corrección de la máquina de estados de incidencias

**Change**: `2026-08-29-fix-incident-state-machine` (story sc-315)
**Working dir**: `backend/`
**Ronda**: 3 (verify pass 2) — disposition de los 2 WARNING que el verificador dejó
**Fecha**: 2026-09-03

---

## Resumen ejecutivo

El `fixes-required.md` de la pasada 2 dice explícitamente:

> **Verdict**: PASS — 0 CRITICAL, 2 WARNING (ninguno bloqueante para el
> builder), 2 SUGGESTION
>
> No queda nada CRITICAL accionable por el builder. Los 5 CRITICAL de la
> pasada 1 (C1–C5) se re-verificaron con evidencia propia (lectura de
> código, ejecución de tests, mutación en vivo sobre C2) y están cerrados.
>
> Quedan dos items, ninguno para el builder:
> 1. **W3 — Inventario `closed` preexistente**: bloqueado por entorno
>    (sin docker/Supabase). Condición de salida: humano con `psql`
>    corre el conteo antes de promover 0043/0044 a producción. No es
>    una tarea de código.
> 2. **W4 — `design.md` D5 no ratifica el comportamiento de `reject()`**:
>    `IncidentApprovalService.reject()` ya no revierte el status
>    (decisión coherente con D1, implementada y testeada en
>    `incident-approval.service.spec.ts`), pero `design.md` D5 sólo
>    habla de `approve()`. Es una actualización de contrato de una
>    línea, tarea del arquitecto (Andy/Claude), no del builder — el
>    builder ya documentó la decisión en JSDoc y en
>    `apply-progress.md` y no debía tocar `design.md` por
>    instrucción explícita.
>
> **Recomendación**: archivar el change. W4 se resuelve con una
> edición de `design.md`, no con más implementación.

Por instrucción del builder doc ("Respetá la tabla «No toques»"), ni
W3 ni W4 son trabajo de esta sesión. Lo único accionable es:

1. **Verificar** que el código de la ronda 2 sigue en su sitio y los
   gates siguen verdes. No hay implementación nueva.
2. **Dejar traza** de la disposition en este `apply-progress.md` para
   que un auditor externo entienda por qué no toqué nada.

---

## Verificación de no-regresión (esta ronda)

Gates corridos en `backend/`:

| Gate | Resultado |
|---|---|
| `npx jest` | **99/99 suites, 911/911 tests** PASS |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx eslint src` | 0 errors, 19 warnings (preexistentes, archivos no tocados) |

Grep confirmando que las correcciones críticas siguen en su sitio
(sin nuevas apariciones de las trampas de la ronda 1):

- `LEGAL_TRANSITIONS` en `src/`: **0 ocurrencias** fuera del comentario
  en `incidents.service.ts:43` que documenta que se eliminó en C4.
- `incidentsService.updateStatus` / `incidentsRepository.updateStatus`:
  **0 ocurrencias** de la firma vieja.
- `BAD_REQUEST` por motivo faltante en `incident-workflow.service.ts`:
  **0 ocurrencias** (C5 verificado: sigue `UnprocessableEntityException`).
- `IncidentsService.getStatuses` con array literal: **0 ocurrencias**
  (sigue derivando de `ALLOWED_STATUSES` + `STATUS_LABELS`).

`tasks.md` mantiene 21/22 marcadas (S.1.1/S.1.2 marcadas [x] con
nota de bloqueo; el único `- [ ]` es el ítem de Definition of Done
del inventario preexistente, que sigue bloqueado por entorno).

---

## Disposition de los items del fixes-required pass 2

### W3 — Inventario `closed` preexistente ⚠️ BLOQUEADO POR ENTORNO

Sin cambios desde la ronda 1. El `tasks.md:80` y este
`apply-progress.md` lo documentan en cada pasada. El bloqueo
(sin docker ni Supabase en este entorno) es estructural, no
remediable desde la sesión del builder. La condición de salida
es humana con `psql` y se ejecuta **antes** de promover las
migraciones 0043/0044 a producción. **El builder no hace nada
más en este punto.**

### W4 — `design.md` D5 no cubre `reject()` 📐 TAREA DEL ARQUITECTO

Sin cambios desde la ronda 1 (mismo razonamiento). El builder
doc prohíbe modificar `design.md`:

> "NO modifiques `openspec/changes/<change>/specs/**` ni
> `design.md` — son contrato del arquitecto."

W4 es una edición de una línea (extender D5 con un párrafo
sobre `reject()`), y el verificador la describe correctamente
como "tarea del arquitecto (Andy/Claude), no del builder". La
decisión está:

- Implementada (en `incident-approval.service.ts:reject()`).
- Testeada (en `incident-approval.service.spec.ts:8 tests`).
- Documentada en el JSDoc del service.
- Documentada en el `apply-progress.md` de la ronda 2
  (sección "Pérdida de reject→revert").
- Reconocida por el verificador como "deuda de contrato, no
  de código" (verify-report pass 2, sección Coherence).

Lo único que falta es que el contrato (`design.md`) la nombre.
**El builder no la agrega porque no es su trabajo.** Si
Andy/Claude decide ratificarla, edita `design.md` y se cierra
W4 sin tocar código.

### SUGGESTION (informativas)

- S3: Test de integración `pending → closed` a nivel de
  `changeStatus()`. No es bloqueante; el mismo mecanismo
  (mismo SQL de UPDATE/INSERT, mismo `canTransition`, misma
  transacción) está probado con `in_progress → closed`. La
  ruta `pending → closed` está probada a nivel de la función
  pura. Diferencia práctica: cero. Si la auditoría la quiere,
  es un test adicional de ~5 líneas, pero no se pidió
  explícitamente en `fixes-required.md` — queda como
  follow-up opcional.
- S4: `incident-analytics.service.ts` como segunda lista de
  estados fuera de alcance. Fuera de scope de este change
  (analytics no es parte de la máquina de estados). No se
  toca.

---

## Cambios respecto a la ronda 2

**Cero cambios de código.** Esta ronda es puramente
administrativa: deja traza de la disposition y re-verifica que
no haya regresión.

---

## Estado de gates (sin cambios desde la ronda 2)

| Gate | Resultado |
|---|---|
| `npx jest` (backend) | **99/99 suites, 911/911 tests** |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `eslint src` | 0 errors, 19 warnings (preexistentes) |

---

## Recomendación

Seguir la recomendación del verificador:

1. **Archivar el change.** El verificador pass 2 dio PASS. Los
   5 CRITICAL de la pasada 1 están cerrados. Los 2 WARNING
   restantes son (a) un bloqueo de entorno humano (W3) y (b)
   una edición de contrato del arquitecto (W4). Ninguno es
   trabajo del builder.
2. **Condición de salida antes de promover 0043/0044**:
   humano con `psql` corre
   `SELECT count(*) FROM incidents WHERE status = 'closed';`
   en supabase staging + prod. Si hay filas, evaluar bajo qué
   semántica se escribieron (R2 del proposal) y migrar caso
   por caso. Si no hay filas, promover sin más.
3. **W4 puede cerrarse** con una edición de una línea en
   `design.md` D5, sin reabrir el change. Decisión de Andy o
   Claude, no del builder.

Listo para archivar.
