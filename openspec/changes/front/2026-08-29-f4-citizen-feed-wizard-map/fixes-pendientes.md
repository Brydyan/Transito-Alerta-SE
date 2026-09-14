# F4 — Fixes pendientes (deuda de refinamiento post-Slices)

> Registro de correcciones de código, estructura, lógica, linting y presentación
> detectadas tras la verificación del orquestador de los Slices 1–3 de la Fase B
> (F4 — feed ciudadano, asistente de reporte y mapa).
>
> Estado: **abierto** · Verificado: 2026-09-10 · Autor: orquestador (gatekeeper)

---

## Cómo se lee este documento

Cada fix tiene: evidencia (dónde y por qué), impacto, y la corrección propuesta.
Los fixes están agrupados por severidad: **CRÍTICO** (rompe UX/perf o bloquea el
producto), **ALTO** (deuda que ya molesta), **MEDIO** (limpieza/código) y **BAJO**
(estilo/presentación menor). Al implementar un fix, se marca `[x]` y se anota la
referencia del commit/work unit.

---

## CRÍTICO

### FIX-01 — El feed NO pagina: carga todo el listado en una sola llamada
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - `IncidentService.getFeed()` nuevo → `GET /api/incidents/feed` con envelope tipado
    (`IncidentFeedResponse`/`IncidentFeedMeta` en `core/models/incident.model.ts`)
  - `IncidentListFilters` descomentados: `priority`, `page`, `per_page`, `incident_category_id`
    (`search` queda comentado como deuda — el feed endpoint no lo soporta)
  - `FeedComponent`: paginación real `page=1/perPage=10`, `hasMore = meta.page < meta.last_page`,
    `lastPage` mostrado; botón «Cargar más incidencias» con icono de recarga + subtítulo
    «(página X de Y)»; filtro cambio resetea a página 1; suscripción al BehaviorSubject
    retirada (pisotearía la lista concatenada)
  - Spec: 3 tests nuevos (cargar más concatena página 2, botón ausente en última página,
    filtro resetea; stub de `window.fetch` para Nominatim)
  - Gates: build exit 0 (Inicial 591.32 kB, ver FIX-09), tsc exit 0, tests 80/536, lint 0 errores
  - **Regresiones destapadas y corregidas por el gatekeeper**: import fantasma `'geojson'`
    (no era dependencia; reemplazado por `Parameters<typeof L.geoJSON>[0]`) y
    `flattenCategories(node.children)` sin estrechamiento de `undefined`
- **Evidencia**:
  - `frontend/src/app/features/citizen/feed/feed.component.ts:41-57` — `loadIncidents()`
    llama `incidentService.getIncidents(this.filters)` una sola vez y el comentario
    dice literal: *"No pagination supported yet by backend so hasMore is false after load"*.
  - `frontend/src/app/core/services/incident.service.ts:41-61` — `getIncidents()`
    llama a `GET /api/incidents` (lista completa; el backend devuelve hasta 1000 filas),
    **no** al feed paginado.
  - `frontend/src/app/core/models/incident.model.ts:48-58` — deuda documentada de F3:
    el backend de `/api/incidents` solo entiende `status`; `page/limit/category_id`
    están comentados.
  - **El backend SÍ tiene el feed paginado real**: `GET /api/incidents/feed`
    (`incident-feed.service.ts`) con `FeedQueryDto` (`page`, `per_page` default 20,
    cap 500, `status`, `priority`, `incident_category_id`) y envelope
    `{ data, meta: { page, per_page, total, last_page } }`.
  - `frontend/src/app/features/citizen/map/services/map-data.service.ts` ya lo consume
    (`FeedResponse` con `meta`) — el mapa pagina pero el feed no.
- **Impacto**: la tarjeta `incident-card` hace reverse geocoding a Nominatim
  (OpenStreetMap) en `ngOnInit` por cada incidente montado; una carga de cientos de
  registros dispara cientos de llamadas simultáneas → rate-limit/CORS que describe el
  usuario («la API de openstreetmap bloquea el host local»).
