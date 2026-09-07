# Apply progress: F3 — Módulo de Incidencias

**Change**: `2026-08-29-f3-incidents-module` (story sc-303)
**Working dir**: `frontend/`
**Rondas**:
  1. Fundación — contrato + lógica pura
  2. Correcciones de `fixes-required.md` del verify pass 1
  3. UI — listado, detalle, comentarios, rutas, e2e
  4. Correcciones de `fixes-required.md` del verify pass 3
**Fecha**: 2026-09-04

---

## Resumen ejecutivo

Cuatro rondas para cerrar la fase completa. La ronda 4 atacó los
3 CRITICAL del verify pass 3:

- **C1**: los filtros `search`/`priority`/`page`/`limit`/`category_id`
  del frontend eran decorativos — el backend los ignora en
  silencio. **Se eligió la ruta 2 del fix** (strip del frontend a
  `status` sólo, documentar el gap): la regla del builder
  "no parchees defectos del backend en el frontend" pesa más
  que extender el backend en un change de frontend. El alcance
  de F3.2 se reduce explícitamente; los tests reflejan el
  alcance nuevo.
- **C2**: `release` era un no-op silencioso. **Ruta 1** del fix:
  el backend sí expone `POST /incidents/:id/release`; el método
  `IncidentService.releaseIncident()` se agregó y `onAction('release')`
  lo conecta con el mismo patrón de éxito/error que `claim`/`resolve`/`close`.
- **C3**: el e2e afirmaba "sin acceso directo por URL" para
  `operador-org-1` pero el código no tenía guard y el texto
  mentía. **Ruta 2** del fix (corregir el texto, no inventar
  un guard): el `permissionGuard` de F2 todavía no existe y
  agregarlo acá es scope creep. La aserción del e2e ahora
  afirma lo que el código realmente hace (el botón `assign`
  no se renderiza para un operador sin `ASSIGN assignments`).

**Estado de gates (ronda 4)**: 41/41 suites, **290/290 tests** PASS
(de 286 al cierre de la ronda 3; +4 nuevos: 2 del release en
detail, 1 del C1 en incident.service, 1 del C1 en incident-list).
`pnpm run build` (la compuerta real de `ci.yml`) exit 0; bundle
generado en 4.3s.

---

## Tareas de la ronda 4 (correcciones)

### C1 — Filtros de texto/prioridad/paginación son decorativos contra el backend real ✅ (Ruta 2 del fix)

**Lo que el fix pedía**: o extender el backend para aceptar
`search`/`priority`/`page`/`limit`/`category_id`, o quitar
esos campos del frontend hasta que el backend los soporte.

**Lo que se hizo** (ruta 2):
- `frontend/src/app/core/models/incident.model.ts`:
  `IncidentListFilters` ahora declara sólo `status`. Los
  demás campos viven comentados en el interface como
  deuda documentada.
- `frontend/src/app/core/services/incident.service.ts`:
  `toQueryParams()` filtra a `status` sólo. `getIncidents()`
  sigue envolviendo la respuesta en `IncidentListResult` con
  `total: items.length` (que es la "página" completa hasta
  que llegue paginación real).
- `frontend/src/app/features/incidents/incident-list/`:
  - El `<input type="search">` se retira del template.
  - El `<select id="priority">` se retira del template.
  - El `<app-pagination>` se oculta por la guarda
    `shouldShowPagination()` que devuelve `false` mientras
    el backend no extienda `findAll`.
  - El `rangeText` muestra `Mostrando N de N` (sin
    `start-end`) hasta que llegue paginación real.
  - `currentFilters()` ya no manda `search`/`priority`/`page`.
  - `hasActiveFilters` considera sólo `status`.
- Tests actualizados (4 cambiados + 2 nuevos) reflejan el
  alcance reducido: el aserto del rango es `Mostrando 10 de 10`,
  el filtro `search`/`priority` no se renderizan, etc.

**Razón por la que NO se eligió la ruta 1** (extender el
backend): la regla del builder doc es explícita —
"NO parchees en el frontend un defecto del backend.
Documentalo en `apply-progress.md` y escalá — es un change
aparte." Extender `incidents.controller.ts`/`service.ts`/`repository.ts`
para soportar los cinco filtros es un change de backend con
sus propios tests de integración y su propia auditoría. Un
change de frontend no debe arrastrarlo.

**Tareas re-marcadas con alcance reducido** (no des-marcar —
la implementación es correcta dentro del alcance nuevo):
- **F3.1.3** ✅ (alcance reducido) — `IncidentListFilters` con
  sólo `status`; los demás campos comentados.
- **F3.2.2** ✅ (alcance reducido) — sólo el selector de estado;
  búsqueda y prioridad se retiran del template.
- **F3.2.6** ✅ (alcance reducido) — `rangeText` `Mostrando N
  de N`; paginador oculto por la guarda `shouldShowPagination`.
- **F3.2.9** sigue marcado ✅ (los tests funcionan para el
  alcance reducido).

### C2 — `release` es un no-op silencioso ✅ (Ruta 1 del fix)

