# Design: F6 — Nuevo Usuario (formulario de alta)

> **Mock**: `docs/mock/03-02-nuevo-usuario.png` (visto 2026-09-08).
> Layout en dos columnas con breadcrumb `GESTIÓN > USUARIOS > NUEVO
> REGISTRO`. **No es un modal**: la sidebar queda visible. Esto
> contradice el D1 del draft previo, que proponía modal — ver
> **D-frontend-1**.

---

## Decisions

### D-frontend-1: Página, no modal

**Decisión**: Ruta `/app/admin/usuarios/new` carga el nuevo
`NewUserFormComponent`. La sidebar y el header global quedan
visibles. El breadcrumb aparece en la parte superior del contenido.

**Por qué**: El mock 03-02 muestra la sidebar (`Dashboard`, `Lista
de Incidencias`, `Gestión > Usuarios`, etc.) intacta. Un modal
destruiría ese layout. Además, la ruta `new` ya existe en
`app.routes.ts:111-118` y está **rota** (el botón la llama
`/admin/usuarios/nuevo` en vez de `new`) — la pantalla es la
oportunidad de arreglarlo.

**Rechazado**: Modal bloqueante (`ui-modal`) — desalineado con el
mock, no permitiría breadcrumb, requeriría un portal overlay.

---

### D-frontend-2: Sub-componentes NO, secciones inline

**Decisión**: El template es un único archivo con 6 bloques `@if`
(`profile-section`, `personal-data-section`, `entity-assignment`,
`role-preview-card`, `geographic-location`, `account-config`). Sin
sub-componentes separados.

```
new-user-form/
├── new-user-form.component.ts
├── new-user-form.component.html
├── new-user-form.component.css
└── new-user-form.component.spec.ts
```

**Por qué**: El formulario entero cabe en una pantalla con scroll
moderado. Sub-componentes introducirían 6 inputs/outputs y
degradarían la legibilidad sin reducir la complejidad (no hay
reuso previsto: el edit sigue usando `UserFormComponent`).

**Rechazado**: 6 sub-componentes — peso del contrato sin beneficio
de composición.

---

### D-frontend-3: State con Signals (no FormGroup)

**Decisión**: Estado del formulario con `signal()`. El form completo
es un único `signal<NewUserFormData>`, los derivados son `computed`
(`isFormValid`, `selectedRolePermissions`, etc.).

```typescript
type NewUserFormData = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  organizationId: string | null;
  roleId: string | null;
  sendInvitation: boolean;
  // Campos fijos (F6 simplification):
  initialStatus: 'activo';       // siempre 'activo'
  notificationChannel: 'email';  // siempre 'email'
};

readonly formData = signal<NewUserFormData>({ /* defaults */ });
readonly isLoading = signal(false);
readonly isSaving = signal(false);
readonly errorMessage = signal<string | null>(null);

readonly roles = signal<RoleOption[]>([]);
readonly organizations = signal<OrganizationOption[]>([]);
readonly selectedRolePermissions = computed<{
  access: string[]; noAccess: string[];
}>(() => /* ver D-frontend-5 */);

readonly isFormValid = computed(() => /* ver D-frontend-7 */);
```

**Por qué**: Consistencia con el resto del módulo de F6
(`UsersListComponent`, `RolesComponent`) — todos usan signals con
`OnPush`. Validación es simple (5 campos), `FormGroup` añade 200
líneas de boilerplate.

**Rechazado**: `ReactiveFormsModule` con `FormGroup` — overhead para
un form chico; precedent: `user-form.component.ts` lo usa pero es
un edit con `directPermissions` (más campos, justificaba el
overhead).

---

### D-frontend-4: Avatar upload en 2 pasos (POST user, PATCH avatar)

**Decisión**: El submit hace **dos requests en orden**:

1. `POST /api/users` con los datos del form (sin archivo). Devuelve
   `{id, ...}`.
2. Si el admin había seleccionado foto, segundo request
   `PATCH /api/users/{id}/avatar` con `FormData` que contiene el
   archivo bajo la clave `avatar`.