- **Corrección propuesta**:
  1. `incident.service.ts` — agregar `getFeed(filters: { page, per_page?, status?,
     priority?, incident_category_id? })` que llame a `GET /api/incidents/feed` y
     devuelva el envelope tipado (reutilizar la interfaz `FeedResponse` que ya existe
     en `map-data.service.ts` o llevarla a `core/models`).
  2. `feed.component.ts` — reemplazar la carga única por paginación real: mantener
     `page`, `hasMore` basado en `meta.last_page`, y **concat** resultados en
     `incidents`.
  3. `feed.component.html` — al llegar al final (cuando `hasMore === true`) mostrar un
     indicador subtitulado con icono de recarga y texto **«Cargar más incidencias»**
     (botón/acción), en lugar del estado «Has visto todas…» solo cuando `hasMore === false`.
  4. Mantener el estado final «Has visto todas las incidencias recientes» cuando
     `hasMore === false` (B.3.6).
- **Atado a**: B.3.5 (carga incremental) — la tarea está marcada `[x]` pero la
  implementación no paginó; es deuda real que la verificación destapó.

### FIX-02 — Reverse geocoding sin límite por tarjeta (rate-limit/CORS de Nominatim)
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - Caché en memoria a nivel módulo `reverseGeocodeCache` (clave `lat,lng` con 5 decimales)
    + dedupe de peticiones en vuelo `inFlightReverseGeocodes`: dos tarjetas con las mismas
    coordenadas comparten UNA sola llamada a Nominatim; repeticiones entre páginas/filtros
    salen de caché sin HTTP
  - Con FIX-01 el volumen ya bajó de 1000 a ≤10 tarjetas por página; el caché elimina el
    resto de repeticiones. No hace falta IntersectionObserver/debounce por ahora.
  - Fallback intacto: si Nominatim falla o rate-limit, `locationName` queda `null` y el
    template muestra las coordenadas crudas vía `@else`
  - Spec: 2 tests nuevos (cache hit en segunda pasada → 1 solo fetch; fallback silencioso
    en error) — seed determinista `FIXED_CREATED_AT` para evitar NG0100 en `relativeAge`
  - Gates: spec 7/7, lint 0 errores, tsc exit 0, build exit 0, suite completa 80/538
- **Evidencia**: `frontend/src/app/features/citizen/feed/components/incident-card/incident-card.component.ts:25-49`
  — `ngOnInit()` hace `window.fetch` a `nominatim.openstreetmap.org/reverse` por cada
  tarjeta. Con el fix FIX-01 (paginación) el volumen baja (20 por página), pero aún así:
  - No hay debounce/caché entre tarjetas (dos incidentes en la misma zona repiten la llamada).
  - No hay límite de concurrentes ni backoff.
  - `fetchLocationName` se dispara aunque la tarjeta esté fuera de viewport.
- **Impacto**: bloqueos del host local por rate-limit de OpenStreetMap; errores CORS.
- **Corrección propuesta**:
  1. Cache en memoria por `(lat,lng)` (Map simple a nivel de servicio/componte) —
     tarjetas repetidas no repiten HTTP.
  2. Opcional: `IntersectionObserver` para geocodear solo tarjetas visibles (o al menos
     con un pequeño debounce).
  3. Opcional: fallback que muestre coordenadas crudas si falla y no deje la tarjeta
     sin dato visible.

---

## ALTO

### FIX-03 — Lint: 1 error + warnings nuevos en módulos F4
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - `map.component.ts:174` `catch (e)` → `catch {` (optional catch binding)
  - `activeFilters: any` → `MapActiveFilters` (exportado desde `map-data.service.ts`)
  - `L.geoJSON(z.polygon as any)` → `GeoZonePolygon = IGeoJsonPolygon | IGeoJsonMultiPolygon` + `as unknown as GeoJsonObject` (sin `as any`)
  - `map-filters.component.ts`: `EventEmitter<MapActiveFilters>` + `cleanFilters: MapActiveFilters`
  - `citizen-report.component.ts`: `get<IncidentCategoryTreeNode[]>` + `flattenCategories(nodes: IncidentCategoryTreeNode[])`
  - Specs: mocks tipados `{ method: jest.Mock }` (5 archivos)
  - Gates: lint 0 errores (73 warnings preexistentes fuera de F4), tsc exit 0, tests 80/533 PASS
