# Tasks: Fix `claim` wiring — la acción reclama de verdad

**Change**: `2026-09-07-fix-incident-claim-wiring`
**Origen**: `fixes-required-ronda-6.md` (sc-303, archivado en
`archive/2026-09-06-2026-08-29-f3-incidents-module`)
**Working dir**: `frontend/`
**Razón de ser**: change de seguimiento recomendado por el verificador de la ronda 6.
No reabre el archivo de F3 — el archivo en sí no está mal hecho, lo que está mal
es el wiring de la acción `claim` que el archivo cerró sin que las cinco auditorías
previas lo hubieran abierto como hallazgo propio.

---

## 1 · Conectar `claim` al endpoint dedicado

- [x] **1.1** — Agregar `IncidentService.claimIncident(id: string): Observable<ClaimReleaseResult>`
  en `frontend/src/app/core/services/incident.service.ts`. `POST /incidents/${id}/claim`
  con body `{}`. Mismo tipo de retorno que `releaseIncident` (mismo DTO
  `ClaimReleaseResponseDto` en el backend, mismo `ClaimReleaseResult` en el frontend).
  Merge parcial en cache (`{ ...inc, ...claimed }`).

- [x] **1.2** — En `incident-detail.component.ts`, separar `case 'claim'` de
  `runStatusTransition()`. Debe llamar a `this.incidentService.claimIncident(inc.id)`,
  hacer merge parcial en el signal (`this.incident.update(cur => cur ? { ...cur, ...claimed } : cur)`),
  recargar el historial, y manejar el error análogo al de `release` (409
  `INCIDENT_ALREADY_CLAIMED`, 429 `CLAIM_LIMIT_REACHED`, 403 `WRONG_ORGANIZATION`
  ⇒ toast con el motivo + recarga con `getIncident()`).

- [x] **1.3** — Reemplazar el mock de `incident-detail.component.spec.ts:150-166`
  ("claim con éxito") para que `claimIncident` devuelva el shape slim real con
  `claimed_by: 'user-1'`, y agregar la aserción que faltaba:
  `expect(component.incident()?.claimed_by).toBe('user-1')`. El test que nunca
  existió y que habría fallado contra la implementación pre-fix.

- [x] **1.4** — Agregar a `incident.service.spec.ts` un test de `claimIncident`
  con el mismo estilo que el de `releaseIncident` (aserciones positivas de los 7
  campos, aserciones negativas de los campos fuera del DTO, y preservación del
  resto de campos en cache — en particular `claimed_by` debe quedar
  actualizado a `user-1`, no `null`).

## 2 · Regresión de autorización que el fix también cierra

- [x] **2.1** — Verificar que `operador_sistema` (`0015_organizations_scoping.sql`
  + `0019_incident_claim.sql` → `READ`, `CLAIM`, `RELEASE` incidents, sin
  `UPDATE incidents`) ahora puede reclamar y liberar. El fix 1.1-1.2 conecta
  la acción al endpoint que exige `CLAIM incidents` (permiso que este rol
  sí tiene), en vez del endpoint equivocado que exigía `UPDATE incidents`
  (permiso que este rol no tiene). Antes de este fix, el botón "Reclamar"
  aparecía para `operador_sistema` (gate `hasClaim`, ronda 5) pero al
  presionarlo recibía 403 del backend. Después del fix, el botón aparece
  y la acción funciona.

## 3 · No tocar (por contrato del scope)

- [x] **3.1** — NO modificar `resolve`/`close`. Para esas dos acciones,
  `PATCH /:id/status` ES la ruta correcta del backend — no tienen un
  endpoint dedicado alternativo, así que no comparten el defecto de `claim`.

- [x] **3.2** — NO modificar `workflow.util.ts`. El gate `hasClaim` ya está
  correctamente alineado con el permiso del endpoint que DEBERÍA usarse
  (`CLAIM incidents`). El fix 1.1-1.2 hace que la realidad del wire
  coincida con el permiso que el gate ya exigía.

- [x] **3.3** — NO modificar `specs/frontend-incidents/spec.md` del proyecto. El
  escenario "Reclamar" ya dice "queda asignada al usuario actual"; este
  fix materializa eso, no contradice el spec. **Pero SÍ** crear
  el `spec.md` de delta dentro del propio change (ronda 7 WARNING).
  Ver §4.

## 4 · Artefacto SDD (WARNING ronda 7)

- [x] **4.1** — Crear `specs/frontend-incidents/spec.md` dentro del change
  declarando "sin delta de comportamiento" — el escenario "Reclamar" del
  spec del proyecto ya era correcto; este fix lo materializa. La
  convención SDD del proyecto pide que todo change registre, aunque sea
  de forma mínima, si modifica o no una capacidad descrita en el spec
  del proyecto. Sin este archivo, la convención estaba rota aunque el
  código estuviera bien.

---

## Compuertas

- `cd frontend && pnpm test` — 60/60 suites, 419/419 tests PASS (ronda 6: 418, +1 con este fix)
- `cd frontend && pnpm run build` — exit 0
- `npx tsc -b --noEmit` — 9 errores preexistentes en 3 archivos (no F3); 0 en archivos de este change
