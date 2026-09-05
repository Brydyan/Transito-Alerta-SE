# Verify Report: F3 — Módulo de Incidencias (sc-303)

**Change**: `2026-08-29-f3-incidents-module`
**Ronda auditada**: 4 (correcciones de `fixes-required.md` de la ronda 3)
**Fecha**: 2026-09-04/05
**Auditor**: sdd-verify (sesión de auditoría independiente)
**Modo**: Standard verify (openspec). Compuertas de `ci.yml` re-ejecutadas en vivo. Contrato de `release` cruzado campo por campo contra el backend real, no asumido del apply-progress.

---

## Resumen ejecutivo

**1 CRITICAL, 3 WARNING, 1 SUGGESTION.**

De los 3 CRITICAL de la ronda 3, **dos cerraron de verdad** (C1 y C3) y **uno se reabre con un
defecto distinto** (C2): el no-op se resolvió, pero el fix introdujo el mismo tipo de bug que
ya había costado una ronda completa en el pasado — un tipo de respuesta HTTP que no coincide
con lo que el backend realmente devuelve, enmascarado por un test que mockea el shape
incorrecto.

Las compuertas de `ci.yml` pasan con los números exactos que `apply-progress.md` declara:
**41/41 suites, 290/290 tests, `pnpm run build` exit 0** (bundle en 3.9s). `npx tsc -b --noEmit`
sigue en **14 errores preexistentes**, sin regresión (mismos archivos que la ronda 3: node:fs/
node:path/__dirname sin `@types/node`, más el mismatch de `auth.service.spec.ts`). Verificado
por ejecución directa.

### C1 — Filtros/paginación decorativos: CERRADO, honestamente

Se optó por la Ruta 2 (recortar el frontend, no parchear el backend). Verificado contra el
código, no contra la prosa:

- `IncidentListFilters` (`incident.model.ts:70-80`) declara sólo `status`; los demás campos
  quedan comentados como deuda explícita.
- `toQueryParams()` (`incident.service.ts:151-157`) sólo emite `status`. Test
  `incident.service.spec.ts:70-88` confirma por aserción negativa (`params.has('search')` ===
  `false`, etc.) — no es un test que sólo mira lo que se manda, también mira lo que NO se manda.
- `incident-list.component.html` **ya no renderiza** el `<input type="search">` ni el
  `<select id="priority">` (verificado leyendo el archivo — no quedó ningún control decorativo).
- `shouldShowPagination()` es `computed(() => false)` (`incident-list.component.ts:263`), y
  `@if (shouldShowPagination())` en el template efectivamente oculta `<app-pagination>`. Test
  `incident-list.component.spec.ts:152-157` lo afirma.
- `rangeText()` cambia el formato a `Mostrando N de N` (no promete un rango que no existe).
- Ningún control visible le miente al usuario. Esto es un cierre honesto de alcance, no un
  archivado prematuro — con una salvedad marcada como WARNING más abajo (el spec no se
  actualizó).

### C2 — `release` no-op: EL NO-OP CERRÓ, PERO SE ABRIÓ UN DEFECTO DE TIPO (CRITICAL nuevo)

**Lo que sí se arregló**: `onAction('release')` (`incident-detail.component.ts:164-186`) ya
llama a `incidentService.releaseIncident(inc.id)`, que hace `POST /incidents/:id/release` —
la ruta real de `incident-workflow.controller.ts:44-52`, confirmada leyendo el controller (no
asumida). Ya no es un no-op.

**Lo que NO se verificó, y debía ser el corazón del fix**: el tipo de la respuesta.

- El backend (`incident-workflow.controller.ts:47-51`) devuelve `Promise<ClaimReleaseResponseDto>`.
  El DTO (`dto/claim-release-response.dto.ts:8-16`) es un shape **deliberadamente recortado**:
  `{ id, title, status, priority, claimedBy, organizationId, updatedAt }` — siete campos, en
  camelCase en el código TS pero convertidos a snake_case por `SnakeCaseResponseInterceptor`
  (registrado globalmente en `main.ts:62`, confirmado leyendo el interceptor) antes de llegar
  al cliente: `{ id, title, status, priority, claimed_by, organization_id, updated_at }`.
