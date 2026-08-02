# Pendientes de implementación

Backlog de inconsistencias y funcionalidades faltantes detectadas en la auditoría
de rutas, componentes y endpoints (frontend SPA + backend Laravel).

Cada documento es una unidad de trabajo independiente con contexto, estado actual,
alcance y criterios de aceptación.

## Prioridad

| # | Documento | Tipo | Severidad | Estado backend | Estado frontend |
| --- | ----------- | ------ | ----------- | ---------------- | ----------------- |
| 01 | [Menú dinámico](01-menu-dinamico.md) | Integración | 🔴 Alta | ✅ Implementado | ✅ Migrado a `/menus/my` |
| 02 | [Rutas fantasma (reportes / mapa)](02-rutas-fantasma.md) | Bug UX | 🔴 Alta | — | ✅ Resuelto por PR #43 |
| 03 | [Notificaciones](03-notificaciones.md) | Feature | 🟠 Media | ✅ Real (service + scopes) | ✅ UI con badge dinámico |
| 04 | [Guard de `/feed/:id`](04-feed-detail-guard.md) | Seguridad | 🟡 Revisar | — | ✅ `authGuard` aplicado |
| 05 | [Permisos (CRUD)](05-permisos.md) | Feature | 🟠 Media | ✅ Diseño cambiado | ✅ UI de roles con checklist |
| 06 | [Asignaciones](06-asignaciones.md) | Feature | 🟠 Media | ✅ Stack zombie borrado | ✅ N/A (no aplica) |
| 07 | [Consolidación de shells](07-consolidacion-shells.md) | Deuda técnica | 🟡 Baja | — | ✅ Completado por PR #43 |
| 08 | [Vista de mapa georreferenciado](08-vista-mapa.md) | **Feature** | **🟠 Media-Alta** | ✅ Datos listos | ❌ Solo captura, falta vista |
| 09 | [Registro de usuarios + Login con Google](09-registro-y-google-auth.md) | Feature | 🟠 Media | ✅ Implementado | ✅ Tabs login/registro + botón Google |
| 10 | [Enforcement de permisos en rutas frontend](10-enforcement-permisos-frontend.md) | Seguridad | 🟡 Media | ⚠️ IDOR comentarios cerrado + `/permissions` gateado; Incidents/Notifications/OperatorLocation aún sin auditar | ✅ Guard real por permiso, verificado en vivo |

## Leyenda

- ✅ Implementado y funcional
- ⚠️ Existe pero es stub / incompleto
- ❌ No existe

## Estado del backlog (2026-07-05)

Los 7 ítems del backlog original fueron trabajados en una sola sesión. Estado:

- ✅ **01** — Menú dinámico migrado al shell admin (consume `GET /menus/my`).
- ⚠️ **02** — Parcial: las rutas fantasma en el sidebar admin ya no rompen
  porque el menú es dinámico. Faltan las del sidebar citizen (`/mapa`,
  `/alertas` siguen como placeholders). Queda para una iteración futura.
- ✅ **03** — Notificaciones implementadas (backend completo + UI con badge).
- ✅ **04** — `authGuard` agregado a `/feed/:id`.
- ✅ **05** — CRUD de permissions borrado; CRUD de roles + asignación de
  permisos por UI implementado en su lugar.
- ✅ **06** — Stack de assignments borrado (era zombie); nueva migración
  `drop_assignments_table` para limpiar la tabla huérfana.
- ✅ **07** — Ya estaba completado por el PR #43 antes de iniciar este
  backlog. Doc cerrado sin acción.

## Próximas iteraciones sugeridas

1. ~~Limpiar las rutas fantasma del sidebar citizen (`/mapa`, `/alertas`).~~ ✅
   Resuelto por la consolidación a `app-shell` (PR #43): las rutas no se sirven.
2. **Implementar la vista de mapa georreferenciado** (mención histórica del
   doc 02). PostGIS ya está habilitado (`incidents.geom` Point) y el
   `RedisIncidentSync` guarda el `geom` como GeoJSON — falta el componente
   de UI que renderice esto en un mapa interactivo. Sugerido crear
   `08-vista-mapa.md` cuando se aborde.
3. ~~Revisar si el sidebar citizen debe migrar al menú dinámico (hoy sigue
   estático).~~ ✅ El sidebar citizen ya usa el mismo `app-shell` con modo
   `'citizen'` (`body[data-role="citizen"]`). El menú dinámico aplica a
   ambos roles.

## Pendiente genuino (al 07/07/2026)

- **Vista de mapa georreferenciado** — feature, no bug. Es el único ítem que
  rescato del backlog original que sigue vigente. Todo lo demás está cerrado.

## Auditoría cruzada con backlog del vault (2026-07-16)

El vault `publicaciones- incidencias.md` (bóveda personal del usuario) lista 8
features como "publicaciones pendientes". Cruzadas con el estado real del repo
(después del PR #43 y los docs de este `Pendientes/`) el resultado es:

| Item del vault                                | Estado real                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Filtrado de Incidencias por Operador       | Distinto al doc 06 (descartado). Requiere spec nueva (sin propuesta todavía).                |
| 2. Sistema de Notificaciones (SSE)            | ✅ Cubierto por `03-notificaciones.md` (verificado 07/07/2026), con gap ver abajo.           |
| 3. Subida de Imágenes en Comentarios          | ❌ Pendiente real — sin spec todavía.                                                        |
| 4. Reestructuración de Menú en Tablas         | ✅ Cubierto por `07-consolidacion-shells.md` + PR #43.                                       |
| 5. Subida de Imagen de Perfil                 | ❌ Pendiente real — depende de `custom-jwt-auth-sessions` F3+F4.                             |
| 6. Eliminación del Campo Permisos en Roles    | ✅ Cubierto por `05-permisos.md` + `10-enforcement-permisos-frontend.md` (cambio de diseño). |
| 7. Consolidación de Filtros en Feed           | ✅ Cubierto por PR #43 + menú dinámico (`01-menu-dinamico.md`).                              |
| 8. Mejora Visual de Detalles de Incidencia    | ⚠️ Parcial: `08-vista-mapa.md` cubre vista mapa, no feed visual.                             |

**Gap identificado** (origen del change `notificaciones-asignacion-responsable/`):
el doc `03-notificaciones.md` quedó con un checkbox pendiente. La asignación
formal (responsable/apoyo vía `Assignment`) no dispara `Notification`. Sólo el
flujo `claim` / `release` / `confirm` lo hace (vía `IncidentNotificationObserver`).
El enum `NotificationType::Assignment` ya existe en
`backend/app/Domains/Notifications/Enums/NotificationType.php` pero no se usa.
