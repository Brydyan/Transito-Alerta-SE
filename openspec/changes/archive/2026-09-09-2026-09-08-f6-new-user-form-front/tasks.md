# Tasks: F6 — Nuevo Usuario (frontend)

> Cambios atómicos de 1-2 h cada uno, agrupados por fase. Las
> desviaciones se anotan inline; el detalle completo vivirá en
> `apply-progress.md` al implementar.

---

## Fase 1: Setup (scaffolding)

- [x] **N.1.1** Crear carpeta
  `frontend/src/app/features/admin/users/new-user-form/`
- [x] **N.1.2** Generar `new-user-form.component.ts` (standalone,
  selector `app-new-user-form`, `OnPush`, con los imports base
  `CommonModule`, `Router`)
- [x] **N.1.3** Generar `new-user-form.component.html` con la
  estructura del mock (breadcrumb, header, 2 columnas) y los 6
  bloques `@if` placeholder (vacíos, sólo headings)
- [x] **N.1.4** Generar `new-user-form.component.css` con tokens
  de F0 (`bg-app-surface`, `border-border-subtle`, etc.) — el
  layout de 2 columnas es `grid-cols-1 lg:grid-cols-2` con
  `gap-6`
- [x] **N.1.5** Generar `new-user-form.component.spec.ts` con
  setup mínimo: `expect(component).toBeTruthy()`

---

## Fase 2: Models & Services

- [x] **N.2.1** Extender `models/user.interface.ts` con:
  - `NewUserFormData` (interface del estado del form)
  - `RoleOption { id, name, permissions? }`
  - `OrganizationOption { id, name }` (reusar `Organization`
    existente)
  - `RolePermissionsView { access: string[]; noAccess: string[] }`
- [x] **N.2.2** Modificar `services/users.service.ts`:
  - `createUserJson(payload)` — enviar JSON (no FormData) a
    `POST /api/users`. **Desviación documentada**: no se refactorizó
    `createUser` (FormData) porque `UserFormComponent` lo sigue
    usando; se agregó un método nuevo `createUserJson` para no
    romper el edit path. Ver `apply-progress.md` § "Desviación 1".
  - Agregar `getRolePermissions(id): Observable<string[]>` que
    llama `GET /api/roles/{id}/permissions`
  - Agregar `getFormData()`, `uploadAvatar()`, `getPermissionsCatalog()`
- [x] **N.2.3** Crear `services/invitations.service.ts` (servicio
  dedicado, paralelo a `UsersModule` backend):
  - `invite(payload: { email, roleId, organizationId })` que llama
    `POST /api/admin/users/invite`
- [x] **N.2.4** Unit tests de los nuevos métodos del service
  (mock `HttpClient` con `HttpTestingController`):
  - `createUserJson` envía POST con JSON, sin FormData
  - `createUserJson` retorna el response del backend
  - `getRolePermissions` envía GET al id correcto
  - `getFormData`, `uploadAvatar`, `getPermissionsCatalog` cubiertos
  - `invite` envía POST con payload correcto (con y sin organization_id)

---

## Fase 3: Componente — Estado y Lookups

- [x] **N.3.1** En `new-user-form.component.ts`, declarar las
  signals:
  - `formData: WritableSignal<NewUserFormData>` con defaults
    (`email: ''`, `firstName: ''`, etc., `sendInvitation: true`,
    `initialStatus: 'activo'`, `notificationChannel: 'email'`)
  - `roles: WritableSignal<RoleOption[]>`
  - `organizations: WritableSignal<OrganizationOption[]>`
  - `selectedRolePermissions: WritableSignal<RolePermissionsView>`
  - `avatarPreview: WritableSignal<string | null>`
  - `pendingAvatar: WritableSignal<File | null>`
  - `isLoadingLookups: WritableSignal<boolean>`
  - `isSaving: WritableSignal<boolean>`
  - `errorMessage: WritableSignal<string | null>`
- [x] **N.3.2** Implementar `ngOnInit()`:
  - Cargar roles y orgs vía `GET /api/users/form-data` (reusar
    `UsersService.getFormData()`)
  - Si falla, set `errorMessage` y `isLoadingLookups = false`
- [x] **N.3.3** Computed `isFormValid()`:
  - `firstName.length >= 2 && lastName.length >= 2 && email.match(/^[^@]+@[^@]+$/)`
  - Si `roleId in ['admin_org', 'operador_org']`, también
    `organizationId !== null`
- [x] **N.3.4** Computed `selectedRolePermissions()`:
  - Si `formData().roleId` es null → `{ access: [], noAccess: [] }`
  - Si hay rol, devuelve el cache del `selectedRolePermissions`
    signal (poblado por `N.4.x`)

---

## Fase 4: Componente — Role Preview

