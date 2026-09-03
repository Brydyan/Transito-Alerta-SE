# Tasks: F4 — Ciudadano: feed, asistente de reporte y mapa

**Change**: `2026-08-29-f4-citizen-feed-wizard-map`
**Depende de**: F0 (primitivos), F1 (rutas `/inicio`, `/reportar`, `/mapa`), F3 (modelo `Incident` revalidado)
**Fuente del contrato**: `docs/mock/09-01` … `09-05`, `11-01`
**Working dir**: `backend` para la Fase A · `frontend` para la Fase B
**Compuerta**: **la Fase B no se integra antes que la A** (patrón SC-209)

> **Strict TDD activo** (`openspec/config.yaml` → `testing.strict_tdd: true`).
> Toda la Fase A escribe el test antes que la implementación. Runner: `npm test`.

---

# FASE A — Backend (prerequisito)

## A.1 — Migración

- [ ] **A.1.1** — Consultar `database/MIGRATION_LOG.md` y reservar el número siguiente (la última aplicada es `0042`).
- [ ] **A.1.2** — Escribir la migración con la tabla `incident_followers`: `id` uuid PK, `incident_id` FK → `incidents`, `user_id` FK → `users`, `created_at`, `UNIQUE (incident_id, user_id)`, índice sobre `user_id`.
- [ ] **A.1.3** — Añadir `incident_corroborations`: mismas columnas más `comment` text NULL, `UNIQUE (incident_id, user_id)`, índice sobre `incident_id`.
- [ ] **A.1.4** — Registrar en el catálogo de permisos `CREATE incident-followers`, `DELETE incident-followers` y `CREATE incident-corroborations`.
- [ ] **A.1.5** — Actualizar `roles.permissions` en los cuatro roles (`master`, `operador_sistema`, `admin_org`, `operador_org`).
- [ ] **A.1.6** — **Actualizar `users.permissions` de los usuarios ya existentes** (D5). `users.permissions` es una copia tomada al asignar el rol: tocar sólo `roles` deja a los usuarios actuales sin los permisos nuevos. Este es exactamente el fallo que ya se vivió en este proyecto.
- [ ] **A.1.7** — Añadir la entrada correspondiente a `database/MIGRATION_LOG.md`.
- [ ] **A.1.8** — Test de migración: aplicada sobre una base con usuarios preexistentes, su `users.permissions` contiene los permisos nuevos. Es la aserción que blinda A.1.6.

## A.2 — Entidades

- [ ] **A.2.1** — `incident-follower.entity.ts`: entidad TypeORM con índice único compuesto. **Sin borrado lógico** (D3): dejar de seguir es retractación, y una fila marcada como borrada rompería el `UNIQUE` que sostiene la idempotencia.
- [ ] **A.2.2** — `incident-corroboration.entity.ts`: ídem, con `comment` nullable.

## A.3 — Servicio

- [ ] **A.3.1** — Specs primero de `incident-social.service.ts`: seguir idempotente; dejar de seguir algo no seguido devuelve éxito sin cambiar el conteo; corroborar dos veces ⇒ 409; el autor corroborando su propia incidencia ⇒ 409.
- [ ] **A.3.2** — Implementar `follow()` idempotente: la violación de `UNIQUE` se traduce en éxito, no en error (D2).
- [ ] **A.3.3** — Implementar `unfollow()` idempotente.
- [ ] **A.3.4** — Implementar `corroborate()`: la violación de `UNIQUE` se traduce en 409 (D2, asimetría deliberada respecto a seguir).
- [ ] **A.3.5** — Rechazar con 409 la corroboración del propio autor: crear el reporte ya es su testimonio.

## A.4 — Conteos agregados

- [ ] **A.4.1** — Ampliar `incidents.service.ts` para exponer `follower_count`, `corroboration_count`, `is_followed_by_me` e `is_corroborated_by_me` (D4).
- [ ] **A.4.2** — Resolver los conteos por agregación en la consulta (`LEFT JOIN LATERAL` o subconsulta) y las banderas con `EXISTS` parametrizado por el usuario actual.
- [ ] **A.4.3** — **Test de número de consultas**: un listado paginado no emite una consulta por fila. Se afirma sobre la cantidad de consultas, no sobre el tiempo — el feed es la pantalla más visitada y el N+1 aquí es el más caro del sistema.

## A.5 — Controlador y notificaciones

