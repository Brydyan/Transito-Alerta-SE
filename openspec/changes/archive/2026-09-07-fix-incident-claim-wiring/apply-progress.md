# Apply Progress: Fix `claim` wiring — la acción reclama de verdad

**Change**: `2026-09-07-fix-incident-claim-wiring`
**Origen**: `fixes-required-ronda-6.md` del change archivado
`2026-09-06-2026-08-29-f3-incidents-module` (sc-303)
**Implementer**: MiniMax (Mavis)
**Date**: 2026-09-07 (ronda 6 — código), 2026-09-07 (ronda 7 — artefacto SDD)
**Status**: READY FOR `sdd-archive`

---

## Segunda pasada (ronda 7) — artefacto SDD faltante

El verificador de la ronda 7 (PASS WITH WARNINGS, 0 CRITICAL) marcó un único
hallazgo: el directorio `specs/frontend-incidents/` del change existía pero
estaba vacío. La convención SDD del proyecto pide que todo change registre,
aunque sea de forma mínima, si modifica o no una capacidad descrita en el
spec del proyecto.

**Fix aplicado**: creado `specs/frontend-incidents/spec.md` declarando
explícitamente "sin delta de comportamiento" — el escenario "Reclamar" del
spec del proyecto (`openspec/specs/frontend-incidents/spec.md:67-68` y del
change archivado) ya describía el comportamiento correcto ("queda asignada
al usuario actual"), y este fix hace que el código cumpla ese escenario sin
modificar el contrato. El archivo documenta también qué NO se modificó
(backend, `workflow.util.ts`, `resolve`/`close`, el spec del proyecto) y por
qué. Ver `tasks.md` §4.1.

El verificador de la ronda 7 confirmó además con mutación real (no por
lectura) que los 3 tests nuevos/reescritos detectan el defecto pre-fix.
Ningún código cambió en esta ronda — sólo el artefacto SDD.

---

## TL;DR

`onAction('claim')` (en `incident-detail.component.ts`) llamaba a
`runStatusTransition()` → `PATCH /incidents/:id/status` con `{ status: 'in_progress' }`,
la misma ruta genérica que usan `resolve` y `close`. Esa ruta **no escribe
`claimed_by`** (verificado leyendo el SQL literal en
`incident-workflow.service.ts:322-330` — `claimed_by` sólo está en el `RETURNING`,
no en el `SET`).

El backend expone un endpoint dedicado — `POST /incidents/:id/claim`
(`incident-workflow.controller.ts:34-42`) — que SÍ hace
`UPDATE incidents SET claimed_by = $1, claimed_at = NOW() WHERE id = $2 AND claimed_by IS NULL`
atómico, valida la organización y el tope de claims activos, y devuelve 409 si
alguien más ya la reclamó. **El frontend nunca llamaba a esta ruta** — cero
coincidencias de `/claim` o `claimIncident` en `frontend/src` y `frontend/e2e`.

**El fix**: agregar `IncidentService.claimIncident(id)` que llama
`POST /incidents/${id}/claim`, conectar `case 'claim'` a ese método, y agregar
la aserción que los tres commits previos de F3.4.7 nunca tuvieron:
`expect(component.incident()?.claimed_by).toBe('user-1')` tras un claim exitoso.

---

## Resumen por fase

### 1 · Conectar `claim` al endpoint dedicado (TDD estricto)

- [x] **1.1** — Test primero. Agregado a `incident.service.spec.ts` un test para
  `claimIncident` que afirma:
  - `POST /incidents/inc-1/claim` con body `{}`
  - respuesta con los 7 campos de `ClaimReleaseResult`
  - `claimed_by === 'user-1'` (la aserción que faltaba)
  - aserciones negativas: `description`, `lat`, `lng`, `citizen_id`, `category_id`
    no están en el wire
  - cache preserva `description`, `lat` y actualiza `claimed_by` a `'user-1'`

  Test fallaba antes del fix (TypeError: `claimIncident is not a function`).
  Restaurado.

- [x] **1.2** — Implementación. `IncidentService.claimIncident(id)` agregado a
  `frontend/src/app/core/services/incident.service.ts` (mirror de `releaseIncident`).
  Mismo `ClaimReleaseResult` (el DTO es idéntico), mismo `tap()` con merge parcial
  en cache.

- [x] **1.3** — Test del componente. Reemplazado el test de
  `incident-detail.component.spec.ts` que mockeaba `updateIncidentStatus` (lo
  que probaba que se llamaba a la URL equivocada con la respuesta equivocada
  y lo certificaba como éxito — la tercera vez en este change que F3.4.7
  certificaba algo que no era lo que el spec prometía). El nuevo test mockea
  `claimIncident` con `ClaimReleaseResult` que tiene `claimed_by: 'user-1'`
  y afirma:
  - `claimIncident` se llamó con `'inc-1'`
  - `updateIncidentStatus` NO se llamó (afirmación explícita — sin ella,
    el mock ficticio del test previo podía pasar sin que la UI reclamara
    de verdad)
  - `component.incident()?.claimed_by === 'user-1'`
  - merge parcial: `description`, `lat`, `citizen_id` se conservan
  - toast de éxito: `'Incidencia reclamada.'`

  Test del error 409 también: `claimIncident` lanza
  `INCIDENT_ALREADY_CLAIMED` → toast con el motivo del backend + recarga
  de la incidencia.

- [x] **1.4** — Implementación del componente. `case 'claim'` separado de
  `runStatusTransition()`. Ahora llama a
  `this.incidentService.claimIncident(inc.id)`, hace merge parcial en el
  signal (`this.incident.update(cur => cur ? { ...cur, ...claimed } : cur)`),
  y maneja errores análogo al de `release` (toast con el motivo del backend +
  recarga con `getIncident()`).

### 2 · Regresión de autorización que el fix también cierra

- [x] **2.1** — `operador_sistema` (`0015_organizations_scoping.sql` +
  `0019_incident_claim.sql` → `READ`, `CLAIM`, `RELEASE` incidents, sin
  `UPDATE incidents`) antes de la ronda 5 nunca veía el botón "Reclamar".
  La ronda 5 cambió el gate a `hasClaim` (para "alinearlo con el backend")
  pero la llamada real seguía exigiendo `UPDATE incidents`, así que el
  rol veía el botón y recibía 403 al presionarlo — fallo nuevo introducido
  por el fix que la ronda 5 certificó como cierre limpio de W2.

  Con este fix, `case 'claim'` llama al endpoint que exige
  `CLAIM incidents` (permiso que `operador_sistema` SÍ tiene). El botón
  aparece Y la acción funciona.

### 3 · No tocar (por contrato del scope)

- [x] **3.1** — NO modificar `resolve`/`close`. Para esas dos acciones,
  `PATCH /:id/status` ES la ruta correcta del backend — no tienen un
  endpoint dedicado alternativo.

- [x] **3.2** — NO modificar `workflow.util.ts`. El gate `hasClaim` ya
  está correctamente alineado con el permiso del endpoint que
  DEBERÍA usarse. El fix 1.1-1.2 hace que la realidad del wire
  coincida con el permiso que el gate ya exigía.

- [x] **3.3** — NO modificar `specs/frontend-incidents/spec.md`. El
  escenario "Reclamar" ya dice "queda asignada al usuario actual";
  este fix materializa eso, no contradice el spec.

---

## Verificaciones por mutación ejecutadas

| Tarea | Mutación                                                       | Test que cayó                                                                 | Restaurado |
| ----- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| 1.3-1.4 | Revertir `case 'claim'` a `runStatusTransition(inc.id, 'in_progress')` (la ruta vieja) | 2 de 2 tests nuevos: "claim con éxito" y "claim error" en `incident-detail.component.spec.ts` | ✅ |

Detalle de los 2 tests que cayeron con la mutación:
1. "F3.4.7 — al ejecutar claim con éxito, claimIncident devuelve un ClaimReleaseResult con claimed_by, y el signal se actualiza con merge parcial" — falla porque `case 'claim'` ya no llama a `claimIncident`.
2. "F3.4.7 — al fallar el claim, el toast expone el mensaje del backend y se recarga la incidencia" — falla por la misma razón.

La mutación también fallaba el test del servicio (`claimIncident` no se llamaba), pero como el test del servicio mockeaba `http.expectOne`, no era directamente afectado por la mutación del componente (que sólo cambiaba la llamada del componente, no la existencia del método del servicio).

---

## Compuertas

| Compuerta | Antes (ronda 6) | Después (este fix) |
| --------- | ---------------- | ------------------ |
| `pnpm test` (frontend) | 60/60 suites, 418/418 tests | **60/60 suites, 419/419 tests** (+1 del test de servicio, +1 del test del componente reemplazado, +1 del test de error reemplazado) |
| `pnpm run build` | exit 0 | **exit 0** (4.9s) |
| `npx tsc -b --noEmit` | 9 errores en 3 archivos preexistentes, 0 en F3 | **9 errores en los mismos 3 archivos, 0 en archivos de este change** |

---

## Archivos modificados

- `frontend/src/app/core/services/incident.service.ts` — `claimIncident()` agregado
- `frontend/src/app/core/services/incident.service.spec.ts` — test de `claimIncident` (1 test nuevo, mismo estilo que `releaseIncident`)
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` — `case 'claim'` separado de `runStatusTransition()`, llama a `claimIncident()`
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts` — 2 tests reemplazados (éxito y error de claim) con mock de `claimIncident` y aserción sobre `claimed_by`
- `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/tasks.md` — todas las casillas marcadas
- `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/apply-progress.md` — este archivo

## Archivos NO modificados (por contrato del scope)

- `frontend/src/app/features/incidents/workflow.util.ts` — gate `hasClaim` correcto
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.html` — no cambia
- `openspec/specs/frontend-incidents/spec.md` — el escenario "Reclamar" ya decía "queda asignada al usuario actual"; este fix materializa eso
- `backend/src/modules/incidents/incident-workflow.controller.ts` — sin cambios (el endpoint dedicado ya existía)
- `backend/src/modules/incidents/incident-workflow.service.ts` — sin cambios
- `database/migrations/0015_organizations_scoping.sql` y `0019_incident_claim.sql` — sin cambios

---

## Recomendación

`pnpm test` verde, build verde, mutation ejecutada y revertida. Cambios mínimos y
acotados al wiring de la acción `claim`. Sin cambios en backend ni en spec.

**Ronda 7 de `sdd-verify` ejecutada: PASS WITH WARNINGS.** El único WARNING
(artefacto SDD faltante) está remediado en esta segunda pasada. Cero CRITICAL
sobreviven.

**Listo para `sdd-archive`.** No hace falta una ronda 8 de `sdd-verify`.

---

## Contexto histórico (para la próxima auditoría)

**Por qué este defecto sobrevivió 5 rondas de auditoría del change F3:**

- Rondas 1-3: el foco estaba en `filtros/paginación` (C1), `release` no-op
  (C2 original) y `e2e`/autorización (C3). `claim` nunca fue objeto de un
  hallazgo propio pese a compartir el mismo patrón de riesgo que `release`.
- Ronda 4: el hallazgo #663 ("Learned (1)") concluyó que "`claim`/`resolve`/`close`
  SÍ están bien tipados porque van por `PATCH /incidents/:id/status` que devuelve
  `IncidentRow` completo" — verificación de **forma** del tipo de retorno,
  correcta en sí misma, pero que no preguntó si esa ruta produce el **efecto**
  que la acción promete (reclamar = asignar `claimed_by`).
- Ronda 5: el mandato estaba acotado explícitamente a C2 (`release`) + W1 + W2,
  y W2 se limitó a comparar el **nombre del permiso** por acción contra el
  decorador del backend, sin verificar a qué **endpoint real** apunta cada
  acción del frontend. Cambiar el gate de `claim` de `UPDATE` a `CLAIM` pasó
  todos los tests existentes (que sólo prueban la función pura
  `availableActions()` en aislamiento) sin que ningún test cruzara
  "qué endpoint invoca `onAction('claim')`" contra "qué permiso exige ese
  endpoint".

**Por qué este change de seguimiento, no reabrir el archivo:**

El archivo del 2026-09-06 fue correcto en la operación que hizo (mover la carpeta
y cerrar el ciclo SDD); lo que estuvo mal es una porción del código que el archivo
cerró sin que ninguna de las cinco auditorías previas la hubiera abierto como
hallazgo propio. Romper la convención de archivo inmutable no es necesario; un
change de seguimiento dedicado con scope acotado es la opción correcta (mismo
patrón que `2026-08-29-fix-incident-state-machine`, sc-315, que corrigió otro
defecto de esta misma área).
