# Fixes Required — Ronda 6: F3 — Módulo de Incidencias (sc-303)

**De**: `verify-report-ronda-6.md` (auditoría independiente, 2026-09-07)
**Change de origen (ya archivado)**: `openspec/changes/archive/2026-09-06-2026-08-29-f3-incidents-module/`
**Bloquea**: dar por buena la ronda 5 sin más acción. **No bloquea** el archivo ya hecho (no se recomienda reabrirlo), pero SÍ bloquea considerar el módulo de incidencias completo/seguro en producción hasta resolverse.

---

## Qué hizo tu compañero

Esto es un resumen en lenguaje llano de qué es este módulo y qué tocó tu compañero en las rondas 4 y 5, para que puedas entender el código sin haberlo escrito vos.

**Qué es F3.** Es la pantalla de "Incidencias" de la app: un listado con filtros, una vista de detalle con historial y comentarios, y botones de flujo de trabajo (Reclamar, Liberar, Resolver, Cerrar, Asignar) que un operador usa para trabajar un reporte ciudadano desde que se crea hasta que se cierra. El backend ya existía; el trabajo de tu compañero fue construir la UI de Angular que lo consume.

**El patrón de fondo, en las cinco rondas anteriores.** Cada vez que alguien marcaba una tarea como "hecha", un auditor independiente (`sdd-verify`) volvía a leer el código y el backend real y encontraba que algo no calzaba: filtros que el frontend mandaba pero el backend ignoraba en silencio, un botón "Liberar" que no hacía nada, un test de e2e que afirmaba una protección de seguridad que no existía. Eso se fue corrigiendo ronda a ronda.

**Qué corrigió específicamente la ronda 5 (el trabajo más reciente, commit `faab811`).** El hallazgo pendiente de la ronda 4 era que el botón "Liberar" (`release`) sí llamaba al backend, pero declaraba mal el tipo de dato que el backend le devuelve: el backend, a propósito, sólo manda de vuelta 7 campos (id, título, estado, prioridad, quién lo reclama, organización, fecha) en vez de la incidencia completa (25 campos). El código anterior asumía que recibía la incidencia completa y, al guardar la respuesta, **borraba de la pantalla** todos los campos que el backend no había mandado — la descripción desaparecía, el mapa desaparecía, sin ningún error visible. Tu compañero corrigió esto: creó un tipo `ClaimReleaseResult` con exactamente esos 7 campos, y cambió el código para que la respuesta se "mezcle" con lo que ya había en pantalla en vez de reemplazarlo entero. También revisó los permisos de cada botón (Reclamar/Liberar/Resolver/Cerrar/Asignar) para que coincidieran con lo que el backend realmente exige para cada uno, y reescribió la documentación del contrato (`spec.md`) para que no prometiera funciones que ya se habían recortado en una ronda anterior (búsqueda de texto libre, filtro por prioridad).

**Qué partes son las que sostienen el módulo (load-bearing) y están genuinamente bien:**
- El listado con filtro por estado, URL compartible, y el pie de página con `Mostrando N de N` — simple mentira, cero, todo lo que declara es lo que hace.
- El botón "Liberar" (`release`), tras la ronda 5 — la corrección del bug de datos es real y está probada con un test que efectivamente habría fallado antes del arreglo.
- Los botones "Resolver" y "Cerrar" — usan la misma ruta del backend que actualiza el estado, y esa ruta sí les devuelve la incidencia completa, así que nunca tuvieron el bug de "Liberar".
- El hilo de comentarios con imágenes — funciona de punta a punta.

**Qué encontró esta ronda (la 6, la que estás leyendo) que las cinco anteriores no vieron.** El botón "Reclamar" (`claim`) — el primer paso de todo el flujo, antes de poder liberar o resolver nada — **nunca llama al endpoint que el backend construyó específicamente para reclamar incidencias**. En vez de eso, usa la misma ruta genérica de "cambiar estado" que usan Resolver y Cerrar. Esa ruta genérica cambia el estado de la incidencia a "en proceso", pero **nunca anota quién la reclamó**. Es como si en la app dijera "Reclamada" pero en la base de datos nadie apareciera como el dueño del caso. Consecuencia práctica: después de reclamar una incidencia desde la pantalla, ni "Liberar" ni "Resolver" vuelven a aparecer nunca para nadie, porque ambos botones necesitan que la base de datos diga "esta persona la reclamó" — y eso nunca queda registrado. La incidencia queda encallada. Este no es un bug que tu compañero introdujo en la ronda 5 — viene desde la primera versión del módulo — pero sí es cierto que la ronda 5, al cambiar qué permiso hace aparecer el botón "Reclamar" en pantalla, expuso el problema a un rol nuevo (el operador de sistema) que antes ni siquiera veía el botón.

---

## CRITICAL — `claim` no invoca el endpoint dedicado del backend; `claimed_by` nunca se escribe desde la UI

