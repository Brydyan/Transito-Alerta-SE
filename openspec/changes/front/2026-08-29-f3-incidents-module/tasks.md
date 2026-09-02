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

- [ ] **F3.1.1** — Leer `incidents.controller.ts` y derivar la forma real del wire aplicando `SnakeCaseResponseInterceptor`. Contrastar campo por campo contra `frontend/src/app/core/models/incident.model.ts`. Documentar cada diferencia en el apply-progress.
- [ ] **F3.1.2** — Corregir el modelo y `incident.service.ts` según lo hallado. No modificar el backend: si el backend está mal, es un change aparte (`docs/agents/gemini-architect.md` §"Si Minimax reporta inconsistencia").
- [ ] **F3.1.3** — Añadir a `incident.service.ts` los parámetros de listado: `search`, `status`, `priority`, `page`, `limit`.
- [ ] **F3.1.4** — Spec del servicio que afirma sobre **campos mapeados**, no sobre la URL construida. La aserción sobre URL es la que dejó pasar la deriva en SC-209.
- [ ] **F3.1.5** — Repetir la revalidación para `comment.service.ts` (contrato de SC-209: multi-archivo, campo `images`, máximo cinco).
- [ ] **F3.1.6** — Crear `status-history.service.ts` con su modelo derivado del wire y su spec.
- [ ] **F3.1.7** — **BLOQUEANTE — inconsistencia de estados detectada, resolver antes de F3.3.** La BD (`0020_add_closed_status_to_incidents.sql`) y `incident.entity.ts:8` admiten cuatro estados, pero `incident-workflow.service.ts:31,46` declara `ALLOWED_STATUSES = ['pending','in_progress','resolved']`: **`closed` es inalcanzable desde el flujo de operador.** Además la semántica difiere — 0020 lo documenta como paso lineal post-`resolved` («admin approve flow»), mientras que la definición del equipo es terminal alternativo: *«no pudo resolverse y se dio de baja»*. Documentar el hallazgo en el apply-progress y **no** implementar `availableActions()` hasta que exista el change de backend que lo corrija; construir sobre una máquina de estados ambigua garantiza retrabajo.

## F3.2 — Listado

- [ ] **F3.2.1** — Crear `features/incidents/incident-list/` con `ui-page-header` (kicker `GESTIÓN / LISTADO`, título `Incidencias`).
- [ ] **F3.2.2** — Barra de filtros del mock 02-01: búsqueda por título o descripción, selector de estado, selector de prioridad (**cuatro valores**: `low|medium|high|critical`, no los tres del mock — ver F0/D9), botón filtrar y botón limpiar.
- [ ] **F3.2.2b** — Crear `shared/components/category-filter/` (D9): filtro jerárquico **tri-estado** de categoría y subcategoría. Padre marcado incluye todos sus hijos; selección parcial deja el padre indeterminado — un checkbox binario mentiría sobre la selección. **Se construye como componente compartido porque F4 lo reutiliza en el feed** (allí, D11); no reimplementarlo allá.
- [ ] **F3.2.2c** — Integrar el filtro de categorías en la barra, combinable con estado y prioridad, y serializado en la URL como el resto (D2). Filtro vacío ⇒ sin restricción por categoría, nunca listado vacío.
- [ ] **F3.2.3** — Enlazar los filtros a query params (D2): la señal de filtros se deriva de `ActivatedRoute`; cambiar un filtro navega con los params nuevos. Un listado filtrado debe poder compartirse por enlace y responder al botón de atrás.
- [ ] **F3.2.4** — Tabla con `ui-table`: casilla de selección, título con subtítulo de categoría, badges de prioridad y estado, ubicación con icono, fecha con icono, menú de acciones.
- [ ] **F3.2.5** — Título largo truncado con elipsis conservando el texto completo como título accesible.
- [ ] **F3.2.6** — Paginación con el conteo del mock («Mostrando 1-10 de 14 incidencias»).
- [ ] **F3.2.7** — `table-skeleton` durante la carga y `empty-state` cuando no hay resultados.
- [ ] **F3.2.8** — Tres tarjetas de contexto al pie: cobertura territorial, incidencias abiertas, tiempo de respuesta. Métrica indisponible ⇒ guion, **nunca cero** (D8).
- [ ] **F3.2.9** — Specs: filtros combinados generan los query params correctos; restaurar desde URL reconstruye el estado; `empty-state` sin resultados.

## F3.3 — Flujo de trabajo (lógica pura)

- [ ] **F3.3.1** — Crear `features/incidents/workflow.util.ts` con `availableActions(incident, permissions, currentUserId): IncidentAction[]` (D4).
- [ ] **F3.3.2** — Specs de la matriz completa estado × permisos × propiedad: disponible + `UPDATE` ⇒ `claim`; reclamada por el usuario ⇒ `release`; **reclamada por otro ⇒ ni `claim` ni `release`**; sin `UPDATE` ⇒ vacío; con `ASSIGN assignments` ⇒ incluye `assign`.
- [ ] **F3.3.3** — Es lógica de negocio: se prueba como función pura, sin montar componente.

