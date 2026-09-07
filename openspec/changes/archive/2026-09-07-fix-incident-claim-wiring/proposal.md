# Fix `claim` wiring — la acción reclama de verdad

**Origen**: `fixes-required-ronda-6.md` del change archivado
`2026-09-06-2026-08-29-f3-incidents-module` (sc-303, ronda 6 de verify).
**Bloquea**: considerar el flujo de trabajo de F3 funcionalmente completo.

## TL;DR

`onAction('claim')` (en `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts`)
nunca invoca el endpoint dedicado del backend. Llama en cambio a `PATCH /incidents/:id/status`
con `{ status: 'in_progress' }` — la misma ruta que usan `resolve` y `close` — y esa ruta
**no escribe `claimed_by`**. Resultado: la UI "reclamaba" pero la base de datos no registraba
al claimer, dejando `release` y `resolve` inalcanzables.

## Por qué es un change aparte y no una reapertura

El change F3 ya está archivado. El defecto es responsabilidad de este change (F3.3.1/F3.4.7),
no un defecto del backend a escalar — el endpoint correcto (`POST /:id/claim`) ya existe
y funciona, con su propia cobertura en `incident-workflow.service.spec.ts`. El defecto es
100% de wiring en el frontend.

## Scope

1. Agregar `IncidentService.claimIncident(id): Observable<ClaimReleaseResult>`.
2. Conectar `case 'claim'` a `claimIncident` (mismo patrón que `release`: merge parcial,
   toast de éxito/error, recarga del incident en 409/403/429).
3. Test que afirme `claimed_by === currentUserId` tras un claim exitoso.
4. Test de servicio para `claimIncident` (URL, body, aserciones pos/neg, merge en cache).
5. No tocar `resolve`/`close` — para ellas `PATCH /:id/status` ES la ruta correcta.

## Lo que NO cambia

- `workflow.util.ts` — el gate `hasClaim = permissions.includes('CLAIM incidents')` es
  correcto; el fix de visibilidad ya está alineado con la ruta que DEBERÍA usarse.
- `specs/frontend-incidents/spec.md` — el escenario "Reclamar" ya dice "queda asignada al
  usuario actual"; el fix materializa eso, no contradice el spec.
- Backend — sin cambios. El endpoint dedicado ya existe y está cubierto.
