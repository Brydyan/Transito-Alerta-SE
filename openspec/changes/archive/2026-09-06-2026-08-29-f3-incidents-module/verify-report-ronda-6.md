# Verify Report — Ronda 6: F3 — Módulo de Incidencias (sc-303)

**Change**: `2026-08-29-f3-incidents-module` (ya archivado en `openspec/changes/archive/2026-09-06-2026-08-29-f3-incidents-module/`, commit `b9a1748` "archivar F3 tras verify ronda 5")
**Ronda auditada**: 6 — auditoría independiente y adversarial de las afirmaciones de la ronda 5 (PASS, listo para archivar)
**Fecha**: 2026-09-07
**Auditor**: sdd-verify, ronda 6 (fresh context, sin participación en la implementación de ninguna ronda previa)
**Mandato**: no confiar en la prosa de `verify-report.md` (rondas 1-5), `fixes-required.md` ni `ronda-5-handoff.md`. Releer el código fuente y el backend real, y ejecutar los gates en vivo.
**Modo**: Standard verify (openspec + engram híbrido). Strict TDD activo — se exige que cada test citado como prueba de un fix realmente falle contra el código pre-fix.

---

## Resumen ejecutivo

**1 CRITICAL nuevo (no reportado en ninguna ronda anterior), 0 regresiones de C1/C2/C3/W1/W2, 1 SUGGESTION de higiene documental.**

Las tres afirmaciones puntuales que la ronda 5 dejó para auditar (C2 tipo de `release`, W1 spec honesto, W2 permisos alineados) **se sostienen**: verificadas de nuevo contra el código y el backend real, no contra la prosa. Los gates en vivo confirman los números de la ronda 5 con una variación menor y explicable (ver tabla de compuertas).

Pero el mandato explícito de esta ronda — **"chequear si `claimIncident()` tiene el MISMO bug que `release`"** — llevó a un hallazgo distinto y más grave que un mismatch de tipos: **la acción `claim` del frontend nunca invoca el endpoint dedicado `POST /incidents/:id/claim`**. Llama en cambio a `PATCH /incidents/:id/status` con `{ status: 'in_progress' }` — la misma ruta que usan `resolve` y `close` — y esa ruta **nunca escribe `claimed_by`** en la base de datos. El resultado: reclamar una incidencia desde la UI cambia su estado a `in_progress` pero dice mentira sobre a quién queda asignada. Esto viola literalmente el propio `spec.md` ("Reclamar — … THEN queda asignada al usuario actual") y rompe el resto de la cadena de flujo (`release`/`resolve` requieren `claimed_by === currentUserId`, que nunca se vuelve cierto).

Este defecto **no es de esta ronda ni de la ronda 5**: existe desde la ronda 1 (`F3.3.1`, primera vez que `workflow.util.ts` y el `case 'claim'` del detail se escribieron) y sobrevivió cinco rondas de auditoría porque las cuatro rondas anteriores enfocaron el análisis de tipo de respuesta HTTP exclusivamente en `release` (rondas 1, 4 y 5) sin cruzar `claim` contra el mismo criterio. La ronda 4 incluso lo rozó y lo dio por bueno: su hallazgo #663 concluye "`claim`/`resolve`/`close` SÍ están bien tipados porque van por `PATCH /incidents/:id/status`" — una verificación de **tipo** (el shape de `IncidentRow` es correcto), no de **efecto** (si esa ruta realmente reclama la incidencia). Esa distinción es exactamente el hueco por el que se coló el defecto.

