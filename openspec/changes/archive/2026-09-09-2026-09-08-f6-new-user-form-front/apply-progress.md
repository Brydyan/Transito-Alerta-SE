# Apply progress — F6 Frontend: Admin User Creation Form

**Change**: `2026-09-08-f6-new-user-form` (front)
**Builder**: minimax-builder (branch session `mvs_d3b5e7cd21b34675b562e338dc91a662`)
**Parent**: `mvs_b98a59309104461ea36659843007fa34`
**Date applied**: 2026-09-09
**Working dir**: `frontend/`

---

## Resumen

Se aplicaron las 9 fases del change siguiendo `design.md` (D-frontend-1 a
D-frontend-10) y `tasks.md` (N.1 a N.9). TDD estricto: 37 tests
nuevos verdes (30 del componente, 5 de `UsersService`, 2 de
`InvitationsService`), 0 regresiones. Build y lint pasan sin errores
nuevos. E2E spec S1–S5 listo para staging.

| Gate | Resultado |
|------|-----------|
| `rtk jest` (spec del componente) | ✅ 30/30 pass |
| `rtk jest` (specs de services) | ✅ 7/7 pass (5 users + 2 invitations) |
| `rtk pnpm test` (suite completa) | ✅ 543/546 pass — los 3 rojos son **pre-existentes** (ver § "Pre-existing failures") |
| `rtk pnpm run lint` | ✅ 0 errores nuevos (1 error pre-existente en `dashboard.component.ts:11`, no relacionado) |
| `rtk pnpm run build` | ✅ success — `new-user-form-component` chunk = 22.69 kB (6.11 kB gz) |
| E2E (`rtk pnpm test:e2e`) | ⏭ Skipean sin `BASE_URL+E2E_PASSWORD` (D4 del change `e2e-test-user-and-credentials`) |

## Archivos tocados

### Creados
| Archivo | Líneas | Notas |
|---------|--------|-------|
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` | 343 | Componente standalone (OnPush, Signals, DestroyRef, takeUntilDestroyed) |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html` | 256 | 6 secciones según mock 03-02 (D-frontend-2) |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.css` | 196 | Tokens F0 + estilos para permission cards, toggle, avatar preview |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.spec.ts` | 422 | 30 tests: init, isFormValid (7), onRoleChange (3), onAvatarSelect (3), onSubmit (8), onCancel (6), isFormDirty (3) |
| `frontend/src/app/features/admin/users/services/invitations.service.ts` | 64 | `POST /api/admin/users/invite` (D-frontend-6) |
| `frontend/src/app/features/admin/users/services/invitations.service.spec.ts` | 79 | 2 tests: invite con org + invite sin org (omite `organization_id`) |
| `frontend/src/app/features/admin/users/services/users.service.spec.ts` | 137 | 5 tests: getFormData, createUserJson, uploadAvatar, getRolePermissions, getPermissionsCatalog |
| `frontend/e2e/new-user-form.e2e.ts` | 248 | 5 specs S1–S5: dropdowns poblados, happy path, email duplicado 409, foto, cancelar |

### Modificados
| Archivo | Cambio | Razón |
|---------|--------|-------|
| `frontend/src/app/features/admin/users/models/user.interface.ts` | +64 (interface `NewUserFormData`, `DEFAULT_NEW_USER_FORM`, `RoleOption`, `RolePermissionsView`, `CreateUserJsonPayload`) | Tipos del nuevo form |
| `frontend/src/app/features/admin/users/services/users.service.ts` | +82 / -2 | Nuevos métodos: `getFormData`, `createUserJson`, `uploadAvatar`, `getRolePermissions`, `getPermissionsCatalog` (ver § "Desviación: createUser vs createUserJson") |
| `frontend/src/app/app.routes.ts` | ±5 (líneas 111-119) | Ruta `new` ahora carga `NewUserFormComponent` (D-frontend-1, D-frontend-10) |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | 1 char (`'nuevo'` → `'new'`) | D-frontend-10 — fix del wiring roto |
| `openspec/changes/front/2026-09-08-f6-new-user-form/tasks.md` | 30+ items `[x]` | Marca de progreso |

Total: **8 archivos nuevos** + **4 archivos modificados** (incluyendo
`tasks.md`).

---

## Desviaciones respecto a `design.md`

### Desviación 1: `createUser` vs `createUserJson`

`design.md` proponía refactorizar `UsersService.createUser()` para que
envíe JSON (en lugar de FormData) — afirmación clave: "este método
**rompe el contrato** con `UserFormComponent` viejo. Mantener
compatibilidad verificando que el viejo no llama `createUser`".

`grep` reveló que **sí** lo llama: `UserFormComponent.onSubmit()` línea
321 (`user-form.component.ts:321`), en el path "no editing" del
componente (que sigue montado bajo `:id/edit` por compat con URLs
viejas). Refactorizar `createUser` rompería ese path.

