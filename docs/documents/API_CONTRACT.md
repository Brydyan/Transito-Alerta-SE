# Contrato de la API — Transito Alerta SE

Estado: **Fase 1 y 2 implementadas y verificadas contra la app corriendo.**
Última verificación: 2026-08-15.

Este documento describe la API **tal como está implementada**, no como se
planificó. Donde `docs/tasks/T1_NESTJS_MODULES.md` y este archivo difieran,
manda este.

---

## Convenciones

| | |
|---|---|
| Prefijo | `/api` |
| Claves JSON | `snake_case`, en request **y** response |
| Coordenadas | `lat` / `lng` — nunca `latitude` / `longitude` |
| Timestamps | ISO 8601 UTC |
| IDs | UUID v4 |
| Auth | `Authorization: Bearer <access_token>` |

El `snake_case` de las respuestas lo garantiza `SnakeCaseResponseInterceptor`,
registrado globalmente. Las entidades son camelCase en TypeScript y las
columnas snake_case en la base; la conversión ocurre en la frontera HTTP.

`lat`/`lng` en vez de `latitude`/`longitude` para coincidir con Leaflet
(`L.latLng`, `.lat`, `.lng`). La API del navegador (`position.coords`) sí usa
`latitude`/`longitude` — hay que mapear al enviar:

```ts
{ lat: position.coords.latitude, lng: position.coords.longitude }
```

### Códigos de error

| Código | Cuándo |
|---|---|
| 400 | validación del DTO — el body lista cada campo inválido |
| 401 | sin token, token inválido o expirado |
| 403 | autenticado pero sin la permission requerida |
| 404 | recurso inexistente |
| 409 | conflicto (ej. incidente ya asignado) |
| 429 | rate limit por `device_uuid` |

---

## Permisos

Formato: `"ACTION resource"` — exactamente así, con un espacio.
Acciones: `READ`, `CREATE`, `UPDATE`, `DELETE`, `ASSIGN`.

El login devuelve la lista completa del usuario. El frontend la usa para
ocultar navegación y botones; el backend la vuelve a verificar en cada
request y responde 403 si falta.

**Techo del dispositivo anónimo** — leer y aportar, nunca modificar:

```json
["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]
```

Sin `UPDATE`, `DELETE` ni `ASSIGN`, ni siquiera sobre sus propias filas.

---

## Auth

### `POST /api/auth/login`

Registra el dispositivo si es la primera vez. No requiere token.

```json
{ "device_uuid": "anonymous" }
```

```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "permissions": ["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]
}
```

Access token 15m, refresh 7d.

### `POST /api/auth/refresh`

```json
{ "refresh_token": "eyJhbGci..." }
```
→ `{ "access_token": "eyJhbGci..." }`

### `GET /api/auth/me` 🔒

```json
{
  "user_id": "d1bd484a-e4cf-405b-85eb-6796194a21cc",
  "device_uuid": "anonymous",
  "permissions": ["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]
}
```

### `POST /api/auth/logout` 🔒 → 200

---

## Incidents

### `POST /api/incidents` 🔒 `CREATE incidents`

```json
{
  "title": "Choque en via principal",
  "description": "Dos vehiculos, via bloqueada",
  "lat": -2.2,
  "lng": -80.5,
  "priority": "high"
}
```

`priority`: `low` | `medium` | `high` | `critical` (opcional, default `medium`).
`description` opcional.

```json
{
  "id": "732c5369-ec2e-4e90-bead-2e9f1227c8fb",
  "title": "Choque en via principal",
  "description": "Dos vehiculos, via bloqueada",
  "status": "pending",
  "priority": "high",
  "citizen_id": "d1bd484a-e4cf-405b-85eb-6796194a21cc",
  "assigned_to": null,
  "zone_id": "8f14e45f-ceea-4c1f-8f2c-000000000024",
  "geofence_matched": true,
  "lat": -2.2,
  "lng": -80.5,
  "created_at": "2026-08-15T16:30:17.435Z",
  "updated_at": "2026-08-15T16:30:17.435Z"
}
```

