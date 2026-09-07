# Design: F3 — Módulo de Incidencias

## Technical Approach

Dos pantallas de peso muy distinto. El listado es un consumidor directo de los
primitivos de F0 y del patrón de filtros que F2 dejó probado. El detalle concentra
toda la complejidad: flujo de trabajo con transiciones condicionadas, comentarios
anidados, historial e imágenes.

El trabajo real de la fase no es maquetar: es **verificar contratos que nunca se
ejercieron**. `incident.service.ts` y `comment.service.ts` existen desde hace varios
changes y ningún componente los consumió jamás. Su mapeo nunca tocó el wire real.

## Architecture Decisions

**D1 — Revalidar `incident.service.ts` contra el controlador antes de maquetar.**
Primera tarea de la fase, antes de escribir una plantilla. Motivo: es el escenario
exacto de SC-209, donde el modelo declaraba `size_bytes`, el wire emitía `file_size`,
y el defecto sobrevivió porque el test afirmaba sobre la URL en lugar de sobre la
carga. Un servicio sin consumidor es un contrato sin verificar. Toda diferencia se
corrige en el frontend y se anota en el apply-progress.

**D2 — Estado de filtros en la URL, no en un signal privado.**
Los filtros viven en query params y el componente los deriva de `ActivatedRoute`.
Alternativa rechazada: estado local en signals. Motivo: un listado filtrado que no
se puede compartir por enlace es inservible en operación —«mirá estas tres incidencias
altas en proceso» es la conversación cotidiana— y además rompe el botón de atrás.

```
/app/incidencias?search=bache&estado=en_proceso&prioridad=alta&page=2
```

**D3 — El detalle no tiene mock: se ciñe a lo que el backend expone.**
No hay PNG para `/app/incidencias/:id`. Regla de contención: el detalle muestra
únicamente lo que los controladores ya devuelven —datos de la incidencia, historial,
comentarios, imágenes, acciones de flujo—. No se inventan widgets. Cuando aparezca
un mock, el ajuste será de presentación, no de alcance.

Composición:

| Bloque | Origen | Permiso |
|---|---|---|
| Encabezado (título, badges, acciones) | `incidents` | `READ` / `UPDATE` |
| Datos y descripción | `incidents` | `READ incidents` |
| Mini-mapa | coordenadas de la incidencia | `READ incidents` |
| Galería | `incident-images` | `READ incidents` |
| Historial | `status-history` | `READ incidents` |
| Hilo de comentarios | `comments` + `comment-images` | `READ` / `CREATE comments` |

**D4 — Las acciones de flujo se derivan del estado, no se habilitan a mano.**
Una función pura mapea estado actual + permisos → acciones disponibles. Evita
condicionales dispersos por la plantilla y hace la regla testeable sin montar el componente.

```ts
// frontend/src/app/features/incidents/workflow.util.ts
export type IncidentAction = 'claim' | 'release' | 'resolve' | 'close' | 'assign';

export function availableActions(
  incident: Incident,
  permissions: readonly string[],
  currentUserId: string,
): IncidentAction[] { /* … */ }
```

El servidor sigue siendo la autoridad: si devuelve 409 por transición inválida, se
muestra el motivo y **se recarga la incidencia** para resincronizar. Ocultar un botón
es ergonomía, no control.

**D5 — Comentarios: reutilizar `comment.service.ts` sin tocarlo.**
SC-209 ya lo dejó en el contrato correcto —multi-archivo, campo `images`, hasta cinco,
compresión previa vía `image-compressor.service.ts`—. F3 es su primer consumidor real
y, por tanto, la primera verificación de extremo a extremo de aquel trabajo. Si
aparece deriva, se corrige aquí y se anota; no se rediseña el servicio.

El límite de cinco se aplica **en cliente**: el 422 del servidor es la red de
seguridad, no el mecanismo de interacción.

