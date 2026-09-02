# Design: F4 — Ciudadano: feed, asistente de reporte y mapa

## Technical Approach

Dos fases con compuerta, como en SC-209: **la Fase B no se integra antes que la A**.
El feed sin seguimiento ni corroboración es una lista de tarjetas con botones muertos.

Fase A añade dos tablas de unión y sus endpoints. Fase B construye tres pantallas
sobre dependencias que ya están instaladas pero nunca se usaron: `leaflet@1.9.4`,
`@turf/boolean-point-in-polygon`, `dexie`, `idb`, y los servicios
`geolocation.service.ts` e `image-compressor.service.ts`.

## Architecture Decisions — Fase A (backend)

**D1 — Dos tablas de unión, no una tabla polimórfica de «reacciones».**
Se rechaza modelar seguir y corroborar como filas de una tabla `incident_reactions`
con discriminador. Las dos acciones tienen semántica y ciclo de vida distintos:
seguir se deshace y no aporta información al caso; corroborar es un testimonio que no
se retira y admite comentario. Fusionarlas obliga a columnas nulas y a validaciones
condicionales por tipo.

**D2 — Idempotencia asimétrica, por semántica.**
`POST /followers` es idempotente: seguir dos veces no es un error, es la misma
intención repetida (doble clic, reintento de red). `POST /corroborations` responde 409
al repetirse: corroborar es afirmar un hecho, y afirmarlo dos veces sí indica que el
cliente perdió el estado. La restricción `UNIQUE (incident_id, user_id)` respalda
ambos casos en base de datos; la diferencia está en cómo se traduce la violación.

**D3 — Sin borrado lógico en estas dos tablas.**
El proyecto usa borrado lógico en entidades de dominio (`openspec/config.yaml`
§`apply`). Aquí no aplica: dejar de seguir es una retractación completa, no un archivado,
y una fila marcada como borrada complicaría el `UNIQUE` que garantiza la idempotencia
de D2. Se documenta la excepción para que no se lea como olvido.

**D4 — Conteos por agregación, nunca por consulta por fila.**
`follower_count` y `corroboration_count` se resuelven con `LEFT JOIN LATERAL` o
subconsulta agregada dentro de la consulta del listado. Las banderas
`is_followed_by_me` e `is_corroborated_by_me` se resuelven con un `EXISTS`
parametrizado por el usuario actual. El N+1 aquí sería especialmente caro porque el
feed es la pantalla más visitada del producto.

**D5 — Propagación de permisos al modelo denormalizado.**
`users.permissions` es una copia de `roles.permissions` tomada al asignar el rol
(patrón T3.9). Insertar permisos en `roles` **no** alcanza a los usuarios existentes.
La migración debe:

1. añadir los permisos al catálogo,
2. actualizar `roles.permissions` en los cuatro roles,
3. actualizar `users.permissions` de los usuarios ya creados,
4. y tras desplegar, invalidar `perm:v3:uid:*` en Redis.

Los cuatro pasos son obligatorios. Omitir el tercero produce exactamente el síntoma
que ya se vivió en este proyecto: permisos correctos en la tabla de roles y una UI que
se comporta como si no existieran.

## Architecture Decisions — Fase B (frontend)

**D6 — Borrador del asistente en IndexedDB, no en `localStorage`.**
`dexie` ya es dependencia. El paso 2 admite archivos, y `localStorage` sólo almacena
cadenas: serializar imágenes a base64 infla el tamaño ~33 % contra una cuota de ~5 MB.
IndexedDB guarda `Blob` de forma nativa.

```ts
interface ReportDraft {
  id: 'current';
  step: 1 | 2 | 3 | 4;
  basic: { title: string; priority: string; description: string };
  categorization: { categoryId: string | null; files: Blob[] };
  location: { lat: number; lng: number } | null;
  updatedAt: number;
}
```

El borrador se descarta sólo tras un envío exitoso. Un fallo de red lo conserva —
perder cuatro pasos con fotos por un error del servidor sería el peor momento posible
para descartarlo.