- **Evidencia** (`pnpm lint` desde `frontend/`, 2026-09-10):
  - `map.component.ts:174:20` — **error** `'e' is defined but never used`
    (`@typescript-eslint/no-unused-vars`): `catch (e)` que no usa `e`.
  - Warnings `no-explicit-any` en archivos F4 (nuevos, suman vs 65 base):
    - `map.component.ts:45:18`, `115:50`
    - `map-filters.component.ts:14:46`
    - `citizen-report.component.ts:57:26`
    - specs: `feed-filters.component.spec.ts:9:28`, `incident-card.component.spec.ts:11:26`,
      `feed.component.spec.ts:16:28`, `map-picker.component.spec.ts:9:31`
- **Impacto**: el error rompe `pnpm lint` (exit 1). Más `any` = menos contrato tipado.
- **Corrección propuesta**:
  - `map.component.ts:174` — cambiar `catch (e)` por `catch {` (optional catch binding) o
    renombrar/eliminar. El log interno puede omitir la variable.
  - Tipar los `any`: `activeFilters` como interfaz de filtros; `geom` como
    `IGeoJsonPoint`/`unknown` con guard de tipo; evitar `as any` en `L.geoJSON`
    (úsese el tipado `IGeoJsonPolygon | IGeoJsonMultiPolygon` de D12).
  - Specs: tipar el `mockIncident` con `Incident` completo o `Partial` cast consciente.

### FIX-11 — Refactor Angular 21: control flow legacy (`*ngIf`/`*ngFor`/`ng-template`) en el módulo citizen
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - 6 plantillas migradas a `@if/@for` con `track` explícito (incident.id, cat.id, s.value, p.value, node.category.id, $index para arrays primitivos)
  - Recursión D11: `ng-template #nodeTemplate` reemplazado por componente standalone `category-tree-node.component.{ts,html}` (`app-category-tree-node`, `@Input nodes/depth`, `@Output nodeToggled`, `CategoryNode` tipado con `IIncidentCategory`, `export type` para evitar circular dep con isolatedModules)
  - `feed-filters.component.ts`: imports + `CategoryTreeNodeComponent`
  - Gates: grep control-flow legacy CLEAN, tsc exit 0, tests 80/533, lint 0 errores/0 warnings F4
- **Evidencia**:
  - `frontend/package.json`: `@angular/core`, `@angular/common`, `@angular/compiler`
    todos en **`^21.2.0`**.
  - El módulo citizen + `citizen-report` + `map-picker` usan `*ngIf` (25 ocurrencias)
    y `*ngFor` (8) en 6 plantillas — directivas estructurales en modo legacy, que desde
    Angular 17+ ya tienen reemplazo nativo por el **control flow sintáctico**
    (`@if` / `@for` / `@else`), recomendado como estándar en v20/v21.
  - El mapa (`map.component.html:24`) **ya usa `@if`** — convivencia de ambos estilos en
    el mismo módulo, evidencia de que la migración quedó a medias.
- **Ocurrencias** (sin specs):
  | Archivo | `*ngIf` | `*ngFor` | `ng-template`/`*ngTemplateOutlet` |
  |---|---|---|---|
  | `FEATURES/citizen/feed/components/incident-card/incident-card.component.html` | 9 | 0 | 0 |
  | `FEATURES/citizen-report/citizen-report.component.html` | 12 | 0 | 0 |
  | `FEATURES/citizen/feed/feed.component.html` | 3 | 1 | 0 |
  | `FEATURES/citizen/feed/components/feed-filters/feed-filters.component.html` | 1 | 2 | 4 (2× `#nodeTemplate` + 2× `*ngTemplateOutlet`, recursion línea 25/30/43/46) |
  | `FEATURES/citizen/map/components/map-filters/map-filters.component.html` | 1 | 3 | 0 |
  | `FEATURES/citizen/map/map.component.html` | 1 | 0 | 0 |
  | `FEATURES/shared/components/map-picker/*` | 0 | 0 | 0 (ya limpio) |
  **Total: 25 `*ngIf` + 8 `*ngFor` + 4 `ng-template`/`*ngTemplateOutlet`** en 6 plantillas.
  No hay `*ngSwitch`/`*ngSwitchCase`, `[ngIf]`/`[ngFor]` sin asterisco, ni `| async`
  en el módulo (verificado 2026-09-10). `ngClass`/`ngStyle` NO son control flow
  legacy (siguen soportados en v21) — quedan fuera de este fix.
