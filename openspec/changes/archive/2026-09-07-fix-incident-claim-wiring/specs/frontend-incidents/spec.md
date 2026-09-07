# Spec: Fix `claim` wiring — la acción reclama de verdad

## Domain: frontend-incidents (NO DELTA)

> **Este change NO introduce un delta de comportamiento.** El escenario "Reclamar"
> del spec del proyecto (`openspec/specs/frontend-incidents/spec.md:67-68` —
> idéntico al del change archivado `2026-09-06-2026-08-29-f3-incidents-module/specs/frontend-incidents/spec.md:67-68`)
> ya describía el comportamiento correcto:
>
> > Scenario: Reclamar — GIVEN una incidencia disponible y permiso `CLAIM incidents`
> > WHEN se reclama THEN **queda asignada al usuario actual** y el estado se refleja
> > sin recargar
>
> El defecto que este change corrige (documentado en
> `openspec/changes/archive/2026-09-06-2026-08-29-f3-incidents-module/fixes-required-ronda-6.md`)
> era que la implementación no cumplía este escenario: la UI "reclamaba" cambiando
> el estado a `in_progress` (vía `PATCH /incidents/:id/status`), pero esa ruta del
> backend NO escribe `claimed_by` en la base de datos. La consecuencia era que
> la cadena de flujo quedaba permanentemente rota — `release` y `resolve`
> exigen `claimed_by === currentUserId`, y esa condición nunca se cumplía.
>
> Este fix conecta `onAction('claim')` al endpoint dedicado
> `POST /incidents/:id/claim` (que SÍ escribe `claimed_by` mediante un
> `UPDATE ... SET claimed_by = $1, claimed_at = NOW() WHERE id = $2 AND claimed_by IS NULL`
> atómico). Sin modificar la implementación del spec, el escenario "Reclamar"
> pasa de describir un comportamiento que el código NO producía a describir
> un comportamiento que el código SÍ produce. El contrato del change archivado
> ya era el contrato de este change.
>
> Por qué este `spec.md` de delta existe aunque no haya delta: la convención SDD
> del proyecto (visible en el propio change archivado) pide que todo change
> registre, aunque sea de forma mínima, si modifica o no una capacidad descrita
> en el spec del proyecto. El `fixes-required-ronda-7.md` documenta este gap como
> WARNING; este archivo lo cierra declarando explícitamente "sin delta".

### Requirement: Reclamar una incidencia (sin cambio)

El detalle DEBE permitir reclamar la incidencia disponible para el usuario actual
cuando tiene permiso `CLAIM incidents`. El estado de la pantalla debe reflejar
la asignación al usuario actual sin recargar la página.

- Scenario: Reclamar asigna al usuario actual — GIVEN una incidencia en estado
  `pending` sin reclamar y el usuario tiene `CLAIM incidents` WHEN pulsa "Reclamar"
  THEN la incidencia queda asignada al usuario actual (campo `claimed_by` poblado
  con el id del caller) y el estado pasa a `in_progress`. **Este escenario ya
  estaba en el spec del proyecto** (`openspec/specs/frontend-incidents/spec.md:67-68`);
  este change lo hace real.
- Scenario: Reclamar falla con código del backend — GIVEN la acción "Reclamar"
  WHEN el backend responde con un error (409 `INCIDENT_ALREADY_CLAIMED`,
  429 `CLAIM_LIMIT_REACHED`, 403 `WRONG_ORGANIZATION`) THEN el toast muestra el
  mensaje del backend y la pantalla se resincroniza con `GET /incidents/:id`.
  **Este escenario es nuevo respecto al spec del proyecto** (donde el contrato
  sólo menciona "se muestra el motivo" en el escenario "Transición inválida" de
  la sección "Acciones de flujo de trabajo"), pero no introduce un delta de
  capacidad: es la aplicación concreta de un patrón ya descrito (D4: "el servidor
  es la autoridad; si devuelve 409, se muestra el motivo y se resincroniza").

## Lo que NO se modifica (por contrato del scope)

- **`workflow.util.ts`** — sin cambios. El gate `hasClaim = permissions.includes('CLAIM incidents')`
  ya estaba alineado con el permiso del endpoint dedicado. El fix de la ronda 5 (W2)
  cerró la visibilidad; este fix cierra la llamada.
- **`resolve`/`close`** — sin cambios. Para esas dos acciones, `PATCH /incidents/:id/status`
  ES la ruta correcta del backend (no tienen endpoint dedicado alternativo).
- **`specs/frontend-incidents/spec.md` del proyecto** — sin cambios. El escenario
  "Reclamar" ya era correcto; este fix lo hace real.
- **Backend** — sin cambios. El endpoint `POST /incidents/:id/claim` ya existía
  y estaba cubierto en `incident-workflow.service.spec.ts`.

## Cómo verificar el delta

1. La ausencia de delta se confirma con el typecheck: `tsc -b --noEmit` no introduce
   errores en los archivos de este change.
2. La paridad con el spec se confirma con el test del componente:
   `incident-detail.component.spec.ts` afirma que tras un claim exitoso,
   `component.incident()?.claimed_by === 'user-1'`. Esa aserción es exactamente
   el THEN del escenario "Reclamar" del spec.
3. La ausencia de regresión se confirma con la suite completa: 60/60 suites,
   419/419 tests PASS (1 más que la ronda 6 — el test nuevo del servicio).