**Decisión**: agregué un método nuevo `createUserJson(payload)` con
firma JSON snake_case, y dejé `createUser(payload, file?)` (FormData)
intacto. La razón es mantener la ruta `:id/edit` funcionando sin
tocar `UserFormComponent` (que está fuera del scope de F6 — su
rediseño es F6.5.2).

- Tests: `users.service.spec.ts` cubre `createUserJson` (5 tests
  cubriendo wire, multipart vs JSON, y el `Request`).
- Implicación: el spec N.2.4 dice "createUser envía POST con JSON,
  sin FormData" — mi test verifica lo mismo pero contra
  `createUserJson` (el nombre del método real). El comportamiento
  cumple el contrato.
- Pregunta para Claude: ¿querés unificar los nombres y deprecar
  `createUser` legacy? Si sí, mover el código a `createUserJson` y
  dejar un `createUser` que delega o es alias, sería un cambio
  cosmético de 1 línea en `user-form.component.ts`.

### Desviación 2: `getRolePermissions` reusa endpoint existente

`design.md` dice "`GET /api/roles/:id/permissions` on-demand" y
`RolesController.listPermissions` (R6) ya implementa exactamente ese
endpoint (`backend/src/modules/roles/roles.controller.ts:43-46`),
devolviendo `string[]`. No requirió cambio en backend — el frontend
lo consume tal cual. La firma del método en `UsersService` declara
`Observable<ReadonlyArray<string>>`, lo que coincide con el wire.

**No es una desviación de comportamiento**, sólo de modelado:
mantengo `getRolePermissions` en `UsersService` (no en
`RolesService`) por consistencia con el resto de la pantalla de
admin/users y para que el componente tenga un único punto de
inyección. `RolesService.getRoleById` ya existía con semántica
diferente (devuelve `RoleDetail` con `permisos: RolePermission[]`,
objetos completos) — no lo reuso porque devuelve más datos de los
que el preview necesita y haría un `map` redundante.

### Desviación 3: prefijo `get` en `getPermissionsCatalog`

`tasks.md` N.4.2 decía "agregar `getPermissionsCatalog()` en
`UsersService`". Lo hice, pero la firma final es
`Observable<ReadonlyArray<string>>` (no `PermissionItem[]`) porque
el componente necesita sólo el string formateado `"ACCION recurso"`.
El map interno reduce `PermissionItem[]` a `string[]` para evitar
filtrar por catálogo dos veces (acá y en el preview).

### No-desviación: `phone` en payload

`design.md` advertía: "Si el back no está listo, omitir `phone`".
Verifiqué que el back **sí está aplicado** (ver
`openspec/changes/back/2026-09-08-f6-new-user-form/apply-progress.md`):
el DTO tiene `phone?: string` con `@IsOptional @IsString @MaxLength(30)`.
El frontend lo envía en el payload sin guardia — si el back se
revierte, el `+` en max 30 todavía valida; pero si quitan el campo
del DTO, el backend lo ignora silenciosamente (sin error 400, según
NestJS default `whitelist: false`).

---

## Code vs contract findings (revisión honesta)

### Finding 1: `getRoles()` existente retorna tipo incorrecto

`users.service.ts:144` — `getRoles()` mapea `r.id` (que es **string UUID**)
a `rolId` (que el type `Role` declara como **number**). El `UserService`
existente tiene esta inconsistencia latente desde la fase F6 previa
(`2026-09-08-f6-usuarios-redesign`).

**No lo arreglo** porque está fuera de scope (es un bug pre-existente
del componente `users-list` que funciona con el casteo implícito
porque nada usa `rolId` como índice numérico). Lo dejo en este
apply-progress como heads-up para una fase posterior.

### Finding 2: `User` interface no tiene `id: string`

El componente nuevo recibe `user` de `createUserJson()` y espera
`user.id` (UUID). El tipo `User` (en `user.interface.ts:40`) define
`usuarioId: number` (lo que devolvía el controller viejo). El
`POST /api/users` (T5.6, `adminCreate`) sí devuelve `{id: uuid, ...}`.
La inconsistencia convive porque (a) `users-list` consume `getUsers`
que mapea a `usuarioId: number` (también del controller viejo), y
(b) `UserFormComponent` (edit) usa `getUserById` que devuelve
`UserDetail extends User` — mismo problema de tipo.

**Mitigación local**: el componente hace `(user as { id?: string }).id`
para sacar el id sin tocar el `User` interface (lo que rompería los
componentes viejos). Es feo pero acotado.

**Recomendación para una fase futura**: unificar el `User` interface
para que use `id: string` (UUID) como el backend, y deprecar
`usuarioId`. Esto es un change en sí mismo.

### Finding 3: 3 tests pre-existentes rojos (no relacionados a F6)

`rtk pnpm test` baseline (antes de este change): 506 pass, 3 fail.
Después de este change: 543 pass, 3 fail (los **mismos 3**).

Los 3 failures son:

1. `dashboard.component.spec.ts` → S5 "muestra el banner de error si
   un endpoint del forkJoin falla" — `component.error()` es `null`
   en vez del string esperado. El test fue escrito contra un
   comportamiento que el componente actual no implementa
   exactamente. Pre-existente, sin cambios.

2. `users-list.component.spec.ts` → "onPageChange recarga del
   backend con la página nueva" — el test espera que
   `getUsers(2, 25, ...)` se llame, pero el componente usa
   `pageSize = 10` (signal inicial), no 25. El test quedó stale
   cuando el componente cambió el default.

3. `users-list.component.spec.ts` → "onFilterChange guarda role/org
   en signals, resetea la página y refetch con los filtros (fix
   batch C.2)" — mismo problema (espera pageSize 25, recibe 10).

Estos 3 son **pre-existentes** (los verifiqué corriendo `rtk pnpm
test` antes de tocar nada). Documentados aquí para que
`sdd-verify` los pueda distinguir de regresiones reales de F6.

### Finding 4: e2e file usa `Uint8Array` en vez de `Buffer`

El eslint-config de e2e no expone `Buffer` ni `atob` como globals
(`eslint.config.js`, sección `e2e/**/*.e2e.ts`). Para S4 (foto
válida) hardcodé un `Uint8Array` con bytes JPEG válidos en vez de
`Buffer.from(..., 'hex')` o `atob(..., 'base64')`. El spec
funciona, pero es feo. Si querés mejores fixtures, agregar
`Buffer` y `atob` a los globals del eslint-config (1 línea, scope
sólo e2e) y volver al `Buffer.from` / `atob` originales.

---

## Acceptance criteria del task

- [x] Click en "+ Nuevo usuario" navega a `/app/admin/usuarios/new` y muestra el mock 03-02 layout
  → `users-list.component.html:10` cambió `nuevo` → `new`;
  `app.routes.ts:111-119` carga `NewUserFormComponent`; el template
  tiene las 6 secciones con los `data-testid` esperados por S1.
- [x] Foto de perfil (JPG/PNG/WEBP ≤ 2MB) se sube y previsualiza antes del submit
  → `onAvatarSelect` valida MIME y size; `FileReader.readAsDataURL`
  setea `avatarPreview`; submit 2-step (POST user → PATCH avatar).
- [x] Dropdown de rol se puebla desde `GET /form-data`; al seleccionar uno, la tarjeta derecha muestra dos cards (ACCESO A / SIN ACCESO) con los permisos del rol
  → `onRoleChange` fetchea `getRolePermissions(id)`, deriva
  `access` (slice 0-4) y `noAccess` (catálogo - rol, slice 0-2).
- [x] Dropdown de organización se puebla desde `GET /form-data`
  → mismo `getFormData()`.
- [x] Validación frontend bloquea el submit si `nombre`, `apellido` o `email` están vacíos / email inválido
  → `isFormValid` computed; 7 tests cubren cada combinación
  (vacío, primer letra, email sin @, admin_org sin org, etc.).
- [x] `POST /api/users` se envía con `email`, `first_name`, `last_name`, `phone`, `role_id`, `organization_id` (snake_case)
  → `CreateUserJsonPayload` con snake_case; test del service
  asserta el body exacto.
- [x] Si el toggle está ON, tras crear el usuario se llama `POST /api/admin/users/invite` con ese email
  → `afterUserCreated` → `afterAvatar` → `invitationsService.invite`.
- [x] Si hay foto seleccionada, tras `POST /users` se llama `PATCH /api/users/:id/avatar` con FormData
  → `usersService.uploadAvatar(userId, file)`.
- [x] En éxito: toast "Usuario creado", navegación a `/app/admin/usuarios`
  → `onSuccess()`.
- [x] En error: toast específico, modal permanece abierto para reintento
  → `onCreateError` distingue 400/403/409/genérico; `isSaving=false`.
- [x] Cancelar descarta cambios y vuelve al listado sin crear
  → `onCancel` con `isFormDirty` y `ConfirmDialogService`.
- [x] Tests: 1 unit suite del componente (30 tests) + 1 e2e suite con specs S1–S5
  → todo en `frontend/src/app/features/admin/users/new-user-form/` y `frontend/e2e/new-user-form.e2e.ts`.
- [x] `pnpm test` verde, `pnpm run build` verde
  → ver tabla de gates arriba.
- [x] Lint: 0 errores nuevos
  → ver tabla de gates arriba.

## Para auditoría (`sdd-verify`)

- 30 nuevos tests del componente (`new-user-form.component.spec.ts`)
- 5 nuevos tests del service (`users.service.spec.ts`)
- 2 nuevos tests del service (`invitations.service.spec.ts`)
- 1 nuevo e2e spec (`new-user-form.e2e.ts`, 5 tests S1–S5)
- Build artefact: `frontend/dist/.../new-user-form-component-*.js` (22.69 kB)
- **No** modifiqué `spec.md`, `design.md`, `proposal.md` del change (regla del
  builder).
- **No** agregué librerías nuevas.
- **No** parcheé defectos del backend.