- `IncidentService.releaseIncident()` (`incident.service.ts:118-129`) declara
  `Observable<Incident>` — el modelo **completo**, con 25 campos (`description`, `lat`, `lng`,
  `zone_id`, `citizen_id`, `assigned_to`, `category_id`, `claimed_at`, `approved_by`,
  `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`, `closed_reason`,
  `resolution_date`, `created_at`, `deleted_at`, `geofence_matched`...). El `HttpService.post<T>`
  (`http.service.ts:25-27`) no hace validación de runtime — es un cast puro. TypeScript no
  detecta el mismatch porque nada lo fuerza a nivel de tipos (el body de la respuesta real es
  `any` hasta el cast).
- **Consecuencia real**: `incident-detail.component.ts:171-172` hace
  `this.incident.set(released)` con ese objeto de 7 campos, pisando el signal `incident` que
  hasta ese momento tenía los 25 campos reales. El template (`incident-detail.component.html`)
  lee `inc.citizen_id` (línea 40, "Reportada por…"), `inc.lat`/`inc.lng` a través de
  `hasCoordinates()` (línea 113-116, `Number.isFinite(inc.lat)`), `inc.zone_id` (línea 94),
  `inc.description` (línea 78, con fallback `|| 'Sin descripción.'` que sí lo cubre) y
  `inc.closed_reason` (línea 45). Después de un release exitoso contra el backend real: el
  mini-mapa **desaparece silenciosamente** (`hasCoordinates()` pasa a `false` porque
  `inc.lat` es `undefined`, aunque la incidencia sí tenga coordenadas), "Reportada por" queda
  en blanco, y cualquier otra lectura de un campo fuera de los siete que el DTO trae se
  vuelve `undefined` sin error visible — data loss silencioso, la clase de bug más difícil de
  detectar en QA manual porque no lanza ninguna excepción.
- **Por qué no lo atrapó el test**: `incident-detail.component.spec.ts:238`
  (`const released: Incident = { ...claimedIncident, claimed_by: null };`) mockea
  `releaseIncident` para que devuelva un `Incident` **completo**, no el shape real de 7 campos
  que el backend produce. El test pasa porque prueba contra una ficción, exactamente el patrón
  que el propio `apply-progress.md` de la ronda 1 identificó como causa raíz de aquel primer
  CRITICAL ("D1: afirmar sobre campos mapeados, no sobre la URL/el mock").
- **Agravante**: no existe ningún test en `incident.service.spec.ts` para `releaseIncident` —
  ni de la URL, ni del método HTTP, ni del shape de respuesta. Los otros ocho métodos del
  service sí tienen cobertura (`getIncidents`, `getIncident`, `createIncident`,
  `updateIncidentStatus` ×2, `deleteIncident`); `releaseIncident` es el único sin ningún test a
  nivel de servicio. Confirmado con `grep` sobre el archivo — cero coincidencias de "release".

Esto es del mismo tipo exacto de defecto que el C2 de la ronda 1 (tipo de respuesta HTTP no
verificado contra el contrato real), en el mismo change, sobre la misma acción de flujo
(`release`), corregido dos rondas después de que el mismo problema general (mismatch de tipo
de respuesta) ya había costado una ronda completa. El "no lo repitas" no se sostuvo.

**Hallazgo relacionado, no bloqueante en este round pero documentado como WARNING**: el gate de
permisos de `release`/`claim`/`resolve` en `workflow.util.ts` (`hasUpdate = permissions.includes
('UPDATE incidents')`, no tocado en esta ronda) no coincide con el permiso que el backend
realmente exige para `release` (`RequirePermission('RELEASE', 'incidents')`, ver `incident-
workflow.controller.ts:46`). Ver WARNING 2 abajo.

### C3 — e2e/autorización inexistente: CERRADO, honestamente