**Por qué**: El DTO `AdminCreateUserDto` no soporta multipart
(verifica `backend/src/modules/users/dto/admin-create-user.dto.ts`).
Mezclar JSON con archivo obligaría a cambiar el DTO y romper el
contrato T5.6. Separar en dos pasos mantiene cada endpoint simple.

**Rechazado**: Multipart único con todos los campos — exige
re-diseñar el DTO backend, fuera de scope de un change de F6
frontend.

**Tolerancia a fallas**: Si el `POST /users` falla, no se intenta
el `PATCH /avatar`. Si el `POST /users` tiene éxito pero el
`PATCH /avatar` falla, el usuario queda creado y la UI muestra un
toast de warning ("Usuario creado, pero la foto no se pudo subir")
— el admin puede reintentar la foto vía edit (F6.5.2).

---

### D-frontend-5: Permisos del rol via `GET /roles/:id/permissions`

**Decisión**: Al seleccionar un rol en el dropdown, el componente
llama a `GET /api/roles/{id}/permissions` para obtener el array de
permisos en formato string. Esos strings se renderizan como "ACCESO
A" (verde) y "SIN ACCESO" (rojo) según una heurística: la tarjeta
"ACCESO A" muestra los permisos que el rol **tiene** (los primeros
4-6), "SIN ACCESO" muestra permisos típicos que **no tiene**
(derivado de un catálogo estático embebido, o un mensaje "Sin
permisos adicionales" si el rol no tiene ninguno).

> **Nota**: el mock 03-02 muestra "Dashboard General", "Feed de
> Incidencias" como ACCESO A y "Gestión de Roles Globales", "Logs
> de Servidor" como SIN ACCESO para el rol seleccionado. Esos
> strings son **representativos** del mock, no del backend. La
> implementación debe derivar ambas listas del rol real — ver
> **D-frontend-5.a** abajo.

**D-frontend-5.a (sub-decisión)**: La lista de "SIN ACCESO" se
construye con los strings de permiso del catálogo que **el rol no
tiene**, hasta un máximo de 2 ítems (mismo límite que muestra el
mock). Si el catálogo está vacío o el rol tiene todos los
permisos, mostrar "Sin permisos restringidos" en su lugar. La lista
"ACCESO A" muestra hasta 4 ítems de los permisos del rol.

**Por qué on-demand** (vs traer todos los roles con permisos al
inicio): El endpoint `GET /roles` (T3.6) devuelve sólo
`{id, name}`. Traer los permisos de los 5+ roles upfront añade
N+1 latencia. Pedirlos on-demand al seleccionar es un sólo request
cuando el usuario interactúa con el dropdown.

**Rechazado**: Traer todos los roles con permisos en el
`ngOnInit` — N+1 latencia upfront, mismo número total de requests
si el usuario explora todos los roles.

---

### D-frontend-6: Invitación como request separado

**Decisión**: Si el toggle "Envío de invitación" está ON, tras un
`POST /users` exitoso se llama a `POST /api/admin/users/invite`
con `{email, role_id, organization_id}` (los valores del form).

```typescript
if (response.ok) {
  if (this.formData().sendInvitation) {
    await firstValueFrom(
      this.invitationsService.invite({
        email: this.formData().email,
        roleId: this.formData().roleId,
        organizationId: this.formData().organizationId,
      })
    );
  }
  // mostrar toast, navegar
}
```

**Por qué**: El endpoint de invitación ya existe (T3.6,
`InvitationsController.invite()` en
`backend/src/modules/invitations/invitations.controller.ts`) y
tiene semántica propia: valida que el actor pueda invitar
(`assertCanInvite`), valida que el rol existe, valida que la org
existe, **chequea 409 si el email ya tiene cuenta** (T3.6 D3).
Reusarlo evita bifurcar el `adminCreate` en "con invitación" /
"sin invitación".

**Tolerancia a fallas**: Si la invitación falla después de que el
usuario se creó, el usuario queda registrado y la UI muestra un
toast warning: "Usuario creado, pero la invitación no se envió
(<motivo>). Podés reinvitarlo desde la lista." — la pantalla de
lista podría tener un botón "Reenviar invitación" (F6.5.3, fuera
de scope).

**Rechazado**: Bandera `send_invitation` en `AdminCreateUserDto` —
introduce bifurcación que T3.6 ya resolvió con un endpoint
dedicado. Rompe el principio "endpoint por intención".

---

### D-frontend-7: Validación frontend

**Decisión**: Validación por campo en el handler `onSubmit()`:

| Campo | Regla | Mensaje |
|-------|-------|---------|
| `firstName` | requerido, min 2, max 50 | "El nombre es obligatorio" |
| `lastName` | requerido, min 2, max 50 | "El apellido es obligatorio" |
| `email` | requerido, formato email, max 320 | "Email corporativo obligatorio / inválido" |
| `phone` | opcional, max 30, formato libre | (sin validación dura; warning si >30) |
| `roleId` | opcional, UUID | (sin required — ver nota) |
| `organizationId` | opcional (ver nota) | (sin required — ver nota) |

> **Nota sobre `roleId` y `organizationId`**: El mock 03-02 dice
> "Obligatorio si el rol corresponde a Administrador u Operador de
> Organización." Sin el rol seleccionado, no se puede aplicar
> esa regla. La UX es: si el admin selecciona un rol con `name`
> en `['admin_org', 'operador_org']` y deja la organización
> vacía, mostrar warning inline "El rol {rol} requiere una
> organización" y deshabilitar Guardar.

**Por qué validar también en backend**: el backend ya valida
(`@IsEmail`, `@IsUUID`, `@MaxLength`) y rechaza con 400 — defensa
en profundidad. La validación frontend es para UX inmediato.

**Rechazado**: Validación asíncrona de unicidad de email (debounce
contra `GET /users?email=`) — 2-3s de latencia, no hay endpoint
dedicado de lookup por email. El backend rechaza duplicados con
409 al submit.

---

### D-frontend-8: Geolocalización (cantón/parroquia/zona) — disabled F7

**Decisión**: Los inputs `Cantón / Parroquia Asignada`,
`Zona / Sector Operativo` se renderizan con el estilo del mock
(icono `map-pin`, label, dropdown vacío, input text deshabilitado),
atributo `disabled`, y un `title` con tooltip "Disponible en F7".

**Por qué**: El mock los muestra (diseño visual) pero la BD no
tiene las columnas necesarias (ni en `users` ni en una tabla
`user_territories`). Implementarlos ahora requiere migración +
endpoint. F7 es la fase natural para esto (ver
`openspec/ROADMAP.md`).

**Rechazado**: Implementar ahora con mocks — agrega carga de UI
que después hay que tirar, sin valor real para el usuario.

---

### D-frontend-9: Estado inicial y Canal de notificaciones fijos

**Decisión**: Los dropdowns "Estado inicial" muestra
`Activo` (deshabilitado, único valor) y "Canal de notificaciones
preferido" muestra `Correo Electrónico` (deshabilitado, único
valor). Ambos son decorativos en F6.

