# Proposal: F6 — Nuevo Usuario (formulario de alta)

**Change**: `2026-09-08-f6-new-user-form`
**Scope**: Frontend (Angular)
**Source of truth**: `docs/mock/03-02-nuevo-usuario.png`
**Date**: 2026-09-08

---

## Intent

Construir la pantalla `/app/admin/usuarios/new` (ruta que ya existe en
`app.routes.ts:111-118` pero hoy carga un `UserFormComponent` genérico que
**no coincide con el mock 03-02**) siguiendo el layout del mock:

- Breadcrumb: `GESTIÓN > USUARIOS > NUEVO REGISTRO`
- Título: **"Nuevo Usuario"** + subtítulo descriptivo
- Acciones top-right: `Cancelar` (con `×`) + `Guardar Usuario` (purple CTA)
- Formulario en **dos columnas**:
  - **Izquierda** — Perfil de Usuario (foto) + Datos Personales (nombre,
    apellido, email, teléfono) + Asignación de Entidad (organización)
  - **Derecha** — Tarjeta de Vista Previa del Rol (dropdown + ACCESO A /
    SIN ACCESO) + Alcance Territorial / Jurisdicción (cantón, parroquia,
    zona — **disables F7**) + Configuración de Cuenta e Invitación
    (toggle, estado, canal)

La pantalla reemplaza el destino del botón **"+ Nuevo usuario"** del
listado de usuarios (`users-list.component.html:6-14`) y del
routerLink `['/app/admin/usuarios', 'nuevo']`, que **hoy está roto**:
la ruta es `new` (inglés, en `app.routes.ts:112`) pero el botón usa
`nuevo` (español). Sin la ruta, el botón aterriza en el `path: '**'` y
muestra un 404. **Este change corrige ese wiring** (D-frontend-1).

---

## Scope

### In Scope

- Componente `NewUserFormComponent` standalone, ruta `admin/users/new`
  lo monta. El `UserFormComponent` actual (modo edición) sigue
  funcionando bajo `:id/edit` — no se rompe.
- 6 secciones del mock, en el mismo orden y agrupación (izq/der).
- Subida de foto de perfil (JPG/PNG/WEBP, max 2MB) — preview local con
  `FileReader.readAsDataURL` antes del submit.
- Dropdowns dependientes de los endpoints ya existentes:
  - Roles → `GET /api/users/form-data` (o `GET /api/roles`, fallback)
  - Organizaciones → `GET /api/users/form-data`
- Vista previa dinámica de permisos del rol (ACCESO A / SIN ACCESO)
  derivada de la respuesta cacheada de roles.
- Toggle "Envío de invitación" — si está ON, tras crear el usuario se
  llama a `POST /api/admin/users/invite` (endpoint ya existente de
  T3.6). Si está OFF, no se envía correo.
- Estado inicial fijo en `Activo` (F6 simplification — `adminCreate`
  siempre crea con `is_active = true`); canal fijo en
  `Correo Electrónico` (SMS fuera de scope).
- Validación frontend (form-control): nombre, apellido, email son
  required; teléfono opcional con `pattern` libre; email con
  `Validators.email` + verificación de unicidad opcional.
- Cancelar descarta cambios y navega a `/app/admin/usuarios`; Guardar
  hace `POST /api/users` (snake_case) → `PATCH /api/users/:id/avatar`
  (si hay foto) → toast success → recarga del listado.

### Out of Scope (F7+)

- **Geolocalización** (cantón/parroquia/zona) — la BD no tiene
  columnas; los inputs del mock se renderizan **deshabilitados** con
  tooltip "Disponible en F7".
- **Canal SMS** — sólo "Correo Electrónico".
- **Estado inicial configurable** — siempre `Activo` en F6; el toggle
  del mock es decorativo.
- **Edición de usuario existente** — la ruta `:id/edit` mantiene el
  `UserFormComponent` actual; el rediseño de edición es un change
  aparte (F6.5.2).
- **Permisos granulares por usuario** — sólo se heredan del rol (sin
  `directPermissions` en el alta, a diferencia del edit).
- **Detección automática de geolocalización** (mock sólo muestra
  inputs, no auto-detect).

---

## Capabilities

### New Capabilities

- `admin-user-creation-form`: formulario de alta de usuario con
  preview de rol e invitación opcional. Vive sólo en frontend (no
  modifica capabilities de backend — los endpoints `POST /api/users` y
  `POST /api/admin/users/invite` ya existen).

### Modified Capabilities

- `user-management` (`openspec/specs/user-management/...`) — el destino
  del botón "+ Nuevo usuario" cambia de "ruta rota
  `/admin/usuarios/nuevo`" a "ruta real `/admin/usuarios/new` con
  `NewUserFormComponent`".

---

## Approach (resumen)

1. Crear `NewUserFormComponent` standalone con signals (sin
   `FormGroup` para mantener paridad con `UsersListComponent`; los
   formularios chicos del proyecto usan signals, ver
   `roles.component.ts` y `users-list.component.ts`).
2. Renderizar 6 sub-secciones como bloques `@if` en el template — sin
   sub-componentes, mockup = 1 pantalla. Cada bloque es un `@if`
   separado para mantener orden claro.
3. Carga de foto: `FileReader.readAsDataURL` → preview local; al
   submit, primero `POST /api/users` (sin archivo), después
   `PATCH /api/users/:id/avatar` (multipart) si hay foto.
4. Vista previa de rol: `roleOptions().find(r => r.id ===
   formData().roleId)?.permissions ?? []` — sin request adicional, los
   roles ya vienen en `GET /form-data`.
5. Toggle de invitación: `if (formData().sendInvitation) { await
   inviteService.invite(email); }` — mismo patrón que el resto del
   módulo.