Además, el propio fix de W2 en la ronda 5 introdujo una **regresión puntual** sobre este defecto preexistente: antes de la ronda 5, el botón "Reclamar" se mostraba condicionado a `UPDATE incidents` (el mismo permiso que exige la ruta que realmente se invoca — inconsistente en semántica, pero al menos consistente en autorización). Ronda 5 cambió la condición de visibilidad a `CLAIM incidents` (para alinearla con lo que semánticamente *debería* ser la acción) sin tocar la llamada real, que sigue exigiendo `UPDATE incidents`. Consecuencia: `operador_sistema` (permisos `READ`, `CLAIM`, `RELEASE` — sin `UPDATE`, según los seeds `0015_organizations_scoping.sql` + `0019_incident_claim.sql`) ahora **ve el botón "Reclamar" y al presionarlo recibe un 403** del backend, un fallo nuevo que antes de la ronda 5 no era visible para ese rol porque ni siquiera se le mostraba el botón.

---

## Compuertas (ejecutadas en vivo, 2026-09-07, working dir `frontend/`)

| Compuerta | Comando | Resultado ronda 5 (declarado) | Resultado ronda 6 (verificado ahora) |
|---|---|---|---|
| Tests | `pnpm test` | 60/60 suites, 412/412 tests | **60/60 suites, 418/418 tests** — PASS |
| Build | `pnpm run build` (`ng build`) | exit 0, ~9.7s | **exit 0**, 4.6s |
| Type-check | `npx tsc -b --noEmit` | 9 errores en 3 archivos, 0 en F3 | **9 errores en los mismos 3 archivos** (`auth.service.spec.ts`, `placeholder.component.spec.ts`, `layout-tokens.regression.spec.ts`), **0 en archivos F3** |
| Lint | `pnpm lint` | no existe (gap preexistente) | confirmado: `[ERR_PNPM_NO_SCRIPT] Missing script: "lint"` |
| E2E | `pnpm test:e2e` | no corrido (requiere `BASE_URL`+backend) | no corrido, misma convención de skip |

**Nota sobre 412→418 tests**: NO es una regresión de ningún fix de F3. `git log --oneline` muestra que, tras el commit de la ronda 5 (`faab811`), la rama recibió más commits ajenos a F3 (`ab3faa3`, `16c473d`, `6a1fc8a`, merge de `develop`, `ab1a5c9`, `f879efa` — todos sobre el módulo de mail/verificación de email). El `working tree` está limpio (`git status` → nothing to commit); la diferencia de 6 tests viene de esos commits externos, no de cambios en `frontend/src/app/features/incidents/` ni `frontend/src/app/core/services/incident.service.ts`. Verificado: ninguno de esos commits toca un archivo de incidencias.

Ninguna compuerta se omitió sin ejecutar.

---

## Veredicto por afirmación de la ronda 5

| Afirmación de la ronda 5 | Veredicto ronda 6 |
|---|---|
| C2 — `ClaimReleaseResult` (7 campos) coincide con el wire real de `release` | **SE SOSTIENE** |
| C2 — el `tap` del servicio hace merge parcial, no reemplazo | **SE SOSTIENE** |
| C2 — `onAction('release')` hace merge parcial en el componente | **SE SOSTIENE** |
| C2 — el test de `incident-detail` habría fallado contra el código pre-fix | **SE SOSTIENE** (verificado contra el diff real `faab811`) |
| C2 — `claimIncident()` NO tiene el mismo bug de tipo | **SE SOSTIENE, pero por la razón equivocada** — no tiene el bug de tipo porque **nunca hace la llamada correcta**; ver CRITICAL nuevo abajo |
| W1 — `spec.md` (delta y sincronizado) ya no describe capacidades inexistentes | **SE SOSTIENE** — pero el propio spec ahora expone la contradicción del CRITICAL nuevo (ver abajo) |
| W2 — permisos de `workflow.util.ts` alineados con el backend real por acción | **PARCIALMENTE FALSO** — alineados para `release`, `resolve`, `close`, `assign`; **para `claim`, la alineación es cosmética**: el gate se cambió a `CLAIM incidents` pero la llamada real sigue exigiendo `UPDATE incidents`, y ninguna de las dos coincide con lo que el backend expone para reclamar de verdad (`CLAIM incidents` vía `POST /:id/claim`) |
| Gates: 60/60 suites, 412/412 tests, build exit 0, 0 errores tsc en F3 | **CONFIRMADO** (418 en vez de 412 por commits externos posteriores, no regresión) |