**Por qué**:
- `adminCreate` backend siempre crea con `is_active = true`
  (`users.service.ts:235`); no hay forma de crear un usuario
  inactivo desde el alta. El toggle de "Estado inicial" del mock
  es **placeholder** hasta que se decida cómo modelarlo.
- El único canal implementado es email (T3.6 invitation flow).
  SMS no está en la BD ni en el módulo de mail.

**Rechazado**: Hacer los dropdowns funcionales sin soporte
backend — falsear UX. Mejor placeholder honesto.

---

### D-frontend-10: Wiring del botón "+ Nuevo usuario"

**Decisión**: Cambiar el `routerLink` del botón en
`users-list.component.html:10` de
`['/app/admin/usuarios', 'nuevo']` a
`['/app/admin/usuarios', 'new']`. La ruta `new` (en
`app.routes.ts:111-118`) se re-mapea para apuntar a
`NewUserFormComponent` en lugar de `UserFormComponent`.

**Por qué**: El botón está **roto** hoy — apunta a una ruta que
no existe. La pantalla del mock 03-02 **es** la pantalla de alta,
no la genérica.

**Rechazado**: Crear una nueva ruta `/admin/usuarios/nuevo`
— duplica la ruta `new` con distinto destino; el mock y la
consistencia de F6 (organizaciones, categorías, ubicaciones usan
`new`) ganan con `new`.

