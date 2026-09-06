# Fixes Required: F3 — Módulo de Incidencias (sc-303)

**De**: verify-report.md, ronda 4
**Bloquea**: `sdd-archive` de `2026-08-29-f3-incidents-module`

---

## C2 (reabierto) — `releaseIncident()` declara el tipo de respuesta incorrecto y corrompe el signal `incident` tras un release exitoso

**Qué está mal**: el backend (`incident-workflow.controller.ts:44-52`) devuelve
`ClaimReleaseResponseDto` para `POST /incidents/:id/release` — un shape recortado a propósito
de 7 campos (`id, title, status, priority, claimed_by, organization_id, updated_at` tras
`SnakeCaseResponseInterceptor`). `IncidentService.releaseIncident()`
(`frontend/src/app/core/services/incident.service.ts:118`) lo declara como
`Observable<Incident>` — el modelo completo de 25 campos. `incident-detail.component.ts:171`
hace `this.incident.set(released)`, reemplazando el signal completo con el objeto de 7 campos.
Consecuencia real: tras liberar una incidencia, `hasCoordinates()` pasa a `false` (el mini-mapa
desaparece aunque la incidencia sí tenga coordenadas), "Reportada por {{inc.citizen_id}}" queda
en blanco, y cualquier otro campo fuera de los 7 del DTO queda `undefined` sin ningún error
visible.

**Por qué no lo atrapó el test**: `incident-detail.component.spec.ts:238` mockea
`releaseIncident` devolviendo un `Incident` completo (`{ ...claimedIncident, claimed_by: null
}`), no el shape real de 7 campos. Además, `incident.service.spec.ts` no tiene ningún test para
`releaseIncident` — es el único de los nueve métodos del servicio sin cobertura.

**Archivos involucrados**:
- `frontend/src/app/core/services/incident.service.ts:118-129` (`releaseIncident`)
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts:170-186`
  (`onAction('release')`)
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts:220-267`
  (los dos tests de C2, con el mock incorrecto)
- `frontend/src/app/core/services/incident.service.spec.ts` (falta cobertura de `releaseIncident`)
- Referencia de contrato: `backend/src/modules/incidents/dto/claim-release-response.dto.ts`,
  `backend/src/common/interceptors/snake-case-response.interceptor.ts`

**Qué cambiar**:

1. Tipar `releaseIncident()` con el shape real de 7 campos (un tipo local, p.ej.
   `ClaimReleaseResult`, con `claimed_by`/`organization_id`/`updated_at` en snake_case — el
   wire real tras el interceptor), no `Incident`.
2. En `incident-detail.component.ts`, elegir una de dos rutas honestas:
   - (a) hacer merge parcial: `this.incident.update(cur => cur ? { ...cur, ...released } :
     cur)`, proyectando sólo los 7 campos que realmente cambiaron; o
   - (b) descartar el payload de `release` y recargar la incidencia completa con
     `getIncident(id)` en el `next`, igual que ya hace el camino de `error` (línea 182-184).
3. Corregir el mock de `incident-detail.component.spec.ts:238` para que `releaseIncident`
   devuelva el shape real de 7 campos, no un `Incident` completo — así el test hubiera
   atrapado el bug.
4. Agregar a `incident.service.spec.ts` un test de `releaseIncident` que afirme sobre la URL
   (`POST /incidents/:id/release`), el body (`{}`), y el shape de la respuesta — siguiendo el
   mismo estilo de aserciones positivas/negativas que ya usa el test de C1
   (`incident.service.spec.ts:70-88`).

**Test que debe pasar**: un test de `incident-detail.component.spec.ts` que mockee
`releaseIncident` devolviendo *sólo* los 7 campos del `ClaimReleaseResponseDto` y verifique que
el resto de los campos de `incident()` (p.ej. `description`, `lat`, `citizen_id`) **se
conservan** tras el release — hoy ese test fallaría con la implementación actual, que es
exactamente lo que debe pasar para probar que el fix es real.

**Tarea a desmarcar hasta resolver**: F3.4.7 (o re-marcarla acotando que el camino de éxito de
`release` todavía no está probado contra el contrato real del backend).

---

## Deuda no bloqueante a registrar (no impide archivar si C2 se resuelve, pero debe quedar anotada)

### W1 — `specs/frontend-incidents/spec.md` no refleja el alcance reducido de C1 (ronda 3→4)

Los escenarios "Filtros combinados", "Búsqueda por texto" y "Conteo" (formato `1-10 de 14`)
siguen describiendo capacidades que el código ya no tiene. Actualizar el spec o anotar
explícitamente la reducción de alcance con referencia a esta ronda.

### W2 — Gate de permisos de `release`/`claim`/`resolve` no coincide con lo que exige el backend

`workflow.util.ts` usa `permissions.includes('UPDATE incidents')` para las tres acciones, pero
el backend exige `CLAIM incidents` / `RELEASE incidents` específicamente
(`database/migrations/0019_incident_claim.sql`). El rol `operador_sistema` tiene `CLAIM`/
`RELEASE incidents` pero NO `UPDATE incidents` (ver seed en
`database/migrations/0015_organizations_scoping.sql`), así que nunca ve los botones pese a
tener el permiso de backend. Previo a esta ronda (F3.3.1), no bloqueante para archivar F3, pero
debe quedar registrado como deuda porque afecta directamente si "release funciona de verdad"
para todos los roles que el backend habilita.

---

## Orden sugerido

Sólo C2 bloquea. W1 y W2 pueden resolverse en un follow-up o quedar documentados como deuda
aceptada al archivar, a criterio del builder. Después de resolver C2, correr de nuevo
`pnpm test && pnpm run build` y pedir una ronda 5 de `sdd-verify` (acotada a C2) antes de
`sdd-archive`.