- [x] **N.4.1** Implementar `onRoleChange(roleId: string)`:
  - Actualiza `formData.roleId`
  - Si `roleId` no es null, llama
    `usersService.getRolePermissions(roleId).subscribe(perms => …)`
  - Construye el `RolePermissionsView`:
    - `access = perms.slice(0, 4)`
    - `noAccess` = permisos del catálogo que el rol NO tiene,
      slice 0-2
- [x] **N.4.2** Para el catálogo de permisos, agregar
  `getPermissionsCatalog()` en `UsersService` que llama
  `GET /api/permissions?limit=100` (ya existe). Cachear el
  catálogo en un signal privado del componente.
- [x] **N.4.3** Template: la tarjeta "Tarjeta de Vista Previa del
  Rol" muestra:
  - Empty state si `formData().roleId === null`:
    "Selecciona un rol para ver sus permisos"
  - Si hay rol: dos cards internos
    - "ACCESO A" (border verde) con `access`
    - "SIN ACCESO" (border rojo) con `noAccess` o
      "Sin permisos restringidos" si vacío
- [x] **N.4.4** Test unit del handler `onRoleChange`:
  - Verifica que llama a `getRolePermissions` con el id correcto
  - Verifica que actualiza `selectedRolePermissions` con la
    respuesta

---

## Fase 5: Componente — Avatar Upload

- [x] **N.5.1** Implementar `onAvatarSelect(event: Event)`:
  - Lee `event.target.files[0]`
  - Valida MIME (`image/jpeg|image/png|image/webp`) y size
    (≤ 2MB); si falla, setea `errorMessage`
  - `FileReader.readAsDataURL(file)` → setea `avatarPreview` con
    el data URL
  - Guarda el `File` en `pendingAvatar`
- [x] **N.5.2** Template:
  - El círculo de preview muestra `avatarPreview()` o el icono
    default `user` (ui-icon)
  - Botón "Subir foto de perfil" abajo (purple, text-sm)
  - Hint "JPG, PNG, WEBP. MÁX. 2MB"
- [x] **N.5.3** Test unit:
  - JPG válido → `pendingAvatar` se setea (preview async, no
    testeable en jsdom — ver `apply-progress.md`)
  - PDF rechazado → `errorMessage` se setea
  - Archivo > 2MB → `errorMessage` se setea

---

## Fase 6: Componente — Form Submit

- [x] **N.6.1** Implementar `onSubmit()`:
  - Si `!isFormValid()`, no hace nada (botón ya deshabilitado,
    pero defensivo)
  - Set `isSaving = true`, limpia `errorMessage`
  - Llama `usersService.createUserJson(snakeCasePayload)`:
    - Construye payload: `{ email, first_name, last_name,
      phone, role_id, organization_id }` con `null` para los
      vacíos
  - Si el response es 201 y `pendingAvatar() !== null`:
    - Llama `usersService.uploadAvatar(userId,
      pendingAvatar())` (PATCH multipart)
    - Si falla, toast warning (no bloqueante)
  - Si `formData().sendInvitation`:
    - Llama `invitationsService.invite({ email, roleId,
      organizationId })`
    - Si falla (4xx/5xx), toast warning "Usuario creado, pero la
      invitación no se envió"
  - Toast success final, navega a `/app/admin/usuarios`
- [x] **N.6.2** Implementar `onCancel()`:
  - Si el form está "limpio" (todos los campos = defaults),
    navega directo
  - Si hay cambios, abre `ConfirmDialogService.confirm({...})`;
    confirmar → navega, cancelar → cierra el diálogo
- [x] **N.6.3** Test unit de `onSubmit` con mocks:
  - Caso happy path: createUserJson + uploadAvatar + invite + navega
  - Caso createUserJson 409 (email duplicado) → toast, no navega
  - Caso createUserJson 403 → toast "sin permiso", no navega
  - Caso createUserJson OK, uploadAvatar 500 → toast warning + navega
  - Caso createUserJson OK, invite 409 (email con cuenta previa) →
    toast warning + navega
  - Caso `sendInvitation = false` → no llama a invite
  - Caso sin avatar → no llama a uploadAvatar
  - Caso form inválido → no llama a createUserJson
- [x] **N.6.4** Test unit de `onCancel`:
  - Form limpio → navega directo
  - Form sucio + confirmar → navega
  - Form sucio + cancelar → no navega
  - isFormDirty: defaults NO dirty, campos editados SÍ dirty,
    pendingAvatar seteado SÍ dirty

---

## Fase 7: Template final

- [x] **N.7.1** Render del header con breadcrumb y título
  - `<ui-page-header kicker="GESTIÓN > USUARIOS > NUEVO REGISTRO"
    title="Nuevo Usuario" subtitle="...">`
  - Botones en `page-header-actions`: Cancelar (secundario) +
    Guardar Usuario (primario, deshabilitado si `!isFormValid()`)