6. Validación: input handlers con `Validators` por campo; el botón
   Guardar se deshabilita si `formData()` no es válido.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/app/features/admin/users/users-list.component.html` | Modified | Cambiar `[routerLink]="['/app/admin/usuarios', 'nuevo']"` por `['/app/admin/usuarios', 'new']` (línea 10). Es el fix del wiring roto. |
| `frontend/src/app/features/admin/users/new-user-form/` | New | Componente, template, css, spec. |
| `frontend/src/app/features/admin/users/users-list.component.ts` | Modified | `RouterLink` ya está importado (línea 12). Sin cambios funcionales adicionales. |
| `frontend/src/app/app.routes.ts` | Modified (opcional) | Re-mapear la ruta `new` para que apunte a `NewUserFormComponent` en vez de `UserFormComponent`. Mantener `:id/edit` apuntando al actual. |

> **Decisión**: la ruta `new` debe cargar `NewUserFormComponent` (mock
> 03-02), no `UserFormComponent`. Edit sigue usando el actual.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| El `UserFormComponent` actual se rompe si cambio la ruta `new` | Low | `UserFormComponent` se mantiene bajo `:id/edit`; es independiente de `new`. Tests del edit siguen verdes. |
| DTO backend no acepta `phone` (sólo email + nombres + role_id + organization_id) | Med | D-frontend-2: el frontend envía `phone` y el backend lo acepta (change back complementario `2026-09-08-f6-new-user-form` lo agrega al DTO). Si backend no acepta, `POST /users` falla con 400 → toast "El teléfono no es válido" y reintento. |
| El preview de permisos depende de que `GET /form-data` (o `GET /roles`) traiga `permissions` por rol | Med | `GET /roles` hoy devuelve `{id, name}` solamente (T3.6). Usar `GET /roles/:id/permissions` on-demand cuando el admin selecciona un rol, o cachear la lista completa con permisos en un `getRolesWithPermissions()`. **Decisión**: on-demand al seleccionar (D-frontend-5) para no inflar el bundle inicial. |
| El botón de "Envío de invitación" llama a `POST /admin/users/invite` con `roleId` y `organizationId` — el toggle no especifica estos | Low | Al enviar invitación, usar el `roleId` y `organizationId` ya seleccionados en el form. Si están vacíos, el endpoint rechaza (validación backend existente). |
| Las pruebas E2E fallan porque el flujo es nuevo | Low | Crear `e2e/new-user-form.e2e.ts` con specs S1-S5 (mock-driven); skipean local sin `BASE_URL+E2E_PASSWORD` (patrón D4). |

---

## Rollback Plan

- Revertir `app.routes.ts:114-117` para que `new` vuelva a apuntar a
  `UserFormComponent`.
- Borrar `frontend/src/app/features/admin/users/new-user-form/`.
- Revertir el `routerLink` del botón en
  `users-list.component.html:10` a `nuevo` (deja el wiring como
  estaba — roto, pero sin el fix introducido por este change).
- Sin cambios en backend → no requiere rollback server-side.

---

## Dependencies

- **Backend**: `POST /api/users` (T5.6, ya existe) y
  `POST /api/admin/users/invite` (T3.6, ya existe).
- **Backend complementario**: este change tiene un par en
  `openspec/changes/back/2026-09-08-f6-new-user-form/` que agrega
  `phone` al `AdminCreateUserDto` y hereda los permisos del rol al
  crear (D1/D2 del design back). Sin ese change, el frontend puede
  operar pero los datos de `phone` no se persisten.
- **Componentes UI**: tokens de F0 (`ui-page-header`, `ui-icon`,
  `ui-button`, `ui-badge`, `ui-table` no aplica). Sin primitivos
  nuevos.

---

## Success Criteria

- [ ] Click en "+ Nuevo usuario" navega a `/app/admin/usuarios/new`
      y muestra el layout del mock 03-02 (no un 404, no el
      `UserFormComponent` viejo).
- [ ] Foto de perfil (JPG/PNG/WEBP ≤ 2MB) se sube y previsualiza
      antes del submit.
- [ ] Dropdown de rol se puebla desde `GET /form-data`; al
      seleccionar uno, la tarjeta derecha muestra dos cards
      (ACCESO A verde / SIN ACCESO rojo) con los permisos del rol.
- [ ] Dropdown de organización se puebla desde `GET /form-data`.
- [ ] Validación frontend bloquea el submit si `nombre`, `apellido`
      o `email` están vacíos / email inválido.
- [ ] `POST /api/users` se envía con `email`, `first_name`,
      `last_name`, `phone`, `role_id`, `organization_id` (snake_case
      por el `SnakeCaseResponseInterceptor`).
- [ ] Si el toggle está ON, tras crear el usuario se llama
      `POST /api/admin/users/invite` con ese email. Si OFF, no.
- [ ] Si hay foto seleccionada, tras `POST /users` se llama
      `PATCH /api/users/:id/avatar` con FormData.
- [ ] En éxito: toast "Usuario creado", navegación a
      `/app/admin/usuarios`, recarga del listado.
- [ ] En error: toast específico, modal permanece abierto para
      reintento.
- [ ] Cancelar descarta cambios y vuelve al listado sin crear.
- [ ] Tests: 1 unit suite del componente + 1 e2e suite con specs
      S1–S5; `pnpm test` verde, `pnpm run build` verde.
- [ ] Lint: 0 errores nuevos.

---

## Out of Scope (recordatorio)

Los inputs de **Cantón/Parroquia**, **Zona/Sector**, **Estado
Inicial** (toggle Activo/Inactivo) y **Canal de Notificaciones** se
renderizan del mock pero **deshabilitados** (atributo `disabled` +
`title` con tooltip "Disponible en F7"). F7 decidirá si habilitarlos
y con qué fuente de datos.