---

## CRITICAL — `claim` nunca invoca `POST /incidents/:id/claim`; `claimed_by` no se escribe jamás desde la UI

### Evidencia, paso a paso

1. **`frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts:161-162`**:
   ```ts
   case 'claim':
     this.runStatusTransition(inc.id, 'in_progress');
     break;
   ```
   `runStatusTransition()` (línea 216-248) llama a `this.incidentService.updateIncidentStatus(id, to, closedReason)`.

2. **`frontend/src/app/core/services/incident.service.ts:82-99`** — `updateIncidentStatus()` hace `PATCH /incidents/${id}/status` con body `{ status }`. No hay ningún método `claimIncident()` en todo el servicio — confirmado por `grep -n "claim" incident.service.ts`, cero coincidencias fuera de un comentario.

3. **`backend/src/modules/incidents/incidents.controller.ts:194-208`** — la ruta `PATCH /:id/status` está protegida por `@RequirePermission('UPDATE')` (no `CLAIM`) y delega a `IncidentWorkflowService.changeStatus()`.

4. **`backend/src/modules/incidents/incident-workflow.service.ts:322-330`** — el `UPDATE` que ejecuta `changeStatus()` es:
   ```sql
   UPDATE incidents
      SET status = $2,
          closed_reason = $3,
          resolution_date = CASE WHEN $4 THEN NOW() ELSE NULL END
    WHERE id = $1
   RETURNING id, title, status, priority, claimed_by, organization_id, zone_id, closed_reason
   ```
   `claimed_by` está en el `RETURNING` (se lee) pero **no está en el `SET`** (no se escribe). Ninguna rama de `changeStatus()` toca esa columna.

5. **El endpoint que sí reclama de verdad existe y está completamente sin usar**: `backend/src/modules/incidents/incident-workflow.controller.ts:34-42` expone `POST /incidents/:id/claim`, protegido por `@RequirePermission('CLAIM', 'incidents')`, que delega a `IncidentWorkflowService.claim()` (líneas 87-124 del service): valida organización, valida el tope `max_active_claims` (`CLAIM_LIMIT_REACHED`, 429), y hace un `UPDATE ... SET claimed_by = $1, claimed_at = NOW() WHERE id = $2 AND claimed_by IS NULL` atómico (CAS). **Ninguno de estos tres controles de negocio (organización, tope, CAS) se ejecuta jamás desde el frontend**, porque `grep -rn "/claim\b\|claimIncident" frontend/src frontend/e2e` no encuentra ninguna referencia.

6. **El propio test de la ronda 5/anteriores prueba el bug sin darse cuenta**: `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts:150-166` —
   ```ts
   it('F3.4.7 — al ejecutar claim con éxito, el incident signal se actualiza y se muestra toast', () => {
     const { component, incidentSvc, toastSvc } = setup({ permissions: ['CLAIM incidents'] });
     const updated = { ...baseIncident, status: 'in_progress' as const };
     incidentSvc.updateIncidentStatus.mockReturnValue(of(updated));
     component.onAction('claim');
     expect(incidentSvc.updateIncidentStatus).toHaveBeenCalledWith('inc-1', 'in_progress', undefined);
     expect(component.incident()?.status).toBe('in_progress');
     ...
   ```
   `baseIncident.claimed_by` es `null` (línea 43) y `updated` se construye como `{ ...baseIncident, status: 'in_progress' }` — **sin tocar `claimed_by`**. El propio mock que el test usa para representar "éxito" demuestra, sin quererlo, que tras un claim exitoso `claimed_by` sigue `null`. Nadie hizo la aserción `expect(component.incident()?.claimed_by).toBe('user-1')` porque, de haberla escrito, habría fallado contra la implementación real y habría delatado el bug de inmediato.

