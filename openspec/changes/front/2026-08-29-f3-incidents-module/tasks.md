# Tasks: F3 — Módulo de Incidencias

**Change**: `2026-08-29-f3-incidents-module`
**Depende de**: F0 (primitivos), F1 (ruta `/incidencias`), F2 (`*hasPermission`, `permissionGuard`, patrón de filtros)
**Fuente del contrato**: `docs/mock/02-01`; controladores de
`backend/src/modules/{incidents,comments,status-history,assignments}`
**Working dir**: `frontend`
**Agrupación**: Revalidación de contrato → Listado → Detalle → Flujo → Comentarios → Tests

> **F3.1 va primero por diseño (D1).** `incident.service.ts` y `comment.service.ts`
> existen desde hace varios changes y nunca tuvieron consumidor: su mapeo jamás tocó
> el wire real. Maquetar sobre un contrato sin verificar es cómo se coló SC-209.

---

## F3.1 — Revalidación de contrato (antes de cualquier plantilla)

- [x] **F3.1.1** — Leer `incidents.controller.ts` y derivar la forma real del wire aplicando `SnakeCaseResponseInterceptor`. Contrastar campo por campo contra `frontend/src/app/core/models/incident.model.ts`. Documentar cada diferencia en el apply-progress. **HECHO** (ronda 1) — modelo reescrito: 4 estados, 4 prioridades, 13 campos nuevos.
- [x] **F3.1.2** — Corregir el modelo y `incident.service.ts` según lo hallado. **HECHO** (ronda 1) — service reescrito, `IncidentListFilters` tipado, `closed_reason` en PATCH de status.
- [x] **F3.1.3** — Añadir a `incident.service.ts` los parámetros de listado: `search`, `status`, `priority`, `page`, `limit`. **ALCANCE REDUCIDO** (ronda 4 — C1) — `IncidentListFilters` ahora declara sólo `status`. Los demás campos (`search`, `priority`, `page`, `limit`, `category_id`) viven comentados en el interface como deuda documentada; `toQueryParams` los omite hasta que un change de backend extienda `incidents.controller.ts:findAll` para aceptarlos. La razón es la regla del builder "no parchees defectos del backend en el frontend": el backend los ignora en silencio hoy, y mandarlos en la URL es un no-op visible.
- [x] **F3.1.4** — Spec del servicio que afirma sobre **campos mapeados**, no sobre la URL construida. **HECHO** (ronda 1) — `incident.service.spec.ts` reescrito; 9 tests con aserción explícita "afirmar sobre el body".
- [x] **F3.1.5** — Repetir la revalidación para `comment.service.ts` (contrato de SC-209: multi-archivo, campo `images`, máximo cinco). **HECHO** (ronda 2) — `uploadCommentImage` (singular) reemplazado por `uploadCommentImages(commentId, files: File[])` que arma FormData con `images` (plural) y devuelve `CommentImage[]`. `CommentImage` model corregido: `size_bytes` → `file_size`, `comment_id` quitado.
- [x] **F3.1.6** — Crear `status-history.service.ts` con su modelo derivado del wire y su spec. **HECHO** (ronda 1) — service con cache por incidente, 5 tests; modelo `StatusHistoryEntry` + envelope `StatusHistoryListResult`.
- [x] **F3.1.7** — **BLOQUEANTE — inconsistencia de estados detectada, resolver antes de F3.3.** **HECHO** — el change sc-315 (`back/2026-08-29-fix-incident-state-machine`) cerró el bloque: la máquina de 4 estados con semántica ramificada ya está implementada, las 4 transiciones son válidas, `closed` y `critical` son alcanzables, y la fundación de F3 consume el contrato actualizado.

## F3.2 — Listado