---

## File Changes

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` | New | Componente standalone con signals |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html` | New | Template con 6 secciones |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.css` | New | Estilos siguiendo tokens F0 + mock 03-02 |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.spec.ts` | New | 8-10 unit tests |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | Modified | `routerLink`: `nuevo` → `new` (línea 10) |
| `frontend/src/app/app.routes.ts` | Modified | Ruta `new` carga `NewUserFormComponent` (línea 114-117) |
| `frontend/src/app/features/admin/users/services/users.service.ts` | Modified | `createUser()` ajustado a `POST` JSON (sin FormData); `getRolePermissions(id)` nuevo |
| `frontend/src/app/features/admin/users/services/invitations.service.ts` | New (o reusar existente) | Wrapper para `POST /admin/users/invite` |
| `frontend/e2e/new-user-form.e2e.ts` | New | Specs S1–S5 |

> **Nota sobre `UsersService.createUser()`**: hoy usa FormData
> (multipart), alineado con el `UserFormComponent` viejo. Este
> change modifica ese método para enviar JSON (alineado con
> `AdminCreateUserDto` que **no** tiene `@UseInterceptors`). El
> `UserFormComponent` (edit, ruta `:id/edit`) sigue funcionando
> porque `updateUser()` también usa FormData y mantiene su propio
> path. Verificar que no haya regresión con tests existentes.

---

## Contracts (TypeScript)

### NewUserFormData (estado interno)

```typescript
export interface NewUserFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  organizationId: string | null;
  roleId: string | null;
  sendInvitation: boolean;
  // F6 simplification: ambos fijos hasta F7+
  initialStatus: 'activo';
  notificationChannel: 'email';
}

export interface RoleOption {
  readonly id: string;       // UUID
  readonly name: string;     // 'admin_org', 'operador_org', etc.
  readonly permissions?: string[];  // opcional, on-demand loaded
}

export interface OrganizationOption {
  readonly id: string;
  readonly name: string;
}
```

### RolePermissionsView (lo que pinta el card de preview)

```typescript
export interface RolePermissionsView {
  access: ReadonlyArray<string>;    // ['READ dashboard', 'READ incidents', ...]
  noAccess: ReadonlyArray<string>;  // ['UPDATE roles', 'READ audit', ...] o []
}
```

---

## API Integration

### 1. `POST /api/users` (existente, T5.6)

Request — **snake_case** por convención del proyecto
(`SnakeCaseResponseInterceptor` reescribe las respuestas, los
requests también van en snake_case para que el backend no rechace
por `class-validator`):

```jsonc
// POST /api/users
// Content-Type: application/json
{
  "email": "juan.perez@municipio.gob.ec",
  "first_name": "Juan",                // max 50
  "last_name": "Pérez",                // max 50
  "phone": "+593 99 999 9999",         // max 30, opcional
  "role_id": "uuid-admin-org",         // opcional (UUID)
  "organization_id": "uuid-gad"        // opcional (UUID)
}
```

Response 201 (success, snake_case):

```jsonc
{
  "id": "uuid-new-user",
  "email": "juan.perez@municipio.gob.ec",
  "first_name": "Juan",
  "last_name": "Pérez",
  "phone": "+593 99 999 9999",
  "role_id": "uuid-admin-org",
  "organization_id": "uuid-gad",
  "is_active": true,
  "permissions": ["READ dashboard", "READ incidents", ...],
  "permission_version": 2,
  "created_at": "2026-09-08T22:30:00Z"
}
```

Errores:
- `400 Bad Request` — validación falló (email inválido, role_id no
  UUID). Toast "Datos inválidos: <campo>".
- `409 Conflict` — email duplicado (`users.email` UNIQUE).
  Toast "Email ya registrado en el sistema".