Ruta 2 elegida (corregir el texto, no inventar un guard). Verificado:

- `app.routes.ts:156-177` — la ruta `incidencias` sigue sin ningún guard propio; sólo hereda
  `authGuard` del padre `app` (autenticación, no autorización). `permissionGuard` de F2
  efectivamente no existe (`grep -rn "permissionGuard"` sobre `frontend/src` no encuentra
  ninguna definición, sólo la mención en comentarios). Esto es consistente con lo que
  `tasks.md`/`apply-progress.md` afirman: el gap sigue abierto y así se declara.
- `frontend/e2e/incident-flow.e2e.ts:47-64` — el segundo test ya no afirma "sin acceso directo
  por URL". La única aserción real es `expect(page.locator('[data-testid="action-assign"]'))
  .toHaveCount(0)`, con un comentario que dice explícitamente qué NO cubre y por qué (F2
  pendiente). Esto es honestidad de alcance, no un recorte disimulado.
- `tasks.md` F3.6.3 quedó marcada `[x]` con la leyenda **"HECHO con alcance reducido"** y el
  texto explica exactamente lo que el código hace y lo que no. Correcto: no es un archivado
  prematuro porque el texto de la tarea ahora es verdad.

---

## Compuertas (ejecutadas en vivo, mismo job que `ci.yml` → `frontend`)

| Compuerta | Comando | Resultado |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ✅ up to date |
| Tests | `pnpm test` | ✅ **41/41 suites, 290/290 tests**, 4s |
| Build | `pnpm run build` | ✅ exit 0, bundle 3.9s |
| Lint (condicional) | — | ➖ no existe config de eslint en `frontend/` (correctamente omitido, igual que rondas previas) |
| Type-check | `npx tsc -b --noEmit` | ⚠️ 14 errores, **todos preexistentes, sin regresión** (mismos 5 archivos que la ronda 3: `auth.interceptor.regression.spec.ts`, `auth.service.spec.ts`, `layout-tokens.regression.spec.ts`, `sidebar.spec.ts`, `contrast.regression.spec.ts`) |

Ninguna compuerta se omitió sin ejecutar. `pnpm test:e2e` no corrió (requiere `BASE_URL` +
backend levantado, misma convención de skip que `auth-flow.e2e.ts`/`menu-navigation.e2e.ts`) —
no es parte del job `frontend` de `ci.yml`, así que no es una compuerta bloqueante para este
change.

---

## Completeness (tasks.md)

| Métrica | Valor |
|---|---|
| Tareas totales | 50 (42 + 8, incluyendo el ítem de Definition of Done sin marcar) |
| Marcadas `[x]` | 42 |
| Sin marcar `[ ]` | 8 |

Las 8 sin marcar, verificadas una por una contra el código (no contra su propia prosa):

| Tarea | Motivo declarado | Verificado |
|---|---|---|
| F3.2.2b | Componente compartido con F4, pendiente | ✅ cierto — `shared/components/category-filter/` no existe |
| F3.2.2c | Depende de F3.2.2b | ✅ cierto — no hay integración en la barra de filtros |
| F3.4.3 | Mini-mapa Leaflet pendiente, bloque se omite si no hay coords | ✅ cierto — el HTML muestra "Vista de mapa pendiente", no un contenedor Leaflet a medias |
| F3.4.6 | Galería pendiente, endpoint fuera de alcance de F3 | ✅ cierto — placeholder textual, `data-testid="gallery-placeholder"` |
| F3.4.8 | Asignación real pendiente (toast "requiere integración") | ✅ cierto — `onAction('assign')` sólo muestra un toast |
| F3.4.9 | Feedback 2xx/429 depende de F3.4.8 | ✅ cierto — no hay camino de éxito real que probar todavía |
| F3.4.10 | Bloqueado por cambio 316/D1 (backend) | ✅ verificado independientemente: `availableOperators()` en el backend (`incident-workflow.service.ts`) filtra ocupados; no hay forma de que el frontend muestre lo contrario sin ese cambio |
| Definition of Done (detalle completo) | Timeline + comment-thread sí; mapa y galería no | ✅ consistente con lo anterior |

Ninguna de las 8 repite el error de la ronda 3 (justificar con una premisa falsa sobre el
backend) — todas describen gaps reales, verificados independientemente contra el código de
`backend/src/modules/incidents/` y `backend/src/modules/assignments/`.

De las 42 marcadas, se auditaron con atención especial las 5 re-marcadas en esta ronda
(F3.1.3, F3.2.2, F3.2.6, F3.2.9, F3.4.7, F3.6.3) más una búsqueda activa de
`TODO|pendiente|stub|placeholder|no-op|not implemented` sobre todos los archivos tocados. No
apareció ningún stub nuevo sin declarar. La única casilla marcada que no se sostiene del todo
es **F3.4.7** ("Tests cubren... release con éxito y release con error"): los tests existen y
pasan, pero prueban contra un mock que no refleja el contrato real del backend (ver C2 arriba)
— la casilla no miente sobre la existencia del test, pero sí sobre su valor como red de
regresión.

---

### Correctness (Static — Structural Evidence)

| Requirement (spec.md) | Status | Notas |
|---|---|---|
| Listado con filtros combinables | ⚠️ Parcial, spec desalineado | Código honesto (sólo `status`); el documento de spec sigue describiendo `search`+`priority`+conteo `1-10 de 14` como si existieran — ver WARNING 1 |
| Filtro por categoría y subcategoría | ❌ No implementado | F3.2.2b/c, declarado pendiente, correcto |
| Fila de incidencia | ✅ Implementado | Sin cambios desde ronda 3 |
| Detalle de incidencia | ⚠️ Parcial | Mapa/galería placeholders declarados; historial y datos base ok |
| Acciones de flujo de trabajo | ⚠️ Parcial — regresión de datos en `release` | `claim`/`resolve`/`close` correctos (usan `PATCH /status`, que sí devuelve el `IncidentRow` completo); `release` funciona pero corrompe el signal `incident` (ver CRITICAL) |
| Hilo de comentarios | ✅ Implementado | Sin cambios desde ronda 3 |
| Tarjetas de contexto | ✅ Implementado | Sin cambios desde ronda 3 |

---

## Issues Found

### CRITICAL (must fix before archive)

**C2 (reabierto) — `releaseIncident()` declara el tipo de respuesta incorrecto; pisa el signal `incident` con un objeto de 7 campos y corrompe la UI del detalle tras un release exitoso.**

- `frontend/src/app/core/services/incident.service.ts:118` — `releaseIncident(id: string):
  Observable<Incident>` debería ser `Observable<ClaimReleaseResponseDto>` (o un tipo local
  equivalente de 7 campos), no `Incident`.
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts:171` —
  `this.incident.set(released)` no puede reemplazar el signal completo con la respuesta slim.
  Alternativas honestas: (a) hacer merge (`this.incident.update(cur => ({ ...cur!, ...released
  })`) proyectando sólo los 7 campos que realmente cambian, o (b) ignorar el payload de
  `release` y recargar la incidencia completa con `getIncident(id)` tras el éxito — el mismo
  patrón que ya usa el camino de error (línea 182).
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts:238` —
  el mock `released: Incident = {...}` debe reflejar el shape real de 7 campos
  (`ClaimReleaseResponseDto`), no un `Incident` completo, para que el test hubiera atrapado
  esto.
- Falta un test en `incident.service.spec.ts` para `releaseIncident` — mínimo: URL, método
  POST, body vacío, y que el `Observable` no asuma campos que el backend no manda.

### WARNING (should fix)

**W1 — `specs/frontend-incidents/spec.md` no se actualizó para el alcance reducido de C1.**
Los escenarios "Filtros combinados" (estado+prioridad), "Búsqueda por texto" y "Conteo"
(`Mostrando 1-10 de 14 incidencias`) describen capacidades que el código ya no tiene
(prioridad retirada, búsqueda no llega al backend, formato de conteo cambiado a `N de N`).
`tasks.md`/`apply-progress.md` son honestos sobre el recorte; el spec, que es la fuente de
verdad formal del contrato de F3, no lo es. Antes de archivar, actualizar estos tres
escenarios (o anotarlos explícitamente como "capacidad diferida, ver C1 ronda 4") para que el
spec no le mienta a un lector futuro.

**W2 — El gate de permisos de `release`/`claim`/`resolve` en `workflow.util.ts` no coincide con el permiso real que el backend exige para `release` — un rol legítimo queda sin poder usarlo.**
`frontend/src/app/features/incidents/workflow.util.ts:49,64,70` condiciona `claim`, `release` y
`resolve` a `permissions.includes('UPDATE incidents')`. Pero el backend
(`incident-workflow.controller.ts:34-51`) exige `CLAIM incidents` / `RELEASE incidents`
específicamente — permisos distintos, seedeados en `database/migrations/0019_incident_claim.sql`.
Verificado contra los seeds de roles (`database/migrations/0015_organizations_scoping.sql:79-86`):
el rol `operador_sistema` recibe **sólo `READ incidents`** en su seed base — nunca `UPDATE
incidents` — y luego `0019` le agrega `CLAIM incidents` y `RELEASE incidents`. Resultado: un
usuario `operador_sistema` tiene el permiso de backend para reclamar/liberar/resolver
incidencias, pero el frontend nunca le muestra los botones, porque el gate mira el permiso
equivocado. Esto es previo a la ronda 4 (vive en F3.3.1, ronda 1, ya dado por `[x]` HECHO en
rondas anteriores) y no es una regresión de este round, pero queda expuesto por el trabajo de
C2: la afirmación "release cerró el no-op" sólo es cierta para `operador_org`, no para
`operador_sistema`. Recomendado documentarlo como deuda antes de archivar, o corregir el gate
a `permissions.includes('CLAIM incidents')` / `'RELEASE incidents'` respectivamente.

**W3 — `searchCtrl` queda declarado y con un pipeline `debounceTime`/`distinctUntilChanged` activo (`incident-list.component.ts:86,141-147`) pero sin ningún `<input>` en el template que lo alimente.**
No es engañoso para el usuario (no hay control visible), pero es una trampa de mantenimiento:
un desarrollador futuro podría reconectar un `<input formControl="searchCtrl">` asumiendo que
ya filtra el listado, sin notar que el `subscribe` no hace nada (`// No llamamos a
navigateWithFilters ni a fetch`, línea 145-147). Sugerido: o quitar el `FormControl` hasta que
el backend soporte `search`, o dejar un comentario más visible en el propio `subscribe` (ya
existe, pero es fácil de pasar por alto).

### SUGGESTION (nice to have)

**S1** — Agregar a `incident.service.spec.ts` un test de `releaseIncident` que afirme sobre el
shape real de la respuesta (siguiendo el mismo estilo que el test de C1: aserciones positivas
Y negativas sobre qué campos llegan), para que quede como red de regresión permanente del
defecto de C2 reabierto.

---

## Coherence (Design)

| Decisión | ¿Se siguió? | Notas |
|---|---|---|
| D1 — afirmar sobre campos mapeados, no sobre la URL | ⚠️ Violada en `release` | Cumplida en `getIncidents`/`getIncident`/`updateIncidentStatus`; incumplida en `releaseIncident` (ver CRITICAL) |
| D2 — filtros en query params | ✅ Sí | Reducido honestamente a `status` |
| D8 — guion en vez de cero | ✅ Sí | Sin cambios |
| "No parchear el backend desde el frontend" (regla del builder, invocada para C1) | ✅ Aplicada correctamente | — |

---

## Historial del patrón

| Ronda | Resultado | Defecto central |
|---|---|---|
| 1 | FAIL | `uploadCommentImage` stub + `apply-progress.md` certificando que estaba bien |
| 2 | PASS-WITH-WARNINGS | Cerró de verdad |
| 3 | FAIL, 3 CRITICAL | Filtros/paginación decorativos, `release` no-op, e2e/autorización inexistente |
| **4** | **FAIL, 1 CRITICAL** | C1 y C3 cerraron honestamente; C2 cambió de forma (de "no-op" a "tipo de respuesta incorrecto que corrompe datos en producción") sin que nadie lo verificara campo por campo, pese a que el propio fix invoca "el mismo patrón que claim/resolve/close" sin comprobar que esos tres SÍ devuelven el `IncidentRow` completo y `release` NO. |

El patrón de "certificar como hecho lo que no lo está" no se repitió en su forma más grave
(ninguna casilla afirma un test que no existe, ningún apply-progress miente sobre algo
comprobable con un `grep`). Pero sí se repitió en una forma más sutil: un test que pasa contra
un mock que no refleja el contrato real, lo cual es functionally equivalente a certificar como
probado algo que no lo está — sólo que esta vez el error está en la fixture del test, no en la
prosa del progress report.

---

## Veredicto sobre archivo

**No está listo para archivar.** Queda 1 CRITICAL abierto (release corrompe datos del detalle
tras éxito) que es responsabilidad directa de este change (no es un defecto de backend a
escalar — es un mapeo de tipos mal hecho en el frontend, corregible sin tocar el backend).

Las 8 casillas sin marcar son **cierre honesto de alcance**, no archivado prematuro: cada una
documenta con precisión verificable por qué queda pendiente y de qué depende (F2, F4, cambio
316/D1, o "no es bloqueante para F3 per el spec"). Estas SÍ podrían archivarse como deuda
declarada si el CRITICAL no existiera.

**Deuda a registrar explícitamente antes o al momento de archivar** (más allá del CRITICAL):
1. W1 — actualizar o anotar `spec.md` para que no describa capacidades de filtro/paginación
   que el código no tiene.
2. W2 — el gate de permisos de `release`/`claim`/`resolve` usa `UPDATE incidents` en vez de
   los permisos específicos (`CLAIM`/`RELEASE incidents`) que el backend exige; afecta al rol
   `operador_sistema`. No es de esta ronda, pero quedó expuesto por ella.
3. Los 8 ítems de scope reducido/pendiente ya documentados (F3.2.2b/c, F3.4.3, F3.4.6,
   F3.4.8/9/10) — siguen siendo deuda válida, no bloqueante.

---

## Estado de gates — comparación de rondas

| Gate | Ronda 3 | Ronda 4 |
|---|---|---|
| Suites | 41 | 41 |
| Tests | 286 | 290 |
| `pnpm run build` | exit 0 | exit 0 |
| `tsc -b --noEmit` | 19 errores preexistentes (declarado) | 14 errores preexistentes (verificado en vivo, sin regresión — la diferencia de conteo entre rondas es de reportes previos, no de esta auditoría; ver nota) |

Nota sobre el conteo de `tsc`: esta auditoría contó 14 errores reales al ejecutar
`npx tsc -b --noEmit` en este momento, sobre los mismos 5 archivos que el reporte de ronda 3
identificaba como la fuente del gap de `@types/node` + un mismatch de tipos en
`auth.service.spec.ts` — no hay indicio de que haya cambiado nada relacionado a F3. La cifra de
"19" reportada en `tasks.md:F3.6.5` (ronda 3) no se pudo reconciliar exactamente con lo
observado en esta sesión, pero como ningún archivo de F3 aparece en la lista de errores, no se
considera una regresión de este change.

---

## Verdict

**FAIL** (1 CRITICAL abierto). C1 y C3 de la ronda 3 cerraron honestamente. C2 cambió de "no-op
declarado" a "corrupción de datos silenciosa por tipo de respuesta incorrecto" — el mismo tipo
de defecto que ya había costado una ronda completa en este mismo change, en el mismo tipo de
llamada (una acción de flujo de trabajo del detalle). Requiere una ronda 5 acotada: corregir el
tipo de `releaseIncident()`, el manejo en el componente, y el mock del test — no requiere
revisitar C1 ni C3.