7. **El spec.md contradice literalmente el código**: `specs/frontend-incidents/spec.md:67-68` (idéntico en el spec sincronizado `openspec/specs/frontend-incidents/spec.md:67-68`) —
   > Scenario: Reclamar — GIVEN una incidencia disponible y permiso `CLAIM incidents` WHEN se reclama THEN **queda asignada al usuario actual** y el estado se refleja sin recargar

   "Queda asignada al usuario actual" significa `claimed_by = currentUserId`. Eso nunca ocurre. El escenario documentado no es lo que el código hace — el mismo defecto de fondo (spec/código desalineados) que W1 supuestamente cerró para los filtros, pero que sobrevive intacto para el propio escenario de flujo de trabajo que la ronda 5 reescribió a mano en ese mismo archivo.

### Consecuencia funcional (no sólo estética)

- **Cadena de flujo permanentemente rota** para cualquier incidencia "reclamada" desde la UI: tras `claim`, `status = 'in_progress'` pero `claimed_by = null`. `availableActions()` (`workflow.util.ts:64,72`) exige `incident.claimed_by === currentUserId` para ofrecer `release` o `resolve` — condición que nunca se cumple. La incidencia queda en `in_progress` sin claimer, inalcanzable por `claim` de nuevo (`status === 'pending'` ya no se cumple) e inalcanzable por `release`/`resolve` (claimed_by nunca coincide). La única salida es `close` (si el usuario tiene `CLOSE incidents`), que no es el flujo que el spec describe.
- **Controles de negocio del backend completamente evitados**: el tope `max_active_claims` por organización y la validación `WRONG_ORGANIZATION` (ambos en `IncidentWorkflowService.claim()`) nunca se ejecutan porque el frontend nunca llama a esa ruta. Un operador puede "reclamar" (cambiar a `in_progress`) tantas incidencias como quiera sin que el tope de claims activos lo frene, porque `changeStatus()` no lo verifica — sólo `claim()` lo hace.
- **Regresión de autorización introducida por el W2 de la ronda 5**: antes de la ronda 5, `hasUpdate` gateaba la visibilidad de `claim` (`workflow.util.ts`, ver diff `faab811`), lo cual —aunque semánticamente incorrecto— era *consistente* con el permiso que la llamada real exige. Ronda 5 cambió el gate a `hasClaim` (`CLAIM incidents`) para "alinearlo con el backend", pero alineó la visibilidad con el permiso equivocado (el de la ruta que *debería* usarse, no el de la que *se* usa). Resultado verificable con los seeds reales: `operador_sistema` (`0015_organizations_scoping.sql` + `0019_incident_claim.sql` → `READ`, `CLAIM`, `RELEASE` incidents, **sin** `UPDATE incidents`) ahora ve el botón "Reclamar" — algo que antes de la ronda 5 no ocurría, porque antes el gate exigía `UPDATE incidents`, que este rol nunca tuvo — y al presionarlo recibe 403 del backend (`incidents.controller.ts:195`, confirmado también por el test backend `incidents.controller.spec.ts:61` "PATCH /:id/status requires UPDATE incidents permission"). Este es un fallo de UX/autorización nuevo, causado directamente por el fix que la ronda 5 certificó como cierre limpio de W2.

### Por qué ninguna ronda anterior lo atrapó