## F3.4 — Detalle

- [ ] **F3.4.1** — Crear `features/incidents/incident-detail/` con la composición de D3: encabezado, datos, mini-mapa, galería, historial, comentarios. **No añadir bloques que el backend no exponga** — el detalle no tiene mock y la contención es deliberada.
- [ ] **F3.4.2** — Carga en paralelo de incidencia, historial y comentarios; cada bloque muestra su propio estado de carga sin bloquear a los demás.
- [ ] **F3.4.3** — Mini-mapa con Leaflet (`leaflet@1.9.4` ya instalado) centrado en las coordenadas. **Sin coordenadas ⇒ se omite el bloque entero**, no un contenedor vacío.
- [ ] **F3.4.4** — Id inexistente ⇒ estado local de no encontrado dentro del layout, no la página de error global.
- [ ] **F3.4.5** — `components/status-timeline/`: historial cronológico con estado, autor y momento.
- [ ] **F3.4.6** — `components/incident-gallery/`: galería con ampliación.
- [ ] **F3.4.7** — Renderizar las acciones de flujo a partir de `availableActions()`. Un 409 muestra el motivo **y recarga la incidencia** para resincronizar el estado mostrado.
- [ ] **F3.4.8** — Acción de asignación a operador, condicionada a `ASSIGN assignments`. Consume `GET /api/incidents/:id/available-operators`, que ya devuelve `activeClaimCount` por operador.
- [ ] **F3.4.9** — **Realimentación explícita al asignar.** 2xx ⇒ «Operador libre y asignado correctamente»; **429 `CLAIM_LIMIT_REACHED`** ⇒ «Operador ocupado, no se le pueden asignar más incidencias». Ambos caminos **ya existen en el backend** (`incident-workflow.service.ts:84-86`): esto es presentación, no lógica nueva. No inventar un mensaje genérico de error — el motivo concreto es lo que el admin necesita para elegir a otro.
- [ ] **F3.4.10** — Mostrar en el selector también a los operadores ocupados, deshabilitados y con el motivo visible. Hoy `availableOperators()` los **filtra**, así que el admin no entiende por qué falta gente en la lista. Depende del cambio de contrato de la story 316/D1: si aún no está, consumir lo que hay y anotar la limitación en el apply-progress.

## F3.5 — Comentarios

- [ ] **F3.5.1** — Crear `components/comment-thread/`: listado cronológico con autor, avatar, momento y contenido.
- [ ] **F3.5.2** — Anidación de respuestas respetando la profundidad máxima **que informa el backend**; no declarar una constante propia en el frontend (D6) — dos fuentes del mismo número se desincronizan.
- [ ] **F3.5.3** — Composer condicionado a `CREATE comments`; sin el permiso, el hilo se muestra en sólo lectura.
- [ ] **F3.5.4** — Adjuntar imágenes: comprimir con `image-compressor.service.ts` y enviar un único `FormData` con un `append('images', blob)` por archivo (contrato de SC-209).
- [ ] **F3.5.5** — Límite de cinco imágenes aplicado **en cliente**, sin emitir petición. El 422 del servidor es red de seguridad, no mecanismo de interacción.
- [ ] **F3.5.6** — Publicar inserta el comentario en el hilo sin recargar la página.
- [ ] **F3.5.7** — Specs: seis imágenes se rechazan sin petición; cinco producen cinco entradas `images` en el `FormData`.

## F3.6 — Cierre

- [ ] **F3.6.1** — Sustituir el placeholder `/incidencias` en `app.routes.ts` por listado y detalle, con `permissionGuard` y `data.breadcrumb`.
- [ ] **F3.6.2** — e2e: filtrar → abrir detalle → comentar con imagen → verificar el comentario en el hilo.
- [ ] **F3.6.3** — e2e con `operador-org-1@tase.local`: sin acciones administrativas visibles y sin acceso directo por URL.
- [ ] **F3.6.4** — Verificar que no queda `// PLACEHOLDER F3` en `app.routes.ts`.
- [ ] **F3.6.5** — `pnpm lint && pnpm test && pnpm build` y `pnpm test:e2e` desde `frontend/`.

---

## Definition of Done

- Contratos de `incident.service.ts` y `comment.service.ts` revalidados contra el wire, con las diferencias documentadas
- Listado con filtros combinables reflejados en la URL y compartibles por enlace
- Detalle con historial, galería, mini-mapa y hilo de comentarios funcionando
- `workflow.util.ts` con la matriz estado × permisos × propiedad cubierta por specs
- Comentarios con imágenes funcionando de extremo a extremo — primera verificación real de SC-209
- Cero `// PLACEHOLDER F3` restantes
- Suites unitaria y e2e en verde