- [ ] **A.5.1** — `incident-social.controller.ts`: `POST`/`DELETE /api/incidents/:id/followers`, `POST /api/incidents/:id/corroborations`, con sus guards de permiso.
- [ ] **A.5.2** — Incidencia inexistente ⇒ 404; petición sin sesión ⇒ 401.
- [ ] **A.5.3** — Notificar a los seguidores al cambiar el estado de una incidencia, **excluyendo a quien provocó el cambio**.
- [ ] **A.5.4** — Test: incidencia sin seguidores cambia de estado sin generar notificaciones y sin fallar.
- [ ] **A.5.5** — `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde `backend/`.

## A.6 — Despliegue

- [ ] **A.6.1** — Tras aplicar la migración, invalidar `perm:v3:uid:*` en Redis. Sin esto, la resolución de permisos sigue sirviendo la copia anterior y los botones nuevos no aparecen.
- [ ] **A.6.2** — Verificar con `master@tase.local` que los permisos nuevos están presentes en la respuesta de autenticación.

---

# FASE B — Frontend

> No comenzar hasta que la Fase A esté integrada y desplegada.
> Orden interno: **asistente → feed → mapa** (D9).

## B.1 — Base

- [ ] **B.1.1** — `pnpm add leaflet.markercluster @types/leaflet.markercluster` desde `frontend/`; regenerar `pnpm-lock.yaml` (CI usa `--frozen-lockfile`).
- [ ] **B.1.2** — Crear `core/services/incident-social.service.ts`: `follow`, `unfollow`, `corroborate`.
- [ ] **B.1.3** — Crear `shared/components/map-picker/`: mapa Leaflet reutilizable de selección de punto, consumido por el paso 3 y por el detalle de F3.

## B.2 — Asistente de reporte

- [ ] **B.2.1** — Crear `core/services/report-draft.service.ts` con dexie (D6): persistir `ReportDraft` incluyendo `Blob` de archivos. `localStorage` no sirve — sólo guarda cadenas y base64 infla ~33 % contra una cuota de ~5 MB.
- [ ] **B.2.2** — Specs del borrador: persiste y restaura con `Blob`; **sobrevive a un fallo de envío**; se descarta sólo tras éxito.
- [ ] **B.2.3** — Ampliar `features/citizen-report/` al asistente de cuatro pasos (D10) — el componente ya existe y F1 lo enrutó; no crear otro.
- [ ] **B.2.4** — Indicador de progreso con los cuatro pasos del mock 09-02: `INFORMACIÓN BÁSICA`, `CATEGORIZACIÓN Y ARCHIVOS`, `UBICACIÓN`, `REVISIÓN`.
- [ ] **B.2.5** — Paso 1: título, prioridad sugerida, descripción inicial; validación bloquea el avance. El selector de prioridad ofrece **cuatro** valores (`low|medium|high|critical`). **`critical` es la emergencia** — no hay tipo de incidencia aparte ni dominio nuevo: ya existe en el esquema y en todo el backend, sólo faltaba exponerla (F0/D9).
- [ ] **B.2.6** — Paso 2: categoría y adjuntos, comprimidos con `image-compressor.service.ts` antes de subir.
- [ ] **B.2.7** — Paso 3: `map-picker` + `geolocation.service.ts`. **Permiso denegado ⇒ selección manual**, nunca un flujo bloqueado.
- [ ] **B.2.8** — Paso 4: resumen completo y envío.
- [ ] **B.2.9** — Retroceder conserva los datos; recargar restaura paso y datos desde el borrador.
- [ ] **B.2.10** — Envío exitoso ⇒ crear incidencia, subir imágenes, descartar borrador y navegar al detalle. Fallo ⇒ conservar borrador y mostrar el error.
> **B.2.11–B.2.13 reescritas el 2026-09-02.** Describían el flujo **sin sesión**, que la
> decisión de producto de esa fecha retiró (ver ANON). Se reescriben en lugar de
> borrarse: el texto anterior queda en el historial de git y en el proposal de F4, con el
> motivo. Dependen de **REG**, **ANON** y **AUD** ya integradas.

- [ ] **B.2.11** — **Interruptor «publicar de forma anónima»** en el asistente. Requiere sesión: sin ella el asistente no es alcanzable. Al activarlo, el envío incluye `is_anonymous = true`; el backend (AUD) hace que `citizen_id` apunte a la máscara y sella al autor real en `incident_reporters`. El frontend **no** ve ni maneja el id real: si nunca lo recibe, no puede filtrarlo por descuido.
- [ ] **B.2.12** — **Aviso junto al interruptor**, consumiendo la constante que exporta AUD. Visible sin interacción: **no** detrás de un tooltip, un acordeón ni un enlace. El texto dice que la identidad no se publica y que puede ser revelada, dejando registro, ante una denuncia por información falsa. Una sola versión del texto, en AUD, para que no se bifurque.
- [ ] **B.2.13** — Specs de publicación anónima: con el interruptor activo la incidencia sale rotulada como anónima; el detalle y el feed **no** exponen al autor real; el propio autor sí ve su incidencia en «mis reportes»; el aviso está presente y visible sin interacción; sin sesión el asistente **no** se completa.
- [ ] **B.2.14** — Enlace a `/registro` desde el login y desde el asistente (cierra la promesa que la antigua B.2.12 hacía sin destino: hasta REG no existía pantalla de registro).

## B.3 — Feed

- [ ] **B.3.1** — Crear `features/citizen/feed/` con el composer superior que navega al asistente.
- [ ] **B.3.2** — `components/incident-card/` según mock 09-01: autor, ubicación, antigüedad relativa, badges, título, código, etiquetas, coordenadas, «Ver Mapa» y pie de acciones.
- [ ] **B.3.3** — «Seguir» con actualización optimista y **reversión ante error** (D7).
- [ ] **B.3.4** — «Yo también reporto» **sin** optimismo: espera la confirmación del servidor porque es irreversible (D7). Ya corroborada o autor ⇒ control deshabilitado desde la carga.
- [ ] **B.3.5** — Carga incremental al llegar al final, sin perder la posición de desplazamiento.
- [ ] **B.3.6** — Estado final «Has visto todas las incidencias recientes» — nunca un cargador perpetuo.
- [ ] **B.3.7** — `components/feed-filters/`: chips de estado y árbol de categorías **tri-estado** (D11) — padre marcado selecciona hijos; selección parcial deja el padre indeterminado.
- [ ] **B.3.8** — Panel lateral: estadísticas del día y ranking de zonas.
- [ ] **B.3.9** — Specs: reversión optimista, corroboración sin optimismo, indeterminado del árbol, fin del feed.

## B.4 — Mapa

- [ ] **B.4.1** — Crear `features/citizen/map/` a pantalla completa con Leaflet.
- [ ] **B.4.2** — Agrupación de marcadores con `leaflet.markercluster` (D8). **Anotar en el código el umbral de ~5.000 incidencias** a partir del cual la agrupación debe pasar al servidor.
- [ ] **B.4.3** — Panel de filtros flotante (estado, prioridad, categoría) con acción de limpiar todo.
- [ ] **B.4.4** — Contador de incidencias mostradas y marca de última actualización.
- [ ] **B.4.5** — Marcador activado ⇒ resumen con enlace al detalle.
- [ ] **B.4.6** — Sin resultados ⇒ mapa vacío con aviso explícito, distinguible de un fallo de carga.

## B.5 — Cierre

- [ ] **B.5.1** — Sustituir los placeholders `/inicio` y `/mapa` en `app.routes.ts`; `/reportar` pasa a montar el asistente.
- [ ] **B.5.2** — e2e: asistente completo hasta ver la incidencia creada.
- [ ] **B.5.3** — e2e: recargar a medio asistente y comprobar la restauración del borrador.
- [ ] **B.5.4** — e2e: seguir y corroborar desde el feed; recargar y verificar que el estado persiste.
- [ ] **B.5.5** — Verificar que no queda `// PLACEHOLDER F4` en `app.routes.ts`.
- [ ] **B.5.6** — `pnpm lint && pnpm test && pnpm build` y `pnpm test:e2e` desde `frontend/`.

---

## Definition of Done

**Fase A**
- Migración aplicada con permisos propagados a `roles.permissions` **y** `users.permissions`
- `perm:v3:uid:*` invalidada tras el despliegue
- Seguir idempotente; corroborar duplicado y autor ⇒ 409
- Conteos sin N+1, verificado por número de consultas
- Suites de backend en verde

**Fase B**
- Asistente de cuatro pasos con borrador que sobrevive a recarga y a fallo de envío
- Feed con acciones sociales, carga incremental y filtros jerárquicos tri-estado
- Mapa con agrupación, filtros y contador
- Cero `// PLACEHOLDER F4` restantes
- Suites unitaria y e2e en verde