- `403 Forbidden` — actor no tiene `CREATE users` permission.
  Toast "No tienes permiso para crear usuarios".

### 2. `PATCH /api/users/:id/avatar` (existente, T5.4)

```jsonc
// PATCH /api/users/{id}/avatar
// Content-Type: multipart/form-data
// file: <JPG/PNG/WEBP, max 2MB>

// Response 200
{
  "id": "uuid",
  "avatar_url": "https://cdn.../avatar-uuid.jpg",
  ...
}
```

Errores:
- `400` — formato/peso inválido. Toast "La foto no se pudo
  subir. Verificá que sea JPG/PNG/WEBP y pese menos de 2MB".
- `404` — el user-id no existe (no debería pasar si seguimos el
  orden POST→PATCH).

### 3. `POST /api/admin/users/invite` (existente, T3.6)

```jsonc
// POST /api/admin/users/invite
// Content-Type: application/json
{
  "email": "juan.perez@municipio.gob.ec",
  "role_id": "uuid-admin-org",
  "organization_id": "uuid-gad"
}

// Response 201
{
  "id": "invitation-uuid",
  "email": "juan.perez@municipio.gob.ec",
  "role_id": "uuid-admin-org",
  "organization_id": "uuid-gad",
  "expires_at": "2026-09-15T...",
  "created_at": "2026-09-08T..."
}
```

Errores:
- `409 Conflict` — email ya tiene cuenta. **No bloqueante**: el
  usuario ya fue creado, el toast dice "Usuario creado, pero el
  email ya tenía cuenta — no se envió invitación".
- `403` — actor no tiene `CREATE invitations` permission.
  Toast "No tienes permiso para enviar invitaciones".

### 4. `GET /api/roles/:id/permissions` (existente, T3.6)

```jsonc
// GET /api/roles/{id}/permissions
// Response 200
["READ dashboard", "READ incidents", "UPDATE incidents", ...]
```

### 5. `GET /api/users/form-data` (existente, T5.4)

```jsonc
// GET /api/users/form-data
// Response 200
{
  "roles": [{ "id": "uuid", "name": "admin_org" }, ...],
  "organizations": [{ "id": "uuid", "name": "GAD Norte" }, ...]
}
```

---

## Routing

```typescript
// app.routes.ts (modificado)
{
  path: 'new',
  data: { breadcrumb: 'Nuevo Usuario' },
  loadComponent: () =>
    import('./features/admin/users/new-user-form/new-user-form.component').then(
      (m) => m.NewUserFormComponent,   // ← antes era UserFormComponent
    ),
},
{
  path: ':id/edit',
  data: { breadcrumb: 'Editar Usuario' },
  loadComponent: () =>
    import('./features/admin/users/user-form/user-form.component').then(
      (m) => m.UserFormComponent,      // ← sin cambios
    ),
},
```

---

## Dependencies con otros changes

- `back/2026-09-08-f6-new-user-form/` (paralelo): agrega `phone` al
  `AdminCreateUserDto` y hereda permisos del rol al crear. Sin
  ese change, este frontend puede submitear `phone` y el backend
  lo ignora silenciosamente (DTO no valida `phone`, sólo lo
  acepta como extra-property; verificar con NestJS si lo rechaza
  con `whitelist: false`).

  **Mitigación si el change back no se aplica primero**: el
  frontend podría omitir `phone` del payload hasta que el back
  esté listo. Es un cambio de 1 línea en el service.

- `front/2026-09-08-f6-usuarios-redesign/` (archivado): ya
  provee `getRoles()`, `getOrganizations()` en
  `UsersService`. Sin duplicar.

---

## Out of Scope explícito

- `GET /users?email=` para validación asíncrona de unicidad.
- Reintento de subida de foto post-error (queda warning toast, el
  admin puede editar).
- Drag & drop de foto (sólo el botón "Subir foto de perfil" +
  click-to-upload).
- Crop / resize de la imagen antes de subir.
- Tests de accesibilidad (axe) — el equipo de F0 cubre los
  contrastes, este form usa los mismos tokens.