- Rondas 1-3: el foco estaba en `filtros/paginación` (C1), `release` no-op (C2 original) y `e2e`/autorización (C3). `claim` nunca fue objeto de un hallazgo propio pese a compartir el mismo patrón de riesgo ("verificar tipo de respuesta HTTP contra el contrato real") que sí se aplicó a `release`.
- Ronda 4 (hallazgo #663, "Learned (1)"): concluyó explícitamente que "`claim`/`resolve`/`close` SÍ están bien tipados porque van por `PATCH /incidents/:id/status` que devuelve `IncidentRow` completo" — una verificación de **forma** del tipo de retorno, correcta en sí misma, pero que no preguntó si esa ruta produce el **efecto** que la acción promete (reclamar = asignar `claimed_by`). Esa fue la oportunidad perdida más cercana: el auditor llegó hasta la línea exacta del código y no dio el paso siguiente.
- Ronda 5: el mandato estaba acotado explícitamente a C2 (`release`) + W1 + W2, y W2 se limitó a comparar el **nombre del permiso** por acción contra el decorador del backend, sin verificar a qué **endpoint real** apunta cada acción del frontend. Cambiar el gate de `claim` de `UPDATE` a `CLAIM` pasó todos los tests existentes (que sólo prueban la función pura `availableActions()` en aislamiento) sin que ningún test cruzara "qué endpoint invoca `onAction('claim')`" contra "qué permiso exige ese endpoint".

---

## Re-verificación de hallazgos previos (sin regresión)

### C1 (ronda 3→4) — filtros/paginación decorativos: sigue cerrado
- `IncidentListFilters` (`incident.model.ts:70-80`) sigue declarando sólo `status`.
- `toQueryParams()` (`incident.service.ts:153-159`) sigue emitiendo sólo `status`.
- `incident-list.component.html`/`.ts` — sin `<input search>` ni `<select priority>`; `shouldShowPagination = computed(() => false)` (línea 263).
- Sin cambios desde la ronda 4/5.

### C3 (ronda 3→4) — e2e/autorización: sigue cerrado, sin regresión oculta
- `app.routes.ts` — la ruta `incidencias` (líneas 205-224) sigue sin `canActivate: [permissionGuard]`. Se verificó si esto es ahora un gap real: **no lo es**. El `permissionGuard` (`frontend/src/app/core/guards/permission.guard.ts`) llegó a esta rama vía el squash-merge `f4886d1` (mencionado por la propia ronda 5 como causa del salto 41→60 suites), pero en **todo el árbol de rutas** (`app.routes.ts`) sólo se aplica a rutas de creación/edición (`new`, `:id/edit` de organizaciones/categorías/ubicaciones) — nunca a rutas de listado o detalle de sólo lectura. `incidencias` es consistente con esa convención, no una excepción. No se registra como hallazgo nuevo.

### W1 (ronda 4→5) — spec.md honesto: sigue cerrado para C1; expone el CRITICAL de `claim` (ver arriba)
El spec ya no miente sobre filtros/paginación. Pero el escenario "Reclamar" que la propia ronda 5 reescribió para W2 sí describe un comportamiento (`claimed_by` asignado) que el código no produce — no es una regresión de W1 (el texto siempre dijo eso, incluso antes de la ronda 5), pero la ronda 5 tuvo el escenario delante al reescribirlo y no lo cruzó contra el código.

### W2 (ronda 4→5) — permisos alineados: correcto para 4 de 5 acciones
`release` (`RELEASE incidents`), `resolve` (`UPDATE incidents`), `close` (`UPDATE incidents` + `CLOSE incidents`) y `assign` (`ASSIGN assignments`) están genuinamente alineados con los decoradores reales del backend. Sólo `claim` queda con una alineación cosmética (ver CRITICAL).

### Tareas de `tasks.md` — sanity check
Las 8 casillas sin marcar (F3.2.2b/c, F3.4.3, F3.4.6, F3.4.8/9/10, DoD detalle) se re-verificaron contra el código: **siguen siendo deuda honesta**, ninguna regresó ni se marcó `[x]` de forma prematura.

**F3.4.7** ("Renderizar las acciones de flujo... Tests cubren claim con éxito, claim con error, y release con merge parcial") — la casilla está marcada `[x]` y el texto es literalmente cierto (el test de "claim con éxito" existe y pasa) pero, igual que ocurrió con `release` en la ronda 4, **el valor del test como red de regresión es una ficción**: prueba que se llama a la URL equivocada con el resultado equivocado y lo certifica como éxito. Esta es la tercera vez en este mismo change que una casilla de F3.4.7 se marca `[x]` sobre una prueba que no habría podido atrapar el defecto real (ronda 3: no-op sin test; ronda 4: tipo incorrecto con mock ficticio; ronda 6: endpoint incorrecto con mock que no afirma sobre `claimed_by`).

---

## Coherence (Design)

| Decisión | ¿Se siguió? | Notas |
|---|---|---|
| D1 — afirmar sobre campos mapeados, no sobre la URL | ⚠️ Violada de nuevo, en `claim` | `release` la cumple desde la ronda 5; `claim` nunca afirmó sobre la URL invocada (`/status` vs `/claim`) ni sobre el campo que debía cambiar (`claimed_by`) |
| D4 — "ocultar un botón es ergonomía, no control", el servidor es la autoridad | ⚠️ Cumplida a medias | El servidor SÍ es la autoridad final (409/403 se manejan), pero el frontend invoca la autoridad equivocada para `claim` |
| W2 (ronda 5) — permisos por acción alineados al backend real | ⚠️ 4/5 acciones | `claim` alineado en apariencia, no en la llamada real |

---

## Issues Found

### CRITICAL (must fix before archive)

**El único CRITICAL de esta ronda — ver sección dedicada arriba.** Resumen accionable en `fixes-required-ronda-6.md`.

### WARNING

Ninguno nuevo. (W1/W2 de rondas previas siguen resueltos salvo por el componente de `claim` ya cubierto en el CRITICAL, que se prefirió no duplicar como WARNING separado porque es la misma causa raíz.)

### SUGGESTION

**S1** — El comentario de `workflow.util.ts:55-58` ("El usuario necesita CLAIM incidents") debería anotar explícitamente, hasta que se corrija el CRITICAL, que el wire real detrás de `onAction('claim')` sigue siendo `PATCH /status` con `UPDATE incidents` — para que un lector futuro no asuma que el comentario describe la llamada que efectivamente se ejecuta.

---

## Veredicto sobre archivo

**El archivo del 2026-09-06 fue prematuro.** El CRITICAL de esta ronda es responsabilidad directa de este change (F3.3.1/F3.4.7), no un defecto de backend a escalar — el endpoint correcto (`POST /:id/claim`) ya existe y funciona (tiene su propia cobertura en `incident-workflow.service.spec.ts`); el defecto es exclusivamente de wiring en el frontend.

**Recomendación concreta**: no reabrir este change archivado (romper la convención de archivo inmutable no es necesario). En su lugar, abrir un change de seguimiento dedicado — sugerido `2026-09-07-fix-incident-claim-wiring` (mismo patrón de nombre que `2026-08-29-fix-incident-state-machine`, sc-315, que ya corrigió un defecto de esta misma área) — con scope acotado a:
1. Conectar `onAction('claim')` a un nuevo método `IncidentService.claimIncident(id)` que llame `POST /incidents/:id/claim`.
2. Tipar la respuesta con el mismo `ClaimReleaseResult` que ya existe para `release` (el DTO es idéntico — `ClaimReleaseResponseDto`).
3. Merge parcial en cache y en el signal del detalle, igual que `release`.
4. Test que afirme `claimed_by === currentUserId` tras un claim exitoso (la aserción que faltó en los tres commits de F3.4.7 hasta ahora).
5. Revisar si `close`/`resolve` necesitan el mismo tratamiento de "endpoint correcto vs endpoint usado" — en este caso SÍ es correcto usar `PATCH /status` porque para esas dos acciones esa es la única ruta que existe; sólo `claim` tiene un endpoint dedicado sin usar.

Hasta que ese change se complete, F3 debe considerarse con una capacidad central (`claim`) documentada como no funcional en la práctica, pese a que sus tests pasan.

---

## Verdict

**FAIL** — 1 CRITICAL. C1, C2, C3, W1 y 4/5 de W2 se sostienen sin regresión. El hallazgo de esta ronda es nuevo (no reportado en rondas 1-5), afecta el primer eslabón de la cadena de flujo de trabajo (`claim`), y contradice tanto el propio `spec.md` como el endpoint dedicado del backend que existe para esta acción y que el frontend nunca invoca.