- **Impacto**: deuda de modernidad; el proyecto declara Angular 21 pero escribe como si
  fuera Angular 12. Menor rendimiento (el control flow nuevo compila a un AST propio,
  más rápido y con mejor type-checking de `@for`), inconsistencia de estilo.
- **Corrección propuesta**:
  1. Migrar `*ngIf` → `@if (cond) { ... }` (+ `@else` donde aplique), preservando el
     mismo HTML/atributos.
  2. Migrar `*ngFor="let x of xs"` → `@for (x of xs; track x.id)` — **OBLIGATORIO**
     aportar `track` (por ejemplo `track incident.id`, `track s.value`, `track cat.id`,
     `track node.key`) para el diffing correcto y silenciar el warning de migración.
  3. En `incident-card`, `*ngFor` no aplica; hay **9 `*ngIf`** que deben migrar sobre
     SVGs, `<p>` y `<span>` — el `track` no aplica ahí; solo el techo de control flow.
  4. **Recursión del árbol de categorías (D11)** en `feed-filters.component.html`:
     las 4 ocurrencias `ng-template #nodeTemplate` + `*ngTemplateOutlet` (líneas
     25/30/43/46) son el patrón legacy para plantillas recursivas. El control flow
     sintáctico (`@if/@for`) **no soporta recursión directa sobre `ng-template`**:
     extraer un componente recursivo `category-tree-node` (o usar
     `@for` + `<ng-template>` interna NO basta; el control flow necesita un
     componente standalone con `@Input` para recursar). Diseño de migración:
     `feed-filters` mantiene el `@for` raíz (`@for (node of nodes; track node.id)`,
     `@if (node.children.length)`), y cada nivel delega en un componente hijo
     `category-tree-node[categoryNodes]` que a su vez renderiza `@for` sobre sus
     hijos. Esto elimina `ng-template`/`*ngTemplateOutlet` del árbol.
  4. Ajustar specs si alguna aserta sobre el DOM condicional (el output debe ser igual).
  5. Correr `ng generate @angular/core:control-flow` como borrador si se prefiere, pero
     la migración manual es acotada (6 archivos, 37 ocurrencias) y permite el `track`
     explícito.
- **Verificación**: `pnpm test` + `pnpm run build` + `npx tsc --noEmit` + `pnpm lint`;
  `grep -rn '\*ngIf\|\*ngFor\|\*ngSwitch\|ngSwitchCase\|\*ngTemplateOutlet\|\[ngIf\]\|\[ngFor\]' features/citizen features/citizen-report` debe dar 0
  (excepto si queda alguna plantilla fuera de alcance documentada).

### FIX-04 — Mapa: `IGeoZone.polygon` sin tipar, `as any` en `L.geoJSON` (D12)
- **Estado**: `[x]` resuelto de facto — 2026-09-10 (resuelto por FIX-03, sin work unit propio)
  - La interfaz ya está tipada (`igeo-zone.interface.ts:36` → `polygon?: IGeoJsonPolygon | IGeoJsonMultiPolygon`)
  - El `as any` de `map.component.ts` ya no existe: FIX-03 introdujo
    `GeoZonePolygon = IGeoJsonPolygon | IGeoJsonMultiPolygon` y el cast
    `as unknown as Parameters<typeof L.geoJSON>[0]` (deriva el tipo exacto de
    la firma de Leaflet sin dependencia fantasma ni namespace global)
  - Gates: spec mapa 3/3, suite completa 80/538, tsc exit 0, lint 0 errores

---

## MEDIO

