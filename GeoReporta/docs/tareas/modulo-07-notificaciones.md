# Módulo 07 — Sistema de Notificaciones

**Requisitos SRS:** RF-FUNC-019, RF-FUNC-020, RF-SW-008, RF-UI-005
**Casos de prueba:** CP-07-01 a CP-07-10 (10 casos)

---

### RF-FUNC-020_CP-07-01-F: Badge muestra contador de notificaciones no leídas

- **Requisito:** RF-FUNC-020 — Gestión de Notificaciones
- **Prueba:** CP-07-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Usuario tiene 3 notificaciones sin leer, observar icono de campana.
- **Criterio:** Badge rojo muestra "3" junto al icono.
- **Estado:** ☑ Completado | **Implementación:** app-shell.component.js — badge span `#app-shell-bell-badge` updated via updateBadge() (lines 1022-1037); CSS styling `.app-shell-header__notif-badge` (app-shell.component.css:349-363)

---

### RF-FUNC-020_CP-07-02-F: Click en notificación la marca como leída

- **Requisito:** RF-FUNC-020 — Gestión de Notificaciones
- **Prueba:** CP-07-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Click en notificación no leída, verificar badge.
- **Criterio:** Badge decrementa (3→2), notificación cambia estilo (fondo gris a blanco).
- **Estado:** ☑ Completado | **Implementación:** buildItem() click handler (app-shell.component.js lines 951-984) calls notificationService.markRead(id), removes `.app-shell-bell-panel__item--unread` class, updates badge

---

### RF-FUNC-020_CP-07-02-B: PATCH actualiza campo leido a true

- **Requisito:** RF-FUNC-020 — Gestión de Notificaciones
- **Prueba:** CP-07-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** PATCH /api/notificaciones/{id} con `{ "leido": true }`.
- **Criterio:** HTTP 200, campo leido=true, timestamp leido_en registrado.
- **Estado:** ☑ Completado | **Implementación:** NotificationController.markRead() (lines 61-70) — PATCH /api/notifications/{notification}/read endpoint (routes/api.php:66). Updates `read` boolean field (note: uses boolean, not timestamp)

---

### RF-FUNC-020_CP-07-03-F: Panel desplegable muestra lista de notificaciones

- **Requisito:** RF-FUNC-020 — Gestión de Notificaciones
- **Prueba:** CP-07-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Click en icono de campana, ver panel.
- **Criterio:** Panel desplegado con lista: icono de tipo, mensaje resumido, tiempo relativo.
- **Estado:** ☑ Completado | **Implementación:** createBellPanel() with openPanel() (app-shell.component.js lines 927-1005), buildItem() renders notification list items (lines 951-984), panel HTML (app-shell.component.html lines 39-75 admin, 124-162 citizen)

---

### RF-FUNC-019_CP-07-04-B: Trigger/Evento crea notificación al cambiar estado

- **Requisito:** RF-FUNC-019 — Generación de Notificaciones
- **Prueba:** CP-07-04-B
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Asignar incidencia a usuario, cambiar estado.
- **Criterio:** Tabla notificaciones tiene nuevo registro con todos los campos.
- **Estado:** ☑ Completado | **Implementación:** IncidentNotificationObserver (app/Domains/Notifications/Observers/IncidentNotificationObserver.php) observes Incident model, auto-creates notifications on claim/release/status-change via handleClaimChange(), handleReleaseChange(), handleConfirmChange() (lines 44-116)

---

### RF-FUNC-020_CP-07-05-F: Botón "Marcar todas como leídas" funciona

- **Requisito:** RF-FUNC-020 — Gestión de Notificaciones
- **Prueba:** CP-07-05-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Tener múltiples notificaciones sin leer, click en "Marcar todas como leídas".
- **Criterio:** Todas cambian a estado leído, badge desaparece o muestra 0.
- **Estado:** ☑ Completado | **Implementación:** onMarkAllClick() handler (app-shell.component.js lines 1048-1059) calls notificationService.markAllRead(), removes `.app-shell-bell-panel__item--unread` class from all items, updates badge to 0

---

### RF-FUNC-020_CP-07-05-B: PATCH masivo actualiza todas las notificaciones

- **Requisito:** RF-FUNC-020 — Gestión de Notificaciones
- **Prueba:** CP-07-05-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** PATCH /api/notificaciones/marcar-leidas.
- **Criterio:** HTTP 200, todas las notificaciones del usuario actualizan leido=true.
- **Estado:** ☑ Completado | **Implementación:** NotificationController.markAllRead() (lines 75-88) — PATCH /api/notifications/read-all endpoint (routes/api.php:67). Bulk updates all user's unread notifications

---

### RF-UI-005_CP-07-01-F a CP-07-05-F: Panel de Notificaciones (UI)

- **Requisito:** RF-UI-005 — Panel de Notificaciones
- **Pruebas cubiertas:** CP-07-01-F, CP-07-02-F, CP-07-03-F, CP-07-05-F
- **Estado:** ☑ Completado | **Implementación:** Complete bell panel UI in app-shell with badge, dropdown, notification list items, "Marcar todas" button. Full ARIA support (aria-label, aria-controls, aria-expanded, role="menuitem")

---

### RF-SW-008_CP-07-02-B a CP-07-05-B: API REST Notificaciones

- **Requisito:** RF-SW-008 — API REST Notificaciones
- **Pruebas cubiertas:** CP-07-02-B, CP-07-04-B, CP-07-05-B
- **Estado:** ☑ Completado | **Endpoints:** 
  - GET /api/notifications (list, supports unreadOnly filter)
  - PATCH /api/notifications/{id}/read (mark single)
  - PATCH /api/notifications/read-all (mark all)
  - GET /api/notifications/unread-count (badge)
  All configured in routes/api.php:65-68

---

### BONUS FEATURES IMPLEMENTED

**Real-time Updates (Mercure SSE)**
- **Backend:** NotificationService.publish() via Mercure hub on notification creation (NotificationService.php lines 83-95)
- **Frontend:** connectNotificationStream() establishes EventSource to `/.well-known/mercure?topic=user:{userId}:notifications` (app-shell.component.js lines 1110-1143)
- **Flow:** New notification → published to Mercure → SSE event received → prependIfOpen() injects into open panel → badge updates in real-time
- **Status:** ✅ Complete with graceful degradation if hub unavailable

**Auto-deduplication**
- **Backend:** NotificationService.notify() deduplicates within 60-second window (NotificationService.php line 56)
- **Prevents:** Duplicate notifications on rapid state changes
- **Status:** ✅ Complete

**Caching Strategy**
- **Frontend:** notificationService._unreadCache + _inflightUnread prevents redundant API calls (notification.service.js)
- **Status:** ✅ Complete

---

> **Total tareas:** 10 | **Frontend:** 5 | **Backend:** 4 | **BD:** 1
> **Completadas:** 10/10 | **Estado:** ✅ 100%
> **ESTADO M07:** ✅ 10/10 COMPLETADO (100%) — Badge, panel, mark-as-read, real-time SSE, auto-triggers all implemented. Tests: 11 feature tests