**D6 — Anidación de comentarios acotada por el backend.**
El legacy definía `MAX_COMMENT_DEPTH` (visible en el índice de GeoReporta,
`frontend/app/shared/comment-item.js:94`). El backend actual impone su propio límite;
el frontend lo lee de la respuesta y no lo replica como constante propia. Duplicar el
número en dos sitios garantiza que se desincronicen.

**D7 — Sin tiempo real en el alcance inicial.**
`backend/src/modules/realtime` existe y `main.ts:22` ya instala el adaptador de Redis
para socket.io. Aun así, F3 se entrega con recarga bajo demanda. Motivo: el tiempo
real multiplica el estado (reconexión, deduplicación, resolución de conflictos con
ediciones locales) y ninguno de los mocks lo exige. Queda como Q2, con el seam
identificado para engancharlo después sin rehacer los componentes.

**D8 — Tarjetas de contexto: guion, no cero, ante métrica indisponible.**
Cero es un valor legítimo («ninguna incidencia abierta»). Mostrar cero cuando el
cálculo falló convierte un error en un dato falso.

## Data Flow

**Listado**:
query params → señal de filtros → `debounceTime(300)` + `distinctUntilChanged` +
`switchMap` → `GET /api/incidents?search=&status=&priority=&page=&limit=` →
wire snake_case → `Incident[]` → `ui-table` + `pagination`
Cambio de filtro → `router.navigate` con nuevos query params → el ciclo se repite

**Detalle**:
`GET /api/incidents/:id` → `Incident`
→ en paralelo: `GET /status-history?incident_id=`, `GET /comments?incident_id=`,
imágenes de la incidencia
→ `availableActions(incident, permissions, userId)` → botones renderizados

**Acción de flujo**:
click → `PATCH`/`POST` correspondiente → 2xx: se refresca la incidencia y el historial
· 409: toast con el motivo + refresco para resincronizar

