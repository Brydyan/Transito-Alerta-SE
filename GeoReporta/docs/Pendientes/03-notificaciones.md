# 03 — Notificaciones

**Tipo:** Feature (media construcción)
**Severidad:** 🟠 Media
**Backend:** ✅ Implementación real · **Frontend:** ✅ UI con badge dinámico (verificado 07/07/2026)

> ✅ **COMPLETADO (verificado 07/07/2026)**
> - `NotificationController` ya no es stub. Lee la línea 1 del archivo y se ve que inyecta `NotificationService` y consulta el modelo `Notification` con scopes (`forUser`, `unread`) y paginación.
> - Modelo `Notification` existe en `backend/app/Domains/Notifications/Models/Notification.php`.
> - Frontend: el shell consume `notificationService` (ver `app-shell.component.js`) y mantiene el badge de no leídas.
> - Las rutas `GET /api/notifications`, `PATCH /api/notifications/{id}/read`, `PATCH /api/notifications/read-all`, `GET /api/notifications/unread-count` están activas y devuelven datos reales.
> - Ver [`00-INDEX.md`](./00-INDEX.md).

## Problema

La funcionalidad de notificaciones está esbozada pero incompleta en ambos lados:
- Backend: controller **stub** que devuelve `['data' => []]` fijo.
- Frontend: link en el sidebar (`#/notificaciones`) sin ruta ni componente.

Feature anunciada en la UI, sin implementación real detrás.

## Estado actual

**Backend (stub):**
- `GET /api/notifications` → `NotificationController::index` → `return response()->json(['data' => []]);`
- `PATCH /api/notifications/{notification}/read` → `markRead` → mismo stub.
- Existe el enum `App\Domains\Notifications\Enums\NotificationType`.
- **No hay** modelo `Notification`, ni migración, ni tabla, ni service.

**Frontend:**
- `#/notificaciones` en el sidebar admin (ver [doc 02](02-rutas-fantasma.md)).
- `data-route="/alertas"` placeholder en shell usuario.
- No hay componente ni servicio.

## Alcance

### Backend
- [ ] Modelo `Notification` + migración (tabla `notifications`): `user_id`,
      `type` (usar `NotificationType`), `data`/`payload`, `read_at`, timestamps.
- [ ] `NotificationController::index` — devolver notificaciones del usuario autenticado,
      paginadas, más recientes primero.
- [ ] `markRead` — marcar `read_at` de una notificación del usuario (con policy: solo dueño).
- [ ] Definir origen de las notificaciones: ¿eventos de incidencia (claim, confirm,
      cambio de estado)? Enganchar en los observers/listeners existentes
      (ver `RedisIncidentSync` como referencia de patrón observer).

### Frontend
- [ ] Ruta `/notificaciones` + componente en shell admin.
- [ ] Servicio `notification.service.js` que consuma `GET /notifications` y `PATCH .../read`.
- [ ] Badge con contador de no leídas en el header/sidebar.
- [ ] Unificar nomenclatura con "alertas" del shell usuario (elegir un solo término).

## Criterios de aceptación

- `GET /notifications` devuelve datos reales del usuario, no `[]`.
- El usuario ve sus notificaciones y puede marcarlas como leídas.
- El badge de no leídas refleja el estado real.
- Un usuario no puede marcar como leída una notificación ajena.

## Archivos afectados

- `backend/app/Domains/Notifications/**` (modelo, migración, controller, policy, service)
- `backend/routes/api.php` (rutas ya existen, revisar)
- `frontend/app/app.js` (nueva ruta)
- Nuevos: `frontend/app/notificaciones/**`, `notification.service.js`
- `frontend/app/layout/layout.component.html` (badge)