**D7 — Actualización optimista sólo en «Seguir».**
Seguir se refleja al instante y se revierte si el servidor falla: es reversible y de
consecuencia nula. Corroborar **espera la confirmación** del servidor, porque es
irreversible (D2) y mostrarlo como hecho antes de tiempo dejaría al usuario creyendo
que testimonió algo que no se registró.

**D8 — Agrupación de marcadores en cliente, con umbral declarado.**
`leaflet.markercluster` sobre el conjunto devuelto por el mapa. Válido mientras el
volumen se mantenga en el orden de unos miles de marcadores. **Por encima de ~5.000
incidencias con coordenadas**, la agrupación debe pasar al servidor (agregación por
celda o por zona). Se declara el umbral para que el cambio sea una decisión y no un
descubrimiento en producción.

**D9 — El asistente primero, dentro de la Fase B.**
Orden interno: asistente → feed → mapa. El asistente se apoya en el backend de
incidencias que F3 ya ejercitó, y valida geolocalización y compresión de imágenes;
el feed y el mapa reutilizan ambas. Empezar por el feed obligaría a resolver esas dos
piezas en la pantalla con más superficie.

**D10 — El asistente se construye sobre `citizen-report`, que F1 enrutó.**
El componente existe y era código muerto. Se amplía a los cuatro pasos en lugar de
crear otro y dejar el anterior huérfano por segunda vez.

**D11 — Selector de categorías jerárquico con estado indeterminado.**
El mock 09-01 muestra padres con hijos parcialmente marcados. Marcar el padre
selecciona todos sus hijos; marcar sólo algunos deja el padre en indeterminado. Es
tri-estado, no booleano, y el detalle importa porque un checkbox binario mentiría
sobre la selección.

## Data Flow

**Feed**: `GET /api/incidents?feed=true&status=&categories=&page=` → tarjetas
→ desplazamiento al final → página siguiente concatenada
→ «Seguir»: estado optimista → `POST /followers` → confirmación o reversión
→ «Yo también reporto»: `POST /corroborations` → 2xx: control deshabilitado ·
409: se resincroniza el estado

**Asistente**: cada paso escribe en el borrador de IndexedDB → paso 3 usa
`geolocation.service.ts` (fallback manual) → paso 4 comprime los archivos con
`image-compressor.service.ts`, `POST /api/incidents`, sube las imágenes, descarta el
borrador y navega al detalle

**Mapa**: `GET /api/map/incidents?status=&priority=&category=` → capa Leaflet →
agrupación en cliente (D8) → marcador activado → resumen con enlace al detalle

## File Changes

### Fase A — backend

| Archivo | Acción | Descripción |
|---|---|---|
| `database/migrations/00XX_incident_social.sql` | Nuevo (D1/D5) | Tablas `incident_followers` e `incident_corroborations`; permisos en catálogo, `roles.permissions` y `users.permissions` |
| `database/MIGRATION_LOG.md` | Modificar | Entrada de la migración nueva |
| `backend/src/modules/incidents/entities/incident-follower.entity.ts` | Nuevo | Entidad TypeORM con `UNIQUE (incident_id, user_id)` |
| `backend/src/modules/incidents/entities/incident-corroboration.entity.ts` | Nuevo | Ídem, con `comment` nullable |
| `backend/src/modules/incidents/incident-social.service.ts` | Nuevo (D2) | Seguir/dejar de seguir idempotente; corroborar con 409 |
| `backend/src/modules/incidents/incident-social.controller.ts` | Nuevo | Endpoints de seguidores y corroboraciones |
| `backend/src/modules/incidents/incidents.service.ts` | Modificar (D4) | Conteos y banderas por agregación en listado y detalle |
| `backend/src/modules/notifications/…` | Modificar | Notificar a seguidores al cambiar de estado, excluyendo al causante |