**Comentario con imágenes**:
`File[]` → `ImageCompressorService.compress()` por archivo → un `FormData` con un
`append('images', blob)` por archivo → `POST /comments/:id/images` → el hilo se
actualiza en sitio

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/app/core/models/incident.model.ts` | Nuevo/Modificar (D1) | Modelo alineado al wire tras revalidación |
| `frontend/src/app/core/services/incident.service.ts` | Modificar (D1) | Corrige la deriva detectada; añade filtros y paginación |
| `frontend/src/app/core/services/status-history.service.ts` | Nuevo | Historial de una incidencia |
| `frontend/src/app/features/incidents/incident-list/` | Nuevo (D2) | Listado con filtros en URL, tabla, paginación, tarjetas de contexto |
| `frontend/src/app/features/incidents/incident-detail/` | Nuevo (D3) | Detalle completo |
| `frontend/src/app/features/incidents/workflow.util.ts` | Nuevo (D4) | `availableActions()` — función pura |
| `frontend/src/app/features/incidents/components/comment-thread/` | Nuevo (D5/D6) | Hilo anidado + composer con imágenes |
| `frontend/src/app/features/incidents/components/status-timeline/` | Nuevo | Historial cronológico |
| `frontend/src/app/features/incidents/components/incident-gallery/` | Nuevo | Galería con ampliación |
| `frontend/src/app/app.routes.ts` | Modificar | Sustituye el placeholder `/incidencias` por listado y detalle |

## Redis Caching Strategy

No aplica — F3 no toca backend. La caché de permisos `perm:v3:uid:*` sigue igual.

## Testing Strategy

- **Revalidación de contrato (D1)**: antes de maquetar, un spec por endpoint consumido
  que afirme sobre **campos mapeados**. Es la tarea que previene repetir SC-209.
- **`workflow.util.ts`**: es la lógica de negocio de la fase y se prueba como función
  pura. Matriz de estados × permisos × propiedad de la asignación. Incluye el caso de
  incidencia reclamada por otro usuario.
- **Listado**: filtros combinados producen los query params correctos; restaurar desde
  URL reconstruye el estado; `empty-state` sin resultados.
- **Detalle**: id inexistente muestra el estado local de no encontrado, no la página
  de error global; incidencia sin coordenadas omite el bloque de mapa.
- **Comentarios**: seis imágenes se rechazan en cliente **sin** emitir petición;
  cinco producen un `FormData` con cinco entradas `images`.
- **e2e (Playwright)**: (a) filtrar → abrir detalle → comentar con imagen → verificar
  en el hilo; (b) como `operador-org-1@tase.local`, comprobar que no aparecen acciones
  administrativas.
- Comandos: `pnpm lint && pnpm test && pnpm test:e2e` desde `frontend/`.

**D10 — Máquina de estados: cuatro estados, con una inconsistencia de backend por resolver.**
Definición del equipo (2026-08-29):

| Estado | Significado |
|---|---|
| `pending` | Publicada, aún **sin asignar** a un operador |
| `in_progress` | Asignada; se hace seguimiento al `operador_org` responsable |
| `resolved` | El operador **resolvió** la incidencia |
| `closed` | **No pudo resolverse**; se dio de baja |

`resolved` y `closed` son **terminales alternativos**, no consecutivos: uno es éxito y el
otro es cierre honesto de un fracaso.

**Inconsistencia detectada, bloqueante para F3.3:**

1. `database/migrations/0020_add_closed_status_to_incidents.sql` y
   `backend/src/entities/incident.entity.ts:8` admiten los cuatro estados
2. `backend/src/modules/incidents/incident-workflow.service.ts:31,46` declara
   `ALLOWED_STATUSES = ['pending','in_progress','resolved']` — **`closed` es
   inalcanzable desde el flujo de operador**
3. El comentario de 0020 documenta un flujo **lineal**
   (`pending → in_progress → resolved → closed`, «admin approve flow» de T5.6), que
   contradice la semántica ramificada del equipo

Son dos máquinas de estado distintas conviviendo. F3 **no** implementa `availableActions()`
hasta que un change de backend resuelva cuál rige: construir la UI sobre una máquina
ambigua garantiza retrabajo, y el frontend no es el lugar donde arbitrar esa decisión.

**D9 — Filtro por categoría y subcategoría (resuelto con el equipo, 2026-08-29).**
La pregunta abierta original interpretaba las casillas del mock 02-01 como posible
selección para acciones masivas. El equipo aclaró la intención real: lo que se busca
es **filtrar incidencias por categoría y subcategoría**, según lo que el administrador
de cada organización necesite ver.

Eso mueve la funcionalidad de «pregunta abierta» a **alcance de F3**, y con una forma
concreta: un filtro jerárquico de dos niveles junto a los de estado y prioridad.

- Marcar una categoría padre incluye todas sus subcategorías
- Marcar sólo algunas subcategorías deja el padre en estado **indeterminado**
  (tri-estado, no booleano: un checkbox binario mentiría sobre la selección)
- La selección se serializa en la URL como el resto de filtros (D2), de modo que un
  administrador puede guardar y compartir su vista habitual

Es el mismo control que el feed necesita en F4 (allí documentado como D11), así que
**se construye aquí como componente compartido** y F4 lo reutiliza en lugar de
reimplementarlo. Ubicación: `shared/components/category-filter/`.

Las casillas de fila del mock se mantienen sin acciones en lote: no eran para eso.

## Open Questions

- **Q1 — RESUELTA** (equipo, 2026-08-29). Ver D9: las casillas no eran para acciones
  masivas; lo requerido es filtrado por categoría y subcategoría, ahora dentro del
  alcance de la fase.
- **Q2** — ¿Debe el listado actualizarse en vivo vía `realtime` (D7)? El adaptador de
  socket.io ya está instalado en el backend. Decisión de producto, no de implementación.