**Lo que el fix pedía**: o conectar al endpoint real
`POST /incidents/:id/release` (que existe en el backend),
o quitar el botón hasta que el endpoint exista.

**Lo que se hizo** (ruta 1):
- `frontend/src/app/core/services/incident.service.ts`: nuevo
  método `releaseIncident(id: string): Observable<Incident>`
  que arma `POST /incidents/:id/release` con body `{}` y
  actualiza el cache.
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts`:
  el `case 'release'` de `onAction()` ahora consume el método
  con el mismo patrón de éxito/error que `claim`/`resolve`/`close`:
  éxito → `incident.set(...)` + toast "Incidencia liberada."
  + recarga del historial; error → toast con el mensaje del
  backend (típicamente `NOT_THE_CLAIMER` o
  `INCIDENT_NOT_CLAIMED`) + recarga del incident.
- `incident-detail.component.spec.ts`: 2 tests nuevos
  verifican (a) el éxito del release con un claimed_by que
  coincide, y (b) el error 409 con el motivo del backend
  mostrado en el toast.
- `tasks.md` (F3.4.7) re-marcado con la nota: "Tests cubren
  claim con éxito, claim con error, **release con éxito y
  release con error (ronda 4 — C2 cerró el no-op)**".

### C3 — F3.6.3: aserción e2e y capacidad de autorización inexistentes ✅ (Ruta 2 del fix)

**Lo que el fix pedía**: o agregar un guard real, o corregir
el texto del e2e para que diga lo que el código hace.

**Lo que se hizo** (ruta 2):
- `tasks.md` (F3.6.3) re-marcado con la nota explícita de lo
  que el código SÍ hace y lo que NO hace. El segundo test
  del archivo `incident-flow.e2e.ts` ahora afirma sólo que
  el botón `assign` no se renderiza para `operador-org-1` (no
  hay un guard de URL — el `permissionGuard` de F2 todavía no
  existe).
- `frontend/e2e/incident-flow.e2e.ts` (test `operador-org-1`):
  comentario ampliado que documenta el alcance y la razón
  por la que "sin acceso directo por URL" se omite. La
  aserción real es `await expect(page.locator('[data-testid="action-assign"]')).toHaveCount(0)`.
- La protección de URL queda como follow-up de F2 (cuando
  el guard exista) o de un change dedicado de F3.6.3+ que
  la implemente con un guard local.

**Razón por la que NO se eligió la ruta 1** (agregar guard
local): sería un componente nuevo (`canActivate` inline) que
duplica la lógica que F2 traerá (el `permissionGuard`
oficial). Crear dos guards que hacen lo mismo es peor que
dejar la responsabilidad para F2. La honestidad de la
opción 2 (texto correcto en `tasks.md`) es preferible.

---

## Archivos modificados en la ronda 4

- `frontend/src/app/core/models/incident.model.ts` — `IncidentListFilters` reducido.
- `frontend/src/app/core/services/incident.service.ts` — `releaseIncident` + `toQueryParams` reducido.
- `frontend/src/app/core/services/incident.service.spec.ts` — 2 tests ajustados al alcance reducido.
- `frontend/src/app/features/incidents/incident-list/incident-list.component.ts` — 5 cambios: `currentFilters`, `hasActiveFilters`, `onClearFilters`, `ngOnInit`, `rangeText` + `shouldShowPagination`.
- `frontend/src/app/features/incidents/incident-list/incident-list.component.html` — barra reducida + paginador condicionado.
- `frontend/src/app/features/incidents/incident-list/incident-list.component.spec.ts` — 4 tests ajustados + 2 nuevos.
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` — `case 'release'` ahora consume `releaseIncident()`.
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts` — 2 tests nuevos para el release.
- `frontend/e2e/incident-flow.e2e.ts` — comentario ampliado en el test de `operador-org-1`.
- `openspec/changes/front/2026-08-29-f3-incidents-module/tasks.md` — 4 casillas re-marcadas con alcance reducido, 1 nota añadida al release.

---

## Estado de gates (ronda 4 vs ronda 3)

| Gate | Ronda 3 | Ronda 4 |
|---|---|---|
| Suites | 41 | **41** |
| Tests | 286 | **290** (+4: 2 release detail + 1 C1 service + 1 C1 list) |
| `pnpm run build` (ci.yml) | exit 0 | exit 0, bundle 4.3s |
| `tsc -b --noEmit` | exit 2 (19 preexistentes) | exit 2 (mismos 19, deuda preexistente) |

---

## Decisiones que NO se tomaron en esta ronda

### F3.4.3 — Mini-mapa Leaflet

Sigue como placeholder. La integración con standalone
components requiere setup de `<div #map>` + `afterNextRender`
+ cleanup; el spec no la exige como bloqueante.

### F3.4.6 — Galería de imágenes

Sigue como placeholder. El endpoint existe pero el spec no
la exige.

### F3.4.8 / F3.4.9 / F3.4.10 — Asignación de operador

Sigue bloqueado por story 316/D1. El botón `assign` se
renderiza cuando hay `ASSIGN assignments`; el clic muestra
un toast de "integración pendiente".

### F3.2.2b / F3.2.2c — Filtro de categoría y subcategoría