### Fase B — frontend

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/app/core/services/incident-social.service.ts` | Nuevo | Seguir, dejar de seguir, corroborar |
| `frontend/src/app/core/services/report-draft.service.ts` | Nuevo (D6) | Borrador en IndexedDB vía dexie |
| `frontend/src/app/features/citizen/feed/` | Nuevo | Feed con composer, tarjetas y panel lateral |
| `frontend/src/app/features/citizen/feed/components/incident-card/` | Nuevo (D7) | Tarjeta con acciones sociales |
| `frontend/src/app/features/citizen/feed/components/feed-filters/` | Nuevo (D11) | Chips de estado y árbol de categorías tri-estado |
| `frontend/src/app/features/citizen-report/` | Modificar (D10) | Se amplía a asistente de cuatro pasos |
| `frontend/src/app/features/citizen/map/` | Nuevo (D8) | Mapa a pantalla completa con agrupación y filtros |
| `frontend/src/app/shared/components/map-picker/` | Nuevo | Mapa reutilizable de selección de punto (paso 3 y detalle de F3) |
| `frontend/package.json` | Modificar | `+ leaflet.markercluster`, `+ @types/leaflet.markercluster`; regenerar lock |
| `frontend/src/app/app.routes.ts` | Modificar | Sustituye los placeholders `/inicio` y `/mapa`; `/reportar` pasa al asistente |

## Redis Caching Strategy

- `perm:v3:uid:*` DEBE invalidarse tras aplicar la migración de la Fase A (D5). Es un
  paso de despliegue, no opcional.
- Los conteos del feed **no** se cachean en esta fase: cambian con cada interacción y
  el desfase se vería inmediatamente en la propia tarjeta que el usuario acaba de pulsar.

## Testing Strategy

**Fase A** (`strict_tdd: true` — test primero):
- Unit: seguir idempotente; corroborar duplicado ⇒ 409; autor corroborando ⇒ 409;
  dejar de seguir algo no seguido ⇒ éxito sin cambio de conteo.
- Integración (Testcontainers, Postgres real): `UNIQUE` se respeta bajo peticiones
  concurrentes; los conteos agregados coinciden con las filas.
- **Test de consultas**: el listado paginado resuelve conteos sin N+1. Se afirma sobre
  el número de consultas emitidas, no sobre el tiempo de respuesta.
- Migración: aplicada sobre una base con usuarios preexistentes, `users.permissions`
  de esos usuarios contiene los permisos nuevos. Es la aserción que cubre D5, y el
  fallo que ya ocurrió una vez en este proyecto.
- e2e: `npm run test:e2e` desde `backend/`.

**Fase B**:
- Unit de `report-draft.service.ts`: persiste y restaura incluyendo `Blob`; se descarta
  sólo tras envío exitoso; **sobrevive a un fallo de envío**.
- Unit de acciones sociales: seguir revierte el estado optimista ante error; corroborar
  no aplica optimismo (D7).
- Unit del árbol de categorías: padre marcado selecciona hijos; selección parcial deja
  el padre indeterminado.
- Componentes: fin del feed muestra el estado final y no un cargador perpetuo; permiso
  de ubicación denegado no bloquea el paso 3.
- e2e: (a) asistente completo de cuatro pasos hasta ver la incidencia creada;
  (b) recargar a medio asistente y comprobar la restauración; (c) seguir y corroborar
  desde el feed y verificar la persistencia tras recargar.

## Open Questions

- **Q1** — ¿«Seguir» debe generar notificación en cada cambio de estado o sólo en la
  resolución? Se implementa en todos los cambios (comportamiento más informativo) y se
  anota; reducirlo es una condición en el observador.
- **Q2** — ¿Debe el asistente encolar el envío sin conexión? `offline-sync.service.ts`
  existe y `dexie`/`idb` están instalados, pero ningún mock lo define. Fuera de alcance
  aquí; el borrador de D6 deja el terreno preparado.
- **Q3** — El mock 09-01 muestra las coordenadas en crudo, muy destacadas, en cada
  tarjeta. ¿Es intencional o marcador de posición de una dirección legible? Se
  implementa tal cual el mock y se anota.