### FIX-05 — Mapa: mutación del `geom` del modelo dentro del componente
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - `map.component.ts` ya NO muta `inc.geom`: nuevo helper puro `parseGeom()` que
    parsea la cadena GeoJSON y devuelve coordenadas derivadas `{ type, coordinates }` o `null`
    (malformado → fallback), dejando el modelo `Incident` intacto para otros consumidores
  - `getMarkerPosition()` resuelve `[lat, lng]`: geom parseado si es válido
    (invierte [lng,lat] → [lat,lng]), si no `inc.lat/inc.lng`, si no `null` (filtrado)
  - `updateIncidentMarkers()` mapea `{ inc, position }`, filtra los `null` y
    construye markers sin side-effects sobre el estado
  - Gates: spec mapa 3/3, tsc exit 0, suite completa 80/538

### FIX-06 — Mapa: `console.error/warn` sin sanitizar en producción
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - `map.component.ts` ya no vuelca objetos crudos: `console.error('Error loading zones:', err?.message ?? 'unknown')`
    y `console.error('Error loading incidents:', err?.message ?? 'unknown')`
  - El `console.warn('Failed to parse geom string', inc.geom)` desapareció: los geom
    malformados se manejan silenciosamente vía `parseGeom()` → `null` → fallback lat/lng
  - Gates: spec mapa 3/3, lint 0 errores, tsc exit 0, suite completa 80/538

### FIX-07 — MapDataService: duplicación de `FeedResponse` entre feature y core
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - `map-data.service.ts` ya no define `FeedResponse`: importa y usa directamente
    `IncidentFeedResponse` de `core/models/incident.model.ts` (mismo envelope que
    usa `IncidentService.getFeed()` del feed)
  - Re-export de compatibilidad: `export type { IncidentFeedResponse as FeedResponse }`
    para no romper importaciones existentes
  - Import `Incident` huérfano eliminado por lint
  - Gates: lint 0 errores, tsc exit 0, suite completa 80/538

---

## BAJO