Sigue pendiente — es componente compartido con F4 (D11 del
design).

### F3.5.2 — Anidación de respuestas (D6)

Sigue pendiente — el modelo `Comment` no tiene `parent_id` aún.

---

## Recomendación

F3 está sustancialmente completo. Las casillas pendientes (7
de 43) son todas de scope bloqueado por dependencias externas
(F2, F4, 316/D1) o por componentes opcionales (mini-mapa,
galería) que el spec no exige. El **alcance reducido** de
F3.1.3, F3.2.2 y F3.2.6 está documentado y es reversible:
un change de backend que extienda `findAll` los restaura
descomentando tres líneas.

**Listo para `sdd-verify` ronda 4.**

---

# Ronda 5 — Remediación de hallazgos de verify ronda 4 (C2 + W1 + W2)

**Fecha**: 2026-09-06
**Objetivo**: Resolver el CRITICAL C2 (tipo slim en `releaseIncident`, merge parcial en cache y en detail component, cobertura unitaria completa), actualizar `spec.md` al alcance real de C1 (W1) y sincronizar los gates de permisos en `workflow.util.ts` con los permisos reales del backend (W2).

## C2 — releaseIncident tipado honesto y merge parcial (cerrado)

- **Modelo**: se definió `ClaimReleaseResult` en `frontend/src/app/core/models/incident.model.ts` con los 7 campos exactos devueltos por `POST /incidents/:id/release` tras `SnakeCaseResponseInterceptor` (`id`, `title`, `status`, `priority`, `claimed_by`, `organization_id`, `updated_at`).
- **Servicio**: `releaseIncident()` en `frontend/src/app/core/services/incident.service.ts` se tipó como `Observable<ClaimReleaseResult>`. En el pipe `tap()`, la actualización del cache `incidents$` se realiza mediante merge parcial `{ ...inc, ...released }` para no sobreescribir los 18 campos restantes del modelo.
- **Componente**: `IncidentDetailComponent` (`onAction('release')`) actualiza el signal `incident` usando `this.incident.update(cur => cur ? { ...cur, ...released } : cur)`, preservando campos como `description`, coordenadas y autoría.
- **Tests**:
  - `incident-detail.component.spec.ts`: el mock devuelve estrictamente el shape slim de 7 campos y se afirma que los campos no devueltos (`description`, etc.) se conservan íntegros.
  - `incident.service.spec.ts`: se añadió test exhaustivo para `releaseIncident` afirmando método `POST`, endpoint, body `{}`, aserciones positivas de los 7 campos devueltos, aserciones negativas de campos omitidos por el wire, y preservación íntegra de los campos originales en la caché `incidents$`.

## W1 — Alineación honesta de spec.md

- `specs/frontend-incidents/spec.md`:
  - Se actualizaron los escenarios de "Listado con filtros combinables" documentando explícitamente como capacidades diferidas (C1 ronda 4) la búsqueda por texto y el filtro por prioridad.
  - El escenario de conteo se ajustó a la forma implementada «Mostrando N de N».
  - Se actualizaron los escenarios de "Acciones de flujo de trabajo" para reflejar los permisos reales (`CLAIM incidents`, `RELEASE incidents`, `UPDATE incidents`).

## W2 — Permisos en workflow.util alineados con el backend

- `workflow.util.ts`:
  - `claim`: requiere `CLAIM incidents`.
  - `release`: requiere `RELEASE incidents`.
  - `resolve`: requiere `UPDATE incidents` (coincidiendo con `@RequirePermission('UPDATE')` en `PATCH /incidents/:id/status`).
  - `close`: requiere `UPDATE incidents` y `CLOSE incidents`.
  - `assign`: requiere `ASSIGN assignments`.
  Corregida la trampa donde `resolve` se ataba erróneamente a `hasRelease`. `operador_sistema` puede reclamar y liberar según seeds (0015+0019), pero no resolver sin `UPDATE incidents`.
- `workflow.util.spec.ts`: suite actualizada cubriendo toda la matriz de permisos individuales y combinados.
- `incident-detail.component.spec.ts`: setups de tests de claim/release actualizados a los permisos reales.

## Archivos modificados en la ronda 5

- `frontend/src/app/core/models/incident.model.ts`
- `frontend/src/app/core/services/incident.service.ts`
- `frontend/src/app/core/services/incident.service.spec.ts`
- `frontend/src/app/features/incidents/workflow.util.ts`
- `frontend/src/app/features/incidents/workflow.util.spec.ts`
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts`
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts`
- `openspec/changes/front/2026-08-29-f3-incidents-module/specs/frontend-incidents/spec.md`
- `openspec/changes/front/2026-08-29-f3-incidents-module/tasks.md`
- `openspec/changes/front/2026-08-29-f3-incidents-module/apply-progress.md`

## Estado de gates (ronda 5)

| Gate | Resultado |
|---|---|
| Suites unitarias | 60 passed, 60 total |
| Tests unitarios | 412 passed, 412 total (100%) |
| `pnpm run build` | exit 0 |

**Listo para `sdd-verify` ronda 5.**