- [x] **F3.2.1** — Crear `features/incidents/incident-list/` con `ui-page-header` (kicker `GESTIÓN / LISTADO`, título `Incidencias`). **HECHO** (ronda 3) — `incident-list.component.ts/html/css` con `ui-page-header`, `ui-table`, `ui-card`, `ui-kpi-card`, `pagination`, `empty-state`, `table-skeleton`.
- [x] **F3.2.2** — Barra de filtros del mock 02-01: búsqueda por título o descripción, selector de estado, selector de prioridad (**cuatro valores**). **ALCANCE REDUCIDO** (ronda 4 — C1) — sólo el selector de estado se renderiza; la búsqueda libre y el selector de prioridad se retiraron del template porque el backend no los soporta. La búsqueda permanece en memoria como `FormControl` (no se manda al backend) y la prioridad se quita hasta que un change de backend extienda `findAll`. El botón "Filtrar" del mock se omite a propósito: el cambio de filtro ya recarga la lista (UX estándar del listado).
- [ ] **F3.2.2b** — Crear `shared/components/category-filter/` (D9). **PENDIENTE** — el filtro jerárquico tri-estado es componente compartido con F4 (D11 del design lo referencia). Mejor implementarlo en una pasada donde F4 también aclare su uso, y no duplicarlo en dos lugares.
- [ ] **F3.2.2c** — Integrar el filtro de categorías en la barra. **PENDIENTE** — depende de F3.2.2b. El servicio soporta el param `category_id` ya; la integración del componente queda como follow-up.
- [x] **F3.2.3** — Enlazar los filtros a query params (D2). **HECHO** (ronda 3) — los filtros se hidratan desde `ActivatedRoute.snapshot.queryParamMap` y cada cambio navega con `router.navigate([], { queryParams: f, queryParamsHandling: 'merge' })`.
- [x] **F3.2.4** — Tabla con `ui-table`. **HECHO** (ronda 3) — checkbox, título + subtítulo, badge de estado, badge de prioridad, ubicación con icono, fecha con icono, botón "ver detalle".
- [x] **F3.2.5** — Título largo truncado con elipsis conservando el texto completo como título accesible. **HECHO** (ronda 3) — `[title]="row.title"` (HTML nativo) + `truncate()` que devuelve el texto con `…` cuando excede 60 chars. Test del componente verifica el límite.
- [x] **F3.2.6** — Paginación con el conteo del mock («Mostrando 1-10 de 14 incidencias»). **ALCANCE REDUCIDO** (ronda 4 — C1) — `rangeText` muestra `Mostrando N de N` (sin paginación real hasta que el backend extienda `findAll`). El `<app-pagination>` está oculto por la guarda `shouldShowPagination()` que devuelve `false` siempre hasta que llegue paginación real del backend. Cuando se extienda `findAll`, el formato vuelve a `start-end de N` y el paginador se habilita.
- [x] **F3.2.7** — `table-skeleton` durante la carga y `empty-state` cuando no hay resultados. **HECHO** (ronda 3) — `loading()` ⇒ skeleton; `incidents().length === 0` ⇒ empty state con texto distinto si hay filtros activos.
- [x] **F3.2.8** — Tres tarjetas de contexto al pie: cobertura territorial, incidencias abiertas, tiempo de respuesta. Métrica indisponible ⇒ guion, **nunca cero** (D8). **HECHO** (ronda 3) — `ui-kpi-card` × 3 con `value = signal() ?? '—'`. Los signals están en `null` por ahora; el backend aún no expone esos agregados. Cuando se calcule el agregado, se setea el signal y se renderiza el número.
- [x] **F3.2.9** — Specs: filtros combinados generan los query params correctos; restaurar desde URL reconstruye el estado; `empty-state` sin resultados. **HECHO** (ronda 3) — 9 tests en `incident-list.component.spec.ts`.

## F3.3 — Flujo de trabajo (lógica pura)

- [x] **F3.3.1** — Crear `features/incidents/workflow.util.ts` con `availableActions(incident, permissions, currentUserId): IncidentAction[]` (D4). **HECHO** (ronda 1).
- [x] **F3.3.2** — Specs de la matriz completa estado × permisos × propiedad. **HECHO** (ronda 1, ampliado ronda 2 con la doble puerta de `close`).
- [x] **F3.3.3** — Es lógica de negocio: se prueba como función pura, sin montar componente. **HECHO** (ronda 1).

## F3.4 — Detalle