### FIX-08 — HTML: indentación rota en el bloque `@if` del mapa
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
- **Evidencia**: `map.component.html:24-36` — el contenido de `@if (displayedCount === 0)`
  estaba a nivel 0; reindentado a nivel 2 (dentro del div contenedor). Spec del mapa 3/3 PASS.`
- **Corrección propuesta**: reindentar el bloque `@if` (verbo pedido por el usuario:
  «presentación frontend»).

### FIX-09 — Mapa: budget del bundle excede el máximo
- **Estado**: `[x]` resuelto de facto — 2026-09-10
  - Tras FIX-11 (control flow) + FIX-01 (paginación), `Initial total 591.32 kB` < máximo
    600 kB. No hace falta tocar `angular.json`; el warning desapareció solo. Si el
    bundle vuelve a superarlo más adelante, evaluar lazy-load de la ruta `/mapa`.
- **Evidencia**: `pnpm run build` → *"bundle initial exceeded maximum budget. Budget
  600.00 kB was not met by 1.56 kB with a total of 601.56 kB"* (2026-09-10).
- **Impacto**: warning de build; seguirá creciendo con el mapa/Leaflet.
- **Corrección propuesta**: decidir si se sube el umbral conscientemente (con
  justificación en `angular.json`) o se baja el peso (p.ej. `leaflet`/`markercluster`
  fuera del initial chunk vía lazy-load de la ruta). NO silenciar el warning sin
  decisión.

### FIX-10 — Feed: `getDailyStats()` recalcula en cada detección de cambio
- **Estado**: `[x]` resuelto — 2026-09-10 (work unit sin commit aún)
  - `feed.component.ts`: `dailyStatsCache` memoiza el resultado; invalidación en los
    dos únicos puntos donde `incidents` se reasigna (`loadIncidents` reset y `next`)
  - La template sigue llamando `getDailyStats().newCount` y `.resolvedCount` — el
    segundo acceso por ciclo es un hit de caché O(1); recalcula solo al cambiar datos
  - Gates: spec feed 5/5, lint 0 errores, tsc exit 0, suite completa 80/538, build exit 0
  cuando llega cada página y exponerlo en el template.

---

## Tanda 2 — Refinamiento UI/UX (2026-09-11)

Registro de la segunda tanda de deuda, solicitada por el usuario. Estado:
**abierto** · Verificado: 2026-09-11 (mapeo del orquestador).

### FIX-12 (CRÍTICO) — Al registrar una incidencia, navega a ruta inexistente → «página no encontrada»
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: `citizen-report.component.ts:191` hace `this.router.navigate(['/incidencias', incident.id])`
  (ruta absoluta sin prefijo `/app`), pero `app.routes.ts` define `incidencias` **anidada bajo `/app`**
  (línea 219: `/app/incidencias/:id`). El router cae en el wildcard `**` (línea 364) → 404.
  `IncidentListComponent` ya navega bien con `['/app/incidencias', incident.id]`.
- **Corrección propuesta**: cambiar la navegación post-submit a `['/app/incidencias', incident.id]`.

### FIX-13 (ALTO) — Formulario de reporte desalineado del design system (utilidades Tailwind existentes)
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: el wizard de 4 pasos usa clases sueltas (`bg-yellow-100`, `text-blue-600`,
  `border-2 rounded`, `w-flex`) en lugar de los componentes/patrones del resto de la app
  (`ui-card`, `ui-page-header`, `btn`, `ui-badge`, inputs consistentes). Queda fuera del
  lenguaje visual de F6 (usuarios, roles, perfil rediseñados).
- **Corrección propuesta**: reescribir el CSS del wizard apoyándose en las utilidades y
  componentes existentes (mismo patrón de contenedores, botonera y campos que el módulo admin).

### FIX-14 (ALTO) — Mapa: hover solo funciona en una zona
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: `map.component.ts:118-136` — `L.geoJSON` usa un objeto `style` **compartido**
  en las options y `onEachFeature` ata `mouseover`/`mouseout` por layer. El hover de una zona
  puede pisar el style compartido de las demás (solo responde la última/primera según la
  mutación). El código está estructurado para todas las zonas, pero la referencia compartida
  del style lo rompe.
- **Corrección propuesta**: crear el objeto de style **por capa** (factory que devuelva un
  style nuevo por feature) y verificar que `l.resetStyle`/restauración por zona no mute a las otras.

### FIX-15 (ALTO) — Mapa: markers no distinguen estado + falta leyenda con labels
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: `statusColors` ya existe en `map.component.ts:208-213`
  (`pending`→yellow, `in_progress`→blue, `resolved`→green, `closed`→gray) pero SOLO se usa en
  el popup. Los `L.marker` usan el icono default (`map.component.ts:19-29`), todos iguales.
  No hay leyenda en `map.component.html` (filtros top-right, stats bottom-left, mapa absolute).
- **Corrección propuesta**:
  1. Colorear los markers por `incident.status` (icono/divIcon por estado, reutilizando `statusColors`).
  2. Agregar leyenda fija en la **parte superior izquierda** del mapa (`div absolute top-4 left-4`)
     con un label por estado (Pendiente/En Proceso/Resuelto/Cerrado + swatch de color).

### FIX-16 (ALTO) — Lista de incidencias: columna Ubicación sin nombre legible
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: `incident-list.component.html:101-106` — `locationLabel(row)` muestra
  `Zona a5527...` (primeros 8 chars del `zone_id`) o `lat.toFixed(3), lng.toFixed(3)` crudo.
  El feed (`incident-card`) ya resuelve el nombre de ubicación (reverse geocode Nominatim con
  caché en memoria, `locationName`).
- **Corrección propuesta**: reutilizar el mismo mecanismo del feed (caché reverse geocode +
  fallback) para mostrar el nombre de la ubicación en la tabla.

### FIX-17 (ALTO) — Lista de incidencias: tabla no sigue el patrón de roles
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
  - Acción de fila: componente compartido nuevo `app-view-action-btn` (`shared/components/view-action-btn`)
    — SOLO el ojo (`eye`), sin menú Editar/Eliminar (decisión del usuario: incidencias no tienen esas acciones hoy)
  - La fila dejó de ser clickeable: `<tr>` sin `(click)` ni `cursor-pointer`; la única redirección
    al detalle es el ojito (`(view)="goToDetail(row)"` → `/app/incidencias/:id`)
  - Spec del componente nuevo: 3 tests (emite view, ariaLabel custom, sin menú extra)
  - Gates: suite completa 85/587 PASS, tsc exit 0, lint 0 errores (build pendiente por red, ver nota Tanda 2)
- **Evidencia**: la tabla usa `chevron-right` en acciones (`incident-list.component.html:120`) y
  estructura propia; la tabla de roles (referencia F6) usa `ui-table` + `ui-page-header` +
  `ui-table-title` + `ui-table-cell-numeric`/`actions` + `app-action-menu` (view/edit/delete) +
  badges `ui-badge` + `app-empty-state` + `app-pagination` + `app-stats-cards`.
- **Corrección propuesta**:
  1. Reemplazar el icono de acciones por el patrón `app-action-menu`/icono consistente con roles.
  2. Reestructurar la tabla de incidencias con el mismo `ui-table` + clases del patrón roles
     (títulos, badges, empty state, paginación, row hover).

### FIX-18 (MEDIO) — Detalle de incidencia: contenedores y distribución
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: el componente de detalle (`/incidencias/:id`) usa una estructura de contenedores
  propia, sin el patrón de cards/sections del resto de F6.
- **Corrección propuesta**: reorganizar contenedores (header con `ui-page-header`, secciones en
  cards, mejor distribución del grid) siguiendo el diseño de detalle de usuarios/roles.

### FIX-19 (BAJO) — Feed: «Ver descripción» no navega al detalle
- **Estado**: `[x]` resuelto — 2026-09-11 (Tanda 2, verificado por gatekeeper)
- **Evidencia**: `incident-card.component.html:63` — `<button class="text-blue-600 ...">Ver descripción</button>`
  sin handler `(click)`. El mapa navega al detalle vía `router.navigate(['/app/incidencias', inc.id])`.
- **Corrección propuesta**: agregar `(click)` que navegue a `/app/incidencias/:id` (patrón del
  popup del mapa), manteniendo estilo de label con cursor pointer.

---

## Verificación de los fixes (Tanda 2)

Con la Tanda 2 (UI/UX), verificar desde `frontend/` tras implementar:

```bash
pkill -f esbuild   # build puede colgar por zombies de sesiones previas
pnpm test          # no romper suites existentes (~80 suites / +540 tests)
npx tsc --noEmit   # exit 0
pnpm lint          # 0 errores, no sumar warnings
pnpm run build     # exit 0 (vigilar budget 600 kB)
```

Cambios de navegación (FIX-12) requieren el spec de ruta `/app/incidencias/:id` intacto.

---

## Verificación de los fixes

Al implementar (con Gemini CLI o runtime nativo), correr desde `frontend/`:

```bash
pkill -f esbuild   # build puede colgar por zombies de sesiones previas
pnpm test          # 67 suites / 443 tests esperados (no romper)
pnpm run build     # exit 0 (FIX-09: decidir umbral)
npx tsc --noEmit   # exit 0
pnpm lint          # 0 errores (FIX-03), no sumar warnings
```

Si se toca backend (no es el caso esperado), los gates son los mismos que la Fase A
(`pnpm test` 112 suites, `pnpm build`, `pnpm lint`).

---

## Historial

| Fecha | Evento |
|---|---|
| 2026-09-10 | Orquestador verifica Slice 3: build ok, 67/443 tests, pero 1 error de lint + 5 warnings nuevos + feed sin paginar + budget excedido. Se abre este documento. |
| 2026-09-10 | Tanda 1 (FIX-01 a FIX-11): todos implementados (paginación feed, cache reverse geocode, lint, control flow Angular 21, maps clean). |
| 2026-09-11 | Tanda 2 abierta (FIX-12 a FIX-19): refinamiento UI/UX solicitado — formulario (bug 404 + tailwind), mapa (hover/zonas + colores estado + leyenda), tabla incidencias (ubicación nombre + patrón roles), detalle, feed (navegación). |
| 2026-09-11 | Tanda 2 cerrada + refinamiento FIX-17: `app-view-action-btn` (solo ojo) + fila no clickeable (decisión del usuario). Gates: 85/587 tests PASS, tsc 0, lint 0 errores. Build pendiente por red (inlineFonts requiere Google Fonts). |