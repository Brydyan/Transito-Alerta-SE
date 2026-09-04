# Verification Report

**Change**: 2026-08-29-fix-incident-state-machine (story sc-315)
**Version**: N/A (openspec artifact store, no explicit spec version tag)
**Mode**: Strict TDD
**Pass**: 1 (primera pasada)
**Fecha**: 2026-09-03

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 22 (S.1.1–S.7.3) + 8 Definition of Done items |
| Tasks marked complete | 21/22 (S.1.1/S.1.2 marcadas [x] pero documentadas como BLOQUEADO POR ENTORNO) |
| Definition of Done incomplete | 1/8 ("Inventario de filas closed preexistentes registrado") |

Incomplete: inventario de filas `status = 'closed'` preexistentes (S.1.1,
S.1.2) — bloqueado por falta de acceso a Supabase/docker en este entorno.
Transparently documented by the apply agent, not a surprise finding.

---

### Build & Tests Execution

**Build / Typecheck**: PASSED — `npx tsc --noEmit -p tsconfig.json` → exit 0, no errors.

**Lint**: PASSED — `npm run lint` → 0 errors, 19 pre-existing warnings (all in files untouched by this change: `events.gateway.spec.ts`, `users.service.spec.ts`).

**Tests**: PASSED (as written) — `rtk jest` → 912/912 passed, 98/98 suites, 0 failed.

Live mutation testing performed (all reverted, `git status` confirmed clean after each):