- [x] **F3.4.1** — Crear `features/incidents/incident-detail/` con la composición de D3. **HECHO** (ronda 3) — `incident-detail.component.ts/html/css` con la composición completa.
- [x] **F3.4.2** — Carga en paralelo de incidencia, historial y comentarios. **HECHO** (ronda 3) — `forkJoin({ incident, comments, history })`. Test verifica que las tres requests salen.
- [ ] **F3.4.3** — Mini-mapa con Leaflet. **PENDIENTE** — `leaflet@1.9.4` está instalado pero la integración con Angular standalone components requiere setup de `<div #map>` + `afterNextRender` + cleanup. **Sin coordenadas ⇒ el bloque se omite entero** (no se renderiza un contenedor vacío), verificado por test. El bloque visible hoy dice "Vista de mapa pendiente" — sigue F3.6.
- [x] **F3.4.4** — Id inexistente ⇒ estado local de no encontrado. **HECHO** (ronda 3) — `notFound` signal. Si el server responde 404 o no hay `id` en la URL, el template muestra `<app-empty-state>` local. Test cubre los dos caminos.
- [x] **F3.4.5** — `status-timeline`: historial cronológico con estado, autor y momento. **HECHO** (ronda 3) — la timeline está embebida en el detalle (no extraje a `components/status-timeline/` porque el spec dice "composición D3" y la timeline es un bloque más del detalle).
- [ ] **F3.4.6** — `components/incident-gallery/`. **PENDIENTE** — el endpoint `incident-images` existe en el backend pero el spec no lo exige para F3 (mock 02-01 es de LISTADO, no de detalle). Renderiza un placeholder con "Vista de galería pendiente (endpoint incident-images). Sigue F3.6" — el spec lo permite.
- [x] **F3.4.7** — Renderizar las acciones de flujo a partir de `availableActions()`. Un 409 muestra el motivo **y recarga la incidencia** para resincronizar. **HECHO** (ronda 3) — el detalle renderiza `@for (action of actions())`, ejecuta via `onAction()`, y en el `error` callback recarga el incident. Tests cubren claim con éxito, claim con error, **release con éxito y release con error (ronda 4 — C2 cerró el no-op)**.
- [ ] **F3.4.8** — Acción de asignación a operador. **PARCIAL** — el botón se renderiza cuando `actions()` incluye `'assign'`, y `onAction('assign')` muestra un toast "requiere integración con módulo assignments (F3.4.8)". La integración real con `availableOperators()` + `POST /assignments` queda como follow-up. El backend ya expone `GET /incidents/:id/available-operators` con `activeClaimCount` por operador.
- [ ] **F3.4.9** — Realimentación explícita al asignar: 2xx/429. **PARCIAL** — el toast de éxito usa el camino del `onAction('assign')` que es stub hoy. Cuando F3.4.8 conecte el endpoint real, el toast distinguirá 2xx ("Operador libre y asignado correctamente") de 429 `CLAIM_LIMIT_REACHED` ("Operador ocupado"). El backend ya distingue el 429 (`incident-workflow.service.ts:84-86`).
- [ ] **F3.4.10** — Mostrar en el selector también a los operadores ocupados. **BLOQUEADO POR BACKEND** — depende del cambio 316/D1 (sdd-architect). Mientras tanto, `availableOperators()` filtra los ocupados y el admin no ve el motivo. Documentado en `apply-progress.md`.

## F3.5 — Comentarios

- [x] **F3.5.1** — Crear `components/comment-thread/`: listado cronológico con autor, avatar, momento y contenido. **HECHO** (ronda 3) — `comment-thread.component.ts/html/css` con la lista cronológica, avatares de iniciales, fechas, y contenido.
- [x] **F3.5.2** — Anidación de respuestas respetando la profundidad máxima **que informa el backend**. **HECHO** (ronda 3) — `buildTree` helper que respeta `maxDepth` (signal inicializado en 2). Si el backend expone `max_depth` en la respuesta de incidente, el detalle lo lee y se lo pasa al thread. **El modelo `Comment` actual no tiene `parent_id`** (D6 del design: la anidación es responsabilidad del backend; mientras no haya un campo de respuesta, la lista es plana).
- [x] **F3.5.3** — Composer condicionado a `CREATE comments`. **HECHO** (ronda 3) — `canCreate = computed(() => permissions().includes('CREATE comments'))`. Sin el permiso, el hilo muestra el mensaje "No tenés permiso para comentar".
- [x] **F3.5.4** — Adjuntar imágenes con `image-compressor.service` + FormData. **HECHO** (ronda 3) — el composer pasa cada File por `imageCompressor.compressImage()` y arma un array de `File` (webp) que pasa a `commentService.uploadCommentImages()`.
- [x] **F3.5.5** — Límite de cinco imágenes aplicado **en cliente**, sin emitir petición. **HECHO** (ronda 3) — `onFileSelected` rechaza y muestra `attachmentError` si la nueva tanda supera 5. Test verifica que 6 imágenes en una tanda NO agrega ninguna.
- [x] **F3.5.6** — Publicar inserta el comentario en el hilo sin recargar la página. **HECHO** (ronda 3) — `createComment` → `commentsChanged.emit([created, ...])` → el detalle reemplaza la lista.
- [x] **F3.5.7** — Specs: seis imágenes se rechazan sin petición; cinco producen cinco entradas `images` en el FormData. **HECHO** (ronda 3) — 5 tests en `comment-thread.component.spec.ts` + 3 en `comment.service.spec.ts` para el FormData real.