**Qué está mal**: `onAction('claim')` (`frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts:161-162`) llama a `runStatusTransition(inc.id, 'in_progress')`, que a su vez llama a `IncidentService.updateIncidentStatus()` (`frontend/src/app/core/services/incident.service.ts:82-99`) → `PATCH /incidents/:id/status` con body `{ status: 'in_progress' }`. Esa ruta (`backend/src/modules/incidents/incidents.controller.ts:194-208` → `IncidentWorkflowService.changeStatus()`, `backend/src/modules/incidents/incident-workflow.service.ts:235-352`) valida la transición de estados y escribe `status`, `closed_reason` y `resolution_date` — **`claimed_by` nunca aparece en su `UPDATE ... SET`** (confirmado leyendo el SQL literal en `incident-workflow.service.ts:322-330`; sólo está en el `RETURNING`, o sea que se lee, no se escribe). El backend expone un endpoint específico para esto — `POST /incidents/:id/claim` (`backend/src/modules/incidents/incident-workflow.controller.ts:34-42` → `IncidentWorkflowService.claim()`, líneas 87-124) — que sí hace `UPDATE incidents SET claimed_by = $1, claimed_at = NOW() WHERE id = $2 AND claimed_by IS NULL` de forma atómica, valida la organización y el tope de claims activos por organización, y devuelve 409 si alguien más ya la reclamó. **El frontend nunca llama a esta ruta** — cero coincidencias de `/claim` o `claimIncident` en todo `frontend/src` y `frontend/e2e`.

**Consecuencia real**: tras presionar "Reclamar", la incidencia pasa a `in_progress` pero `claimed_by` sigue en `null`. `availableActions()` (`frontend/src/app/features/incidents/workflow.util.ts:64,72`) exige `incident.claimed_by === currentUserId` para ofrecer `release` o `resolve` — nunca se cumple. La incidencia queda atascada en `in_progress` sin reclamante: nadie puede reclamarla de nuevo (ya no está en `pending`), nadie puede liberarla ni resolverla (nadie es el `claimed_by`). Además, los controles de negocio del endpoint real (tope de claims activos por organización, chequeo de organización) nunca se ejecutan, porque el frontend nunca pasa por esa ruta.

**Por qué no lo atrapó el test**: `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts:150-166` (`'F3.4.7 — al ejecutar claim con éxito...'`) mockea `updateIncidentStatus` devolviendo `{ ...baseIncident, status: 'in_progress' }` — sin tocar `claimed_by` (que en `baseIncident`, línea 43, es `null`) — y sólo afirma `component.incident()?.status` toBe `'in_progress'`. Nunca afirma sobre `claimed_by`. Si hubiera afirmado `expect(component.incident()?.claimed_by).toBe('user-1')`, el test habría fallado de inmediato contra la implementación real, exactamente como debía. El test de `workflow.util.spec.ts:61` (`actions('pending', CLAIM_ONLY, null)` → `['claim']`) tampoco lo cubre: es un test de función pura sobre visibilidad del botón, desconectado de qué endpoint invoca el botón al presionarse. Ningún test cruza "qué URL llama `onAction('claim')`" contra "qué hace esa URL con `claimed_by`".

**Agravante — regresión de autorización introducida por el fix de W2 (ronda 5)**: antes de la ronda 5, el botón "Reclamar" se mostraba condicionado a `permissions.includes('UPDATE incidents')` (ver `git show faab811 -- frontend/src/app/features/incidents/workflow.util.ts`) — el mismo permiso que exige la ruta real que se invoca (`PATCH /:id/status`), así que un usuario que veía el botón podía usarlo sin 403, aunque el resultado fuera funcionalmente incorrecto. La ronda 5 cambió la condición a `permissions.includes('CLAIM incidents')` (`workflow.util.ts:52,57`) para "alinear con el backend" — pero alineó la visibilidad con el permiso de la ruta que *debería* usarse, no con el de la ruta que realmente se invoca. Con los seeds reales (`database/migrations/0015_organizations_scoping.sql:74-77` + `0019_incident_claim.sql:39-42`), el rol `operador_sistema` tiene `READ`, `CLAIM`, `RELEASE incidents` pero **no** `UPDATE incidents`. Antes de la ronda 5 ese rol nunca veía el botón "Reclamar" (no tenía `UPDATE`). Después de la ronda 5, sí lo ve (tiene `CLAIM`) — y al presionarlo recibe 403, porque `PATCH /:id/status` exige `UPDATE incidents` (`incidents.controller.ts:195`, con su propio test de contrato en `incidents.controller.spec.ts:61`: "PATCH /:id/status requires UPDATE incidents permission"). Es un fallo nuevo para ese rol, causado directamente por el cambio que la ronda 5 certificó como cierre limpio de W2.

