# 05 — Permisos (CRUD)

**Tipo:** Feature (backend stub)
**Severidad:** 🟠 Media
**Backend:** ✅ Diseño cambiado (sin CRUD de catálogo) · **Frontend:** ✅ UI de asignación rol↔permiso (verificado 07/07/2026)

> ✅ **COMPLETADO con cambio de diseño (verificado 07/07/2026)**
> - **Se adoptó la opción alternativa del propio doc** (sección "Decisión previa"): el catálogo de permisos queda definido en seed (estructural, no editable por UI), y la UI solo permite **asignar permisos a un rol**.
> - `backend/routes/api.php:66` muestra `GET /api/permissions` (solo lectura del catálogo) + `Route::put('roles/{role}/permissions', ...)` para sincronizar los permisos de un rol.
> - El `apiResource` completo de permissions fue removido. Esto es coherente: los permisos son estructurales, no datos de usuario.
> - Frontend: la UI de roles permite marcar/desmarcar permisos por checklist, que es exactamente el flujo recomendado.
> - Ver [`00-INDEX.md`](./00-INDEX.md).

## Problema

Existe un `apiResource` de permisos con controller **stub** (todos los métodos
devuelven `['data' => []]`) y ninguna UI para administrarlos.

Los permisos SÍ se usan en el sistema (los Gates dinámicos en `AppServiceProvider`
se construyen desde la tabla `permissions`), pero no hay forma de gestionarlos
desde la aplicación: solo por seed/migración.

## Estado actual

**Backend (stub):**
- `Route::apiResource('permissions', PermissionController::class)` dentro del grupo `jwt`.
- `PermissionController` — `index/store/show/update/destroy` devuelven `['data' => []]`.
- La tabla `permissions` sí existe y se consume:
  - `AppServiceProvider::boot()` genera un Gate por cada permiso: `{resource}.{action}`.
  - `role_permission` liga roles con permisos.

**Frontend:** sin componente, sin ruta, sin ítem de menú.

## Alcance

### Backend
- [ ] Implementar `PermissionController` real contra el modelo `Permission`:
  - `index` — listar permisos (paginado).
  - `store` — crear (`resource`, `action`).
  - `show` / `update` / `destroy`.
- [ ] Policy: solo `admin_sistema` gestiona permisos.
- [ ] Validación: evitar duplicados `resource+action`.

### Frontend
- [ ] Ruta `/permisos` (o dentro de `/configuracion`) restringida a `admin_sistema`.
- [ ] Componentes index + form (seguir el patrón de `configuracion/organizaciones`).
- [ ] Servicio que consuma el `apiResource`.
- [ ] Ítem de menú con `data-ln="admin_sistema"` (o vía menú dinámico, ver doc 01).

## Decisión previa

Evaluar si administrar permisos por UI es deseable. Los permisos suelen ser
**estructurales** (definidos por los devs, no por usuarios finales). Alternativa:
gestionar solo la **asignación** rol↔permiso por UI, y dejar el catálogo de
permisos en seed. Definir antes de construir.

## Criterios de aceptación

- El `apiResource` devuelve/persiste datos reales, no `[]`.
- Solo `admin_sistema` accede.
- No se pueden crear permisos duplicados.

## Archivos afectados

- `backend/app/Domains/Permissions/**`
- `frontend/app/configuracion/permisos/**` (nuevo)
- `frontend/app/app.js`