**Fuera de jurisdicción no se rechaza.** Un reporte que cae fuera de toda zona
registrada se acepta igual, con `zone_id: null` y `geofence_matched: false`.
En una emergencia, perder el reporte es peor que registrarlo fuera de zona.
El frontend puede señalarlo, pero no debe bloquear el envío.

### `GET /api/incidents` 🔒 `READ incidents`
### `GET /api/incidents/:id` 🔒 `READ incidents`

### `PATCH /api/incidents/:id/status` 🔒 `UPDATE incidents`

```json
{ "status": "in_progress" }
```

Ciclo permitido: `pending` → `in_progress` → `resolved`. Una transición fuera
de ese orden se rechaza.

---

## Comments

### `POST /api/comments` 🔒 `CREATE comments`

```json
{ "incident_id": "732c5369-...", "content": "Yo pase por ahi, sigue bloqueado" }
```

El contenido se sanitiza antes de persistir — las etiquetas `<script>` se
eliminan. Lo que vuelve es el texto ya limpio, no el original.

```json
{
  "id": "688d2e29-f4d9-437a-977a-9265e3a2845b",
  "content": "Yo pase por ahi, sigue bloqueado",
  "incident_id": "732c5369-...",
  "user_id": "d1bd484a-...",
  "created_at": "2026-08-15T16:43:58.565Z"
}
```

### `GET /api/comments/incident/:incidentId` 🔒 `READ comments`

Array, orden ascendente por `created_at`.

### `DELETE /api/comments/:id` 🔒 `DELETE comments`

Solo el autor. Un tercero recibe 403.

---

## Users

| Endpoint | Permiso |
|---|---|
| `GET /api/users/me` 🔒 | — |
| `PATCH /api/users/me` 🔒 | — |
| `POST /api/users/me/avatar` 🔒 | — (multipart) |
| `GET /api/users` 🔒 | `READ users` |

`PATCH /api/users/me` acepta `first_name`, `last_name`.

> ⚠️ La subida de avatar hoy es un stub (`AvatarStorageService`), no sube a S3
> de verdad. Pendiente antes de producción.

---

## Assignments

### `POST /api/assignments` 🔒 `ASSIGN assignments`

```json
{ "incident_id": "732c5369-...", "operator_id": "a1b2c3d4-...", "role": "primary" }
```

`role`: `primary` | `secondary` (opcional). Un incidente admite una sola
asignación activa — un segundo intento da 409.

### `DELETE /api/assignments/:id` 🔒 `ASSIGN assignments`
### `GET /api/assignments/incident/:incidentId` 🔒 `READ assignments`

---

## Tiempo real (WebSocket)

Namespace `/incidents`, socket.io. Autenticación con el mismo access token al
conectar.

Salas, multidimensionales y validadas contra los permisos al unirse:

| Sala | Alcance |
|---|---|
| `geo:{zone_id}` | incidentes de una zona |
| `org:{org_id}` | de una organización |
| `incident:{id}` | un incidente puntual |
| `user:{id}` | dirigido a un usuario |

**No hay salas por rol.** Con 25k usuarios, una sala de "todos los admins"
significa que cada admin recibe cada incidente de la provincia.

Eventos emitidos: `incident:created`, `incident:assigned`, `comment:added`,
`status:changed`.

Detrás hay Redis Streams (`incidents:events`, DB 0) para el event sourcing
entre instancias, más `socket.io-redis-adapter` para que un mensaje entregado
a una instancia alcance a los clientes conectados a las otras. Los dos
mecanismos son necesarios; con uno solo el broadcast se rompe.

---

## Health

`GET /api/health` — sin auth.

```json
{ "status": "ok", "timestamp": "2026-08-15T16:21:21.857Z" }
```

---

## Pendientes conocidos

- Subida de avatar a S3 es un stub.
- Retención (`MAXLEN`) del stream `incidents:events` sin definir.
- Módulos de Fase 3 (Roles, Organizations, Notifications, StatusHistory,
  Categories, Locations, Invitations, Mail, Sessions, Menus) sin implementar.