**Archivos involucrados**:
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts:156-163` (`onAction`, `case 'claim'`)
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts:216-248` (`runStatusTransition`, reutilizada incorrectamente para `claim`)
- `frontend/src/app/core/services/incident.service.ts` (falta un método `claimIncident(id)`; el servicio no tiene ninguna referencia a `/claim`)
- `frontend/src/app/features/incidents/workflow.util.ts:52,57` (gate `hasClaim`, desconectado del endpoint real)
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts:150-166` (test de "claim con éxito" sin aserción sobre `claimed_by`)
- `specs/frontend-incidents/spec.md:67-68` y `openspec/specs/frontend-incidents/spec.md:67-68` (escenario "Reclamar" que promete `claimed_by` asignado — no implementado)
- Referencia de contrato — endpoint correcto sin usar: `backend/src/modules/incidents/incident-workflow.controller.ts:34-42`, `backend/src/modules/incidents/incident-workflow.service.ts:80-124`
- Referencia de contrato — endpoint incorrectamente reutilizado: `backend/src/modules/incidents/incidents.controller.ts:194-208`, `backend/src/modules/incidents/incident-workflow.service.ts:235-352`
- Seeds de permisos citados: `database/migrations/0015_organizations_scoping.sql:74-77`, `database/migrations/0019_incident_claim.sql:39-42`

**Qué cambiar**:

1. Agregar `IncidentService.claimIncident(id: string): Observable<ClaimReleaseResult>` en `incident.service.ts`, con la misma forma que `releaseIncident()` (líneas 110-131): `POST /incidents/${id}/claim` con body `{}`, y merge parcial en el cache (`{ ...inc, ...claimed }`), reutilizando el tipo `ClaimReleaseResult` que ya existe en `incident.model.ts:97-105` (el DTO del backend es idéntico para `claim` y `release`: `ClaimReleaseResponseDto`).
2. En `incident-detail.component.ts`, separar `case 'claim'` de `runStatusTransition()`: debe llamar a `incidentService.claimIncident(inc.id)` y hacer merge parcial en el signal (`this.incident.update(cur => cur ? { ...cur, ...claimed } : cur)`), con manejo de error análogo al de `release` (409 `INCIDENT_ALREADY_CLAIMED`, 429 `CLAIM_LIMIT_REACHED`, 403 `WRONG_ORGANIZATION` — recargar la incidencia con `getIncident()` en el `error`).
3. Corregir el test de `incident-detail.component.spec.ts` ("claim con éxito") para que el mock de `claimIncident` (no `updateIncidentStatus`) devuelva el shape slim real (`ClaimReleaseResult`) con `claimed_by: 'user-1'`, y agregar la aserción que faltaba: `expect(component.incident()?.claimed_by).toBe('user-1')`.
4. Agregar a `incident.service.spec.ts` un test de `claimIncident` con el mismo estilo que el de `releaseIncident` (aserciones positivas de los 7 campos, negativas de los campos fuera del DTO, y preservación del resto de campos en cache) — hoy `claimIncident` no existe, así que no puede tener test.
5. Revisar si mantener `hasClaim = permissions.includes('CLAIM incidents')` en `workflow.util.ts` — sí, es el gate correcto una vez que el paso 1-2 conecten la acción al endpoint real que exige exactamente ese permiso.
6. No tocar `resolve`/`close`: para esas dos acciones, `PATCH /:id/status` sigue siendo la ruta correcta — no tienen un endpoint dedicado alternativo, así que no comparten este defecto.

**Test que debe pasar**: un test de `incident-detail.component.spec.ts` que mockee `claimIncident` devolviendo un `ClaimReleaseResult` con `claimed_by: 'user-1'` y verifique `component.incident()?.claimed_by === 'user-1'` tras `onAction('claim')` — ese test **fallaría** contra el código actual (que ni siquiera tiene el método `claimIncident`, y cuyo `case 'claim'` actual jamás setea `claimed_by`), que es exactamente la condición que prueba que el fix es real.

**Tarea a desmarcar hasta resolver**: F3.3.1 y F3.4.7 (o re-marcarlas acotando que `claim` no reclama de verdad — la tercera vez que F3.4.7 necesita esta acotación, después de la ronda 3 (`release` no-op) y la ronda 4 (`release` con tipo incorrecto)).

---

## Deuda no bloqueante a registrar

Ninguna nueva en esta ronda. Las deudas de W1/W2 de rondas previas siguen cerradas salvo por el componente ya cubierto en el CRITICAL de arriba (mismo origen, no se duplica como ítem separado).

---

## Orden sugerido

El CRITICAL de `claim` bloquea considerar el flujo de trabajo de F3 funcionalmente completo, pero **no** amerita reabrir el change ya archivado (`2026-09-06-2026-08-29-f3-incidents-module`) — el archivo en sí (la operación de mover carpetas y cerrar el ciclo SDD) no está mal hecha; lo que está mal es una porción del código que el archivo cerró sin que ninguna de las cinco auditorías previas la hubiera abierto como hallazgo propio.

**Recomendación**: abrir un change de seguimiento acotado, sugerido `2026-09-07-fix-incident-claim-wiring` (mismo patrón de nombre que `2026-08-29-fix-incident-state-machine`, que ya corrigió otro defecto de esta misma área de negocio), con el scope de los 6 puntos de "Qué cambiar" arriba. Después de resolverlo, correr `pnpm test && pnpm run build` desde `frontend/` y pedir una ronda 7 de `sdd-verify` acotada a ese change — no hace falta re-auditar C1/C2/C3/W1/W2, que siguen cerrados.