- [x] **N.7.2** Render de la columna izquierda:
  - **Sección 1: Perfil de Usuario** — heading con icono
    `user-circle`, subtítulo "Identificación básica y contacto",
    círculo de preview + botón "Subir foto de perfil"
  - **Sección 2: Datos Personales** — heading con icono `user`,
    grid 2-col: Nombre*, Apellido*, Email Corporativo*,
    Teléfono (sin asterisk)
  - **Sección 3: Asignación de Entidad** — heading con icono
    `building`, dropdown Organización Pertinente*, hint
    "Obligatorio si el rol corresponde a Administrador u Operador
    de Organización."
- [x] **N.7.3** Render de la columna derecha:
  - **Sección 4: Tarjeta de Vista Previa del Rol** — heading
    con icono `shield`, dropdown "Asignar rol...", dos cards
    ACCESO A / SIN ACCESO con los permisos
  - **Sección 5: Alcance Territorial / Jurisdicción** — heading
    con icono `map-pin`, grid 2-col: Cantón/Parroquia (select
    disabled, placeholder "Seleccionar lugar...") + Zona/Sector
    (input disabled, placeholder "Ej: Sector Norte / Centro")
  - **Sección 6: Configuración de Cuenta e Invitación** — heading
    con icono `bell`, card con toggle "Envío de invitación" (ON
    por default) + subtítulo "Enviar credenciales temporales por
    correo electrónico", grid 2-col: Estado inicial (select
    disabled = "Activo") + Canal de notificaciones preferido
    (select disabled = "Correo Electrónico")

---

## Fase 8: Routing & wiring

- [x] **N.8.1** Modificar `app.routes.ts:114-117` para que la
  ruta `new` cargue `NewUserFormComponent` en vez de
  `UserFormComponent`
- [x] **N.8.2** Modificar
  `users-list.component.html:10`: cambiar el `routerLink` de
  `nuevo` a `new`
- [x] **N.8.3** Verificar que el edit (`/admin/usuarios/:id/edit`)
  sigue cargando `UserFormComponent` (sin cambios)
- [x] **N.8.4** Smoke test: navegar a `/admin/usuarios`, click
  en "+ Nuevo usuario", verificar que llega a
  `/admin/usuarios/new` con la pantalla del mock
  (e2e S1 cubre el load; S2 cubre el flujo end-to-end)

---

## Fase 9: Tests & verificación

- [x] **N.9.1** Unit tests completos del componente (30 tests,
  excede los 12+ pedidos):
  - Inicialización carga lookups (2 tests: S1.1 ok + S1.2 error)
  - Dropdown de rol vacío → preview vacío
  - Selección de rol → fetch de permisos + render correcto
  - Foto válida → preview (validación síncrona + pendingAvatar)
  - Foto inválida → error (2 tests: PDF + size)
  - Submit happy path
  - Submit con error 409, 403
  - Submit con foto + invitación ON
  - Submit con foto + invitación OFF
  - Submit sin foto + invitación ON
  - Submit con avatar fail → warning toast
  - Submit con invite fail → warning toast
  - Cancelar form limpio
  - Cancelar form sucio (con confirmación, confirma y cancela)
  - Computed `isFormValid` con cada combinación (7 tests)
  - isFormDirty con defaults, edits, pendingAvatar
- [x] **N.9.2** E2E suite
  `frontend/e2e/new-user-form.e2e.ts` con 5 specs (S1-S5):
  - S1: Pantalla carga, dropdowns poblados
  - S2: Submit happy path crea usuario
  - S3: Submit con email duplicado muestra error
  - S4: Foto se sube
  - S5: Cancelar descarta
  - Skipean local sin `BASE_URL+E2E_PASSWORD` (D4, mismo patrón
    que `users-list.e2e.ts`)
- [x] **N.9.3** `rtk pnpm run lint` — 0 errores nuevos
  (1 error pre-existente en `dashboard.component.ts:11` no relacionado)
- [x] **N.9.4** `rtk pnpm test` — 543/546 verdes (+37 vs baseline
  506/509; los 3 rojos son los mismos pre-existentes — ver
  `apply-progress.md` § "Pre-existing failures")
- [x] **N.9.5** `rtk pnpm run build` — sin errores
  (new-user-form chunk = 22.69 kB / 6.11 kB gz)
- [x] **N.9.6** Regresión: `UsersListComponent` y
  `UserFormComponent` (edit) sin cambios funcionales
  (`:id/edit` sigue cargando `UserFormComponent`; el `createUser`
  legacy de `UsersService` queda intacto para no romper el create
  path deprecado del form viejo)

---

## Total Story Points

~16 pts (1 componente nuevo, 1 service extendido, 1 ruta, 1
fix de wiring, sin sub-componentes, sin migraciones).

---

## Dependencias externas

- **Back complementario**: `back/2026-09-08-f6-new-user-form/`
  (paralelo) — agrega `phone` al `AdminCreateUserDto` y hereda
  permisos del rol al crear. Si ese change no se aplica primero,
  el frontend puede omitir `phone` del payload como fallback (1
  línea en el service). El `phone` se agregará cuando el back
  esté listo, sin re-trabajo del componente.