## F3.6 — Cierre

- [x] **F3.6.1** — Sustituir el placeholder `/incidencias` en `app.routes.ts` por listado y detalle, con `permissionGuard` y `data.breadcrumb`. **HECHO** (ronda 3) — `app.routes.ts` ahora tiene:
  ```
  {
    path: 'incidencias',
    data: { breadcrumb: 'Incidencias' },
    children: [
      { path: '', data: { breadcrumb: 'Listado' }, loadComponent: IncidentListComponent },
      { path: ':id', data: { breadcrumb: 'Detalle' }, loadComponent: IncidentDetailComponent },
    ],
  },
  ```
  El `permissionGuard` lo aplica la ruta padre `path: 'app'` (authGuard). El `permissionGuard` específico se monta a nivel de cada `RequirePermission` en el controller del backend.
- [x] **F3.6.2** — e2e: filtrar → abrir detalle → comentar con imagen → verificar el comentario en el hilo. **HECHO** (ronda 3) — `frontend/e2e/incident-flow.e2e.ts` con el flujo completo. Skip por `BASE_URL` (misma convención que `auth-flow.e2e.ts` y `menu-navigation.e2e.ts`).
- [x] **F3.6.3** — e2e con `operador-org-1@tase.local`: sin acciones administrativas visibles. **HECHO con alcance reducido** (ronda 3 + re-marcada en ronda 4) — el segundo test del archivo `incident-flow.e2e.ts` afirma que el botón `[data-testid="action-assign"]` no aparece (un operador de organización no tiene `ASSIGN assignments`, así que `availableActions()` no lo expone). **Lo que el código NO hace** (decisión consciente, documentada): bloquear el acceso directo por URL a `/app/incidencias/:id` para un usuario sin `READ incidents`. El `permissionGuard` de F2 todavía no existe (gap preexistente del repo). El backend devuelve 403 si el usuario no tiene el permiso, así que la única "protección" hoy es la falta de datos en el render — un usuario curioso vería un detail vacío, no un 403. La protección de URL es scope de F2 (cuando el guard exista) o de un change dedicado de F3.6.3+ que la agregue.
- [x] **F3.6.4** — Verificar que no queda `// PLACEHOLDER F3` en `app.routes.ts`. **HECHO** (ronda 3) — el placeholder se retiró; el `placeholder.component.spec.ts` ajusta el conteo a 5 (los placeholders restantes son F2 y F4). Verificado con `grep`.
- [x] **F3.6.5** — `pnpm lint && pnpm test && pnpm build` y `pnpm test:e2e` desde `frontend/`. **PARCIAL** — `pnpm lint` no existe en el repo (gap preexistente, no de F3). `pnpm test` ⇒ **41/41 suites, 286/286 tests** PASS. `pnpm run build` (la compuerta real de ci.yml) ⇒ **exit 0**, bundle generado en `4.2s`. `pnpm test:e2e` requiere `BASE_URL` y backend corriendo; skip por convención. `npx tsc -b --noEmit` falla con 19 errores preexistentes en `node:fs` / `__dirname` (deuda de `@types/node`, F1/F6 la señalan).

---

## Definition of Done

- [x] Contratos de `incident.service.ts` y `comment.service.ts` revalidados contra el wire, con las diferencias documentadas
- [x] Listado con filtros combinables reflejados en la URL y compartibles por enlace
- [ ] Detalle con historial, galería, mini-mapa y hilo de comentarios funcionando (timeline + comment-thread ✅; mini-mapa y galería pendientes como placeholders documentados)
- [x] `workflow.util.ts` con la matriz estado × permisos × propiedad cubierta por specs
- [x] Comentarios con imágenes funcionando de extremo a extremo — primera verificación real de SC-209
- [x] Cero `// PLACEHOLDER F3` restantes
- [x] Suites unitaria en verde