1. Removed `pending → closed` from `TRANSITIONS` in `incident-state-machine.ts` → 1 test failed immediately (`incident-state-machine.spec.ts`), proving the pure-function layer is genuinely tested. ✅ Good signal.
2. Removed `'closed'` from the hardcoded array in `IncidentsService.getStatuses()` (the method actually wired to `GET /incidents/statuses` and `GET /estados`) → **912/912 tests still passed.** This reproduces defect 1 (the reason this change exists) on the real HTTP path, undetected by the suite. See CRITICAL C2 below.

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Los cuatro estados son alcanzables | `closed` en la lista de estados (`getStatuses()`) | `incident-workflow.service.spec.ts` (tests `IncidentWorkflowService.getStatuses`, unreachable from any route) | ❌ FAILING (behaviorally — passes unit test, fails at the actual endpoint; see C2) |
| Los cuatro estados son alcanzables | Tipo completo con `closed` | `incident-state-machine.spec.ts`, `incident-workflow.service.ts:31` (type now imported from entity) | ✅ COMPLIANT |
| Los cuatro estados son alcanzables | Transición a `closed` posible y persistida | `incident-workflow.service.spec.ts` closed-transition tests | ⚠️ PARTIAL — transition persists, but `closed_reason` never comes back on read (C1) |
| Máquina de estados declarada | Las 4 válidas + 12 inválidas (matriz 4×4) | `incident-state-machine.spec.ts` | ✅ COMPLIANT — mutation-tested |
| Máquina de estados declarada | Terminales alternativos: `resolved → closed` rechazada | `incident-state-machine.spec.ts:86-90` | ✅ COMPLIANT |
| Máquina de estados declarada | Regla en un solo sitio, ningún consumidor replica | — | ❌ FAILING — `LEGAL_TRANSITIONS` in `incidents.service.ts` replicates it (C4); DTO `@IsIn` replicates the state list (W1) |
| Máquina de estados declarada | Crítica sin salto de estado (D9) | `incident-state-machine.spec.ts:112-127` (circular, doesn't call `create()`) | ⚠️ PARTIAL — behavior correct by inspection, claimed test coverage doesn't actually test it (W2) |
| Sólo `admin_org` puede cerrar | Admin cierra con motivo / operador 403 / operador resuelve | `incident-workflow.service.spec.ts` S.3b.6 tests | ✅ COMPLIANT |
| Sólo `admin_org` puede cerrar | Permiso propagado a `roles` + `users` + invalidación `perm:v3:uid:*` | `0043_incident_close_permission.sql` (structural, no integration test — DB-dependent, consistent with project convention) | ✅ COMPLIANT (structural review) |
| El cierre sin resolución exige motivo | Motivo obligatorio → 422 | `incident-workflow.service.spec.ts:318` (test titled "422" but asserts `BadRequestException`, i.e. HTTP 400) | ❌ FAILING — contract says 422, implementation returns 400 (C5) |
| El cierre sin resolución exige motivo | Motivo persistido y visible en la incidencia | none that reads `closed_reason` back | ❌ FAILING (C1) |
| Toda transición queda en el historial | Registro atómico / transición rechazada no escribe | `incident-workflow.service.spec.ts` S.5.1/S.5.3 (structural, no Testcontainers) | ⚠️ PARTIAL — documented gap (W3-adjacent, pre-existing acknowledgment) |
| Reconciliación con flujo de aprobación | Aprobación coherente sin depender de semántica lineal | `incident-approval.service.ts` code review | ⚠️ PARTIAL — code changed correctly for `approve()`; `reject()`'s new behavior is unverified by any test (C3) |
| Reconciliación con flujo de aprobación | Sin regresión en tests existentes | No spec file exists for `IncidentApprovalService`, before or after | ❌ UNTESTED (C3) |

**Compliance summary**: 5/13 scenarios fully compliant, 4 partial, 4 failing.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `TRANSITIONS`/`canTransition`/`ALLOWED_STATUSES` (D2/D3) | ✅ Implemented | Pure, well-tested, mutation-verified |
| `ALLOWED_STATUSES` single source of truth | ⚠️ Partial | True inside `incident-state-machine.ts` and `IncidentWorkflowService`, but bypassed by `IncidentsService.getStatuses()` (C2), `IncidentsService.LEGAL_TRANSITIONS` (C4), and the DTO's `@IsIn` literal (W1) |
| `CLOSE incidents` permission (D8) | ✅ Implemented | Migration extends CHECK before INSERT, updates `roles` + `users`, bumps `permission_version` |
| `closed_reason` column + validation (D4) | ⚠️ Partial | Persisted and validated on write; never readable (C1) |
| Reconciliation of `incident-approval.service.ts` (D5) | ⚠️ Partial | `approve()` matches D5; `reject()`'s reinterpretation goes beyond what D5 states and has zero test coverage (C3) |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — Branched semantics, resolved/closed alternative terminals | ✅ Yes | Verified via mutation and matrix tests |
| D2 — Explicit transition table, terminals as `[]` | ✅ Yes | |
| D3 — `ALLOWED_STATUSES` derived from the graph | ⚠️ Deviated | True at the source, but two other consumers (`IncidentsService.getStatuses()`, `LEGAL_TRANSITIONS`) don't derive from it — see C2, C4 |
| D4 — `closed_reason` mandatory + queryable from the incident row | ⚠️ Deviated | Mandatory on write: yes. Queryable: no (C1) |
| D5 — Reconcile `incident-approval.service.ts` | ⚠️ Deviated | `approve()` matches; `reject()` goes further than the stated decision, untested (C3) |
| D6 — Inventory before migrating data | ⚠️ Blocked | Environment limitation, transparently documented |
| D7 — `pending → closed` permitted | ✅ Yes | |
| D8 — `CLOSE incidents` permission required to close | ✅ Yes | |
| D9 — `critical` incidents born in `pending` | ✅ Yes (by code inspection) | Claimed test coverage is circular/non-behavioral (W2) |

---

### Issues Found

**CRITICAL** (must fix before archive):
1. C1 — `closed_reason` is persisted but never returned by any read path (`SELECT_COLUMNS`, `changeStatus()`'s `RETURNING`) — violates D4's explicit requirement.
2. C2 — The real HTTP status-catalog endpoints (`GET /incidents/statuses`, `GET /estados`) still use a hand-maintained literal array (`IncidentsService.getStatuses()`), NOT derived from `ALLOWED_STATUSES`. The method this change fixed and tested (`IncidentWorkflowService.getStatuses()`) has no caller. Defect 1 reproduces today on the production path; proven via live mutation, 912/912 tests still passed.
3. C3 — `IncidentApprovalService.reject()` was rewritten with a real behavior change (no longer reverts status) and has zero test coverage — no spec file exists for this service, under Strict TDD Mode.
4. C4 — `IncidentsService.LEGAL_TRANSITIONS` / `updateStatus()` (3-state, linear, no `closed`) remains live, typed, and covered by a passing test suite (`incidents.service.spec.ts`), one refactor away from silently reintroducing the original defect.
5. C5 — Missing `closed_reason` on close returns HTTP 400 (`BadRequestException`), not the 422 required by `design.md` and `spec.md`. The covering test's title claims 422 but never asserts the status code.

**WARNING** (should fix):
1. W1 — `UpdateIncidentStatusDto`'s `@IsIn([...])` hardcodes the status list instead of `@IsIn(ALLOWED_STATUSES)`.
2. W2 — D9 ("critical born in pending") has no test exercising `IncidentsService.create()`; the cited coverage is circular documentation, not behavioral proof.
3. W3 — Data inventory for pre-existing `closed` rows (S.1.1/S.1.2) remains blocked by environment; must run before promoting migrations 0043/0044 to production. (Already transparently flagged by the apply agent — repeated here as an explicit exit condition.)

**SUGGESTION** (nice to have):
1. S1 — Cross-reference `incident-workflow.controller.ts`'s T6.8.A4 comment when fixing C2 — it already explains why the route lives elsewhere.
2. S2 — If C4 cannot be fixed in this pass, at minimum mark `IncidentsService.updateStatus()` as `@deprecated` with a runtime guard, rather than leaving it fully functional and green.

---

### Verdict
**FAIL**

5 CRITICAL findings block archive. The core promise of this change — "ALLOWED_STATUSES se deriva del grafo, no se mantiene aparte" (D3) — holds true only inside the new module; two other consumers on the actual HTTP path (`IncidentsService.getStatuses()`, `LEGAL_TRANSITIONS`) still hand-maintain state lists independently, meaning defect 1 is not actually fixed for the production-reachable status catalog endpoint. Additionally, `closed_reason` (D4's centerpiece) is write-only, `reject()`'s reconciliation is untested under Strict TDD, and the 422 contract for missing close reason is not honored. Full findings and reproduction steps in `fixes-required.md`.

---
---

# Verification Report — Pass 2

**Change**: 2026-08-29-fix-incident-state-machine (story sc-315)
**Version**: N/A (openspec artifact store)
**Mode**: Strict TDD
**Pass**: 2 (segunda pasada, correcciones de ronda 2)
**Fecha**: 2026-09-03

Contexto limpio a propósito (doble rol arquitecto/QA). Cada uno de los 5
CRITICAL, 3 WARNING y 2 SUGGESTION de la pasada 1 se re-verificó con
evidencia propia (lectura de código real, ejecución de tests, y mutación
en vivo revertida), no confiando en `apply-progress.md`. Se auditaron
además `incidents.service.ts` e `incidents.repository.ts`, tocados por
primera vez en esta ronda.

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 22 (S.1–S.7) + 8 Definition of Done |
| Tasks complete | 21/22 marcadas [x]; S.1.1/S.1.2 bloqueadas por entorno, documentado |
| Definition of Done incomplete | 1/8 (inventario `closed` preexistente — bloqueado por entorno, no por negligencia) |

---

### Build & Tests Execution (ejecución real, esta pasada)

**Typecheck**: `npx tsc --noEmit -p tsconfig.json` → **exit 0**, sin errores.

**Lint**: `npm run lint` → **0 errors**, 19 warnings preexistentes (archivos
no tocados por este change: `events.gateway.spec.ts`, `notifications.controller.spec.ts`,
`mail-outbox.consumer.spec.ts`, `incident-mail.listener.spec.ts`, `users.service.spec.ts`).

**Tests**: `npx jest` → **99/99 suites, 911/911 tests PASS**, 0 failed.

**Coverage** (archivos del change, `--coverage`):

| Archivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `incident-state-machine.ts` | 100% | 100% | 100% | 100% |
| `incident-workflow.service.ts` | 95.89% | 78.57% | 92.3% | 95.71% |
| `incidents.repository.ts` | 95% | 77.77% | 85.71% | 94.73% |
| `incidents.service.ts` | 79.68% | 50% | 69.23% | 78.68% |
| `incident-approval.service.ts` | 88.88% | 33.33% | 90.9% | 90% |

Líneas no cubiertas relevantes: `incident-workflow.service.ts:196`
(wrapper público `canTransition()`, sin caller de producción — código
muerto de bajo riesgo); `:243` (rama `NotFoundException` de incidente
inexistente en `changeStatus`, edge case no ejercitado); `:305` (guard
defensivo post-UPDATE). Ninguna cubre lógica de negocio nueva sin probar.

**Mutación en vivo ejecutada y revertida** (git status limpio confirmado
después):

1. Se agregó un quinto estado (`archived_test`) a `IncidentStatus`,
   `TRANSITIONS` (terminal) y al mapa `STATUS_LABELS`, **sin tocar
   `incidents.controller.ts` ni `app.controller.ts`**. `tsc` primero
   falló con `TS2741` en `STATUS_LABELS` (fail-loud esperado, confirma
   el diseño exhaustivo del mapa); tras completar el mapa, un test ad
   hoc confirmó que `IncidentsService.getStatuses()` — el método
   realmente conectado a `GET /incidents/statuses` y `GET /estados` —
   devolvía el nuevo estado. **C2 confirmado resuelto**: el catálogo de
   estados del path HTTP real deriva del grafo, no de una lista a mano.
2. Revertidos ambos archivos a su versión original; `git status` limpio
   (sólo el diff propio de la ronda 2, sin residuos).

---

### Spec Compliance Matrix (pasada 2)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Los cuatro estados son alcanzables | `closed` en `getStatuses()` (path HTTP real) | `incidents.service.spec.ts` `getStatuses (sc-315 C2)` + mutación en vivo (ver arriba) | ✅ COMPLIANT |
| Los cuatro estados son alcanzables | Tipo completo con `closed` | `incident-workflow.service.ts` (sin tipo local, usa `IncidentRow.status: IncidentStatus`) | ✅ COMPLIANT |
| Los cuatro estados son alcanzables | Transición a `closed` posible y persistida | `incident-workflow.service.spec.ts:405` (`writes UPDATE + status_history`) | ✅ COMPLIANT |
| Máquina de estados declarada | Matriz 4×4 completa | `incident-state-machine.spec.ts` (22 tests, 100% cobertura) | ✅ COMPLIANT |
| Máquina de estados declarada | Terminales alternativos `resolved→closed` rechazada | `incident-state-machine.spec.ts:86-90`, `incident-workflow.service.spec.ts:273` | ✅ COMPLIANT |
| Máquina de estados declarada | Regla en un solo sitio | `LEGAL_TRANSITIONS` y `updateStatus()` eliminados (verificado por grep, cero ocurrencias fuera de comentarios/nombres de test); `@IsIn(ALLOWED_STATUSES)` en el DTO | ✅ COMPLIANT |
| Máquina de estados declarada | Crítica sin salto de estado (D9) | `incidents.service.spec.ts:152` — llama `service.create()` real con `priority:'critical'`, afirma `callArg` sin `status` | ✅ COMPLIANT |
| Máquina de estados declarada | Descartar reporte inválido (`pending→closed`, D7) | `incident-state-machine.spec.ts:74` (unitario, `canTransition('pending','closed')===true`) | ⚠️ PARTIAL — sin test de integración de `changeStatus()` con `from:'pending'`; el mecanismo genérico (mismo código de UPDATE/INSERT) sí está probado con `in_progress→closed`. Ver SUGGESTION S3 |
| Sólo `admin_org` puede cerrar | Admin cierra / operador 403 / operador resuelve | `incident-workflow.service.spec.ts:369` (403 sin `CLOSE incidents`) | ✅ COMPLIANT |
| Sólo `admin_org` puede cerrar | Permiso propagado a `roles`+`users`+invalidación | `0043_incident_close_permission.sql` (estructural: CHECK extendido, INSERT catálogo, UPDATE roles Y users, bump `permission_version`) | ✅ COMPLIANT (revisión estructural, sin entorno DB) |
| El cierre sin resolución exige motivo | 422 (no 400) | `incident-workflow.service.spec.ts:361-366` — afirma clase Y `getStatus()===422` | ✅ COMPLIANT |
| El cierre sin resolución exige motivo | Motivo persistido y consultable desde la fila | `SELECT_COLUMNS` incluye `closed_reason` (repository.ts:61); `RETURNING` de `changeStatus` lo incluye (workflow.service.ts:299); `incident-workflow.service.spec.ts:457` afirma `result.closed_reason` | ✅ COMPLIANT |
| Toda transición queda en el historial | Rechazada no escribe | `incident-workflow.service.spec.ts:467` (S.5.3) | ✅ COMPLIANT |
| Reconciliación con flujo de aprobación | `approve()`/`reject()` coherentes sin lectura lineal | `incident-approval.service.spec.ts` — 8 tests, ejercitan SQL real vía mock de `EntityManager`/`queryRunner` | ✅ COMPLIANT |
| Reconciliación con flujo de aprobación | Sin regresión / cambio justificado | `apply-progress.md` documenta la reescritura de `reject()`; **sigue sin estar en `design.md`/`spec.md` como decisión explícita** | ⚠️ PARTIAL — ver WARNING W4 |

**Compliance summary**: 13/15 fully compliant, 2 partial, 0 failing.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|---|---|---|
| `TRANSITIONS`/`canTransition`/`ALLOWED_STATUSES` (D2/D3) | ✅ Implemented | 100% cobertura, mutación confirmada |
| `ALLOWED_STATUSES` única fuente | ✅ Implemented | `LEGAL_TRANSITIONS` y ambos `updateStatus()` (service+repository) eliminados; grep confirma cero segundas tablas de transición en `src/` |
| `getStatuses()` deriva del grafo en el path HTTP real | ✅ Implemented | `IncidentsService.getStatuses()` mapea `ALLOWED_STATUSES`; `STATUS_LABELS` es `Record<IncidentStatus,string>` exhaustivo — fail-loud en `tsc` si el grafo gana un estado |
| `CLOSE incidents` (D8) | ✅ Implemented | CHECK extendido antes del INSERT (orden correcto); `roles` y `users` actualizados; `permission_version` bumped |
| `closed_reason` (D4) — escribible y legible | ✅ Implemented | `SELECT_COLUMNS` y `RETURNING` de `changeStatus()` lo incluyen; confirmado por lectura de SQL real, no sólo por mock |
| Reconciliación `incident-approval.service.ts` (D5) | ⚠️ Partial | Comportamiento fijado por 8 tests reales; pero el design.md sólo cubre `approve()`, no `reject()` — el arquitecto no ratificó por escrito la pérdida de "rechazado → vuelve a trabajo activo" |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 — Semántica ramificada | ✅ Yes | Matriz 4×4 mutation-tested |
| D2 — Tabla explícita, terminales `[]` | ✅ Yes | |
| D3 — `ALLOWED_STATUSES` derivado | ✅ Yes | Confirmado en el path HTTP real, no sólo en el módulo nuevo (a diferencia de pass 1) |
| D4 — `closed_reason` obligatorio y consultable | ✅ Yes | Read path confirmado (a diferencia de pass 1) |
| D5 — Reconciliar `incident-approval.service.ts` | ⚠️ Deviated (documentado) | `approve()` cumple D5 al pie de la letra; `reject()` implementa una interpretación razonable y coherente con D1, pero D5 nunca la autorizó explícitamente. Riesgo bajo (está testeada), pero es deuda de contrato, no de código |
| D6 — Inventariar antes de migrar | ⚠️ Blocked | Limitación de entorno, documentada con transparencia en ambas rondas |
| D7 — `pending → closed` permitido | ✅ Yes | Probado a nivel de función pura; falta integración (SUGGESTION) |
| D8 — Permiso `CLOSE incidents` | ✅ Yes | |
| D9 — Crítica nace en `pending` | ✅ Yes | Ahora con test real contra `create()` (a diferencia de pass 1) |

---

### Roadmap decisions (openspec/ROADMAP.md) — verificadas con escenario

| Decisión | Verificación | Resultado |
|---|---|---|
| Cuatro estados ramificados, `resolved`/`closed` terminales alternativos | `canTransition('resolved','closed') === false`; ambos con `TRANSITIONS[x] === []` | ✅ Cumple |
| `critical` nace en `pending`, no salta a `in_progress` | `incidents.service.spec.ts:152` — `create()` real, `priority:'critical'`, `callArg` sin `status` | ✅ Cumple |
| Cerrar exige `CLOSE incidents`, sólo `admin_org`/`master` | Migración 0043 + `incident-workflow.service.spec.ts:369` (403 sin permiso) | ✅ Cumple |
| `pending → closed` permitido | `canTransition('pending','closed') === true` (unitario); sin integración a nivel `changeStatus()` | ⚠️ Cumple a nivel de grafo; ver SUGGESTION S3 |

---

### Issues Found — Pass 2

**CRITICAL**: Ninguno. Los 5 CRITICAL de la pasada 1 (C1–C5) se re-verificaron con evidencia propia y están genuinamente cerrados:
- C1 (`closed_reason` write-only) — cerrado: `SELECT_COLUMNS` y `RETURNING` lo incluyen, confirmado por lectura del SQL real.
- C2 (`getStatuses()` real no derivaba del grafo) — cerrado y **reproducido con mutación en vivo**: agregar/quitar un estado del grafo lo hace aparecer/desaparecer en `IncidentsService.getStatuses()` sin tocar el controller.
- C3 (`reject()` sin tests) — cerrado: `incident-approval.service.spec.ts` ejercita el SQL real de `reject()` y fija el comportamiento nuevo con aserciones sobre el UPDATE.
- C4 (segunda tabla de transiciones viva) — cerrado: `LEGAL_TRANSITIONS`, `IncidentsService.updateStatus()`, `IncidentsRepository.updateStatus()` y sus tests eliminados; grep confirma cero segundas fuentes de verdad sobre transiciones en `src/`.
- C5 (400 en vez de 422) — cerrado: `UnprocessableEntityException`, test verifica clase Y `getStatus()===422`.

**WARNING**:
1. **W4 (nuevo, reemplaza el gap señalado en C3 de pass 1)** — `design.md` D5 sólo cubre `approve()`; la pérdida de la ruta "rechazado → vuelve a trabajo activo" en `reject()` es una decisión de comportamiento real, coherente con D1 y ahora testeada, pero **nunca subida al contrato** (`design.md`/`spec.md`). El builder documentó por qué no lo tocó (instrucción explícita de no modificar `design.md`) — correcto de su parte. Corresponde al arquitecto ratificarlo por escrito antes de archivar, no reabre implementación.
2. **W3 (carry-over)** — Inventario de filas `closed` preexistentes sigue bloqueado por entorno (no docker/Supabase). Condición de salida: humano con `psql` debe correr el conteo antes de promover 0043/0044 a producción.

**SUGGESTION**:
1. **S3 (nuevo)** — No hay test de integración de `IncidentWorkflowService.changeStatus()` con `from:'pending', to:'closed'` (D7, "descartar reporte inválido"). El mecanismo genérico está probado (`canTransition` a nivel unitario + el mismo código transaccional probado con `in_progress→closed`), así que el riesgo es bajo, pero el escenario específico del spec no tiene un test dedicado a nivel de servicio.
2. **S4 (nuevo, informativo)** — `incident-analytics.service.ts:125` inicializa `by_status` con un objeto literal `{pending:0, in_progress:0, resolved:0, closed:0}`. Mismo patrón de lista de estados a mano que motivó C2/C4, pero fuera del alcance declarado de este change (no listado en `proposal.md`/`design.md`, archivo no tocado en esta ronda). No bloquea; vale la pena una nota para un futuro change que toque analíticas.
3. Líneas sin cobertura de bajo riesgo: `incident-workflow.service.ts:196` (wrapper público `canTransition()` sin caller), `:243` y `:305` (edge cases defensivos). No urgente.

---

### Verdict — Pass 2
**PASS**

Los 5 CRITICAL de la pasada 1 están genuinamente cerrados, verificados con
lectura de código real, ejecución de la suite completa (99/99 suites,
911/911 tests, `tsc` exit 0, lint 0 errores) y una mutación en vivo
reproducida y revertida sobre C2 (el hallazgo de mayor severidad: el
defecto original — "closed inalcanzable en el path HTTP real" — ya no se
reproduce). Los 5 archivos nuevos en esta ronda (`incidents.service.ts`,
`incidents.repository.ts`, y sus specs, más `incident-approval.service.spec.ts`)
están justificados en `tasks.md` y no introducen una segunda fuente de
verdad sobre transiciones.

Quedan dos WARNING abiertos, ninguno bloqueante para archivar bajo el
alcance declarado del change:
- W3 es una limitación de entorno ya conocida, con condición de salida
  clara (inventario manual antes de producción).
- W4 es deuda de contrato (`design.md` no ratifica explícitamente el
  comportamiento nuevo de `reject()`), no deuda de código — el
  comportamiento está implementado y testeado correctamente.

Dos SUGGESTION informativas (S3, S4) no requieren acción antes de archivar.

**Recomendación**: archivar el change. W4 debería resolverse con una
actualización de una línea a `design.md` D5 (ratificar la decisión sobre
`reject()`) antes o inmediatamente después del archivo — a discreción del
arquitecto/`Andy`, no bloquea al builder.
