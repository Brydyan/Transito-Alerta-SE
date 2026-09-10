# Design: F6 — Backend enhancements for Nuevo Usuario

> Complementa `front/2026-09-08-f6-new-user-form/`. Cierra dos
> gaps de `POST /api/users` (T5.6) y un tercer gap del catálogo
> de permisos que el primer verify del F6 destapó (los perms
> `(users, CREATE)`, `(users, DELETE)` y `(permissions, READ)`
> nunca fueron sembrados por la migración 0009, así que
> `POST /api/users` y `GET /api/permissions` retornaban 403 a
> todos los usuarios). La migración 0049 cierra ese gap.

---

## Decisions

### D1: Add `phone` to AdminCreateUserDto (no migration)

**Decisión**: Agregar `phone?: string` opcional al DTO con
`@IsOptional() @IsString() @MaxLength(30)`.

```typescript
export class AdminCreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;                       // ← NUEVO

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization_id?: string;

  @IsOptional()
  @IsUUID()
  role_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;
}
```

**Por qué**: La columna `users.phone` ya existe desde la
migración 0035 (`database/migrations/0035_domain_columns.sql`).
El DTO actual no la expone, así que la pantalla del mock 03-02
no puede persistirla. Agregar el campo es la única acción
necesaria — el `userRepo.create({...})` ya acepta la propiedad
`phone` (el entity está bien).

**Rechazado**: Migración nueva — innecesaria, la columna ya
existe.
**Rechazado**: Validación de formato estricto (`+593...`,
`09...`) — el alcance es F6 frontend; el backend acepta el
string libre, igual que `updateProfile` (T3.9) lo hace hoy.

---

### D2: Inherit Role Permissions on Create (denormalización)

**Decisión**: Cuando `dto.role_id` está presente,
`adminCreate()` debe:

1. Cargar el `RoleEntity` (404 si no existe).
2. Denormalizar `role.permissions` a `user.permissions` (copia
   por valor, no referencia).
3. Bumpear `permissionVersion` de 1 a 2.

Cuando `dto.role_id` está ausente, mantener el comportamiento
actual (`permissions: []`, `permissionVersion: 1`).

```typescript
async adminCreate(dto: AdminCreateUserDto): Promise<UserEntity> {
  let permissions: string[] = [];
  let permissionVersion = 1;

  if (dto.role_id) {
    const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
    if (!role) {
      throw new NotFoundException(`Role ${dto.role_id} not found`);
    }
    permissions = role.permissions ?? [];
    permissionVersion = 2;
  }

  const tempDeviceUuid = `admin-bootstrap-${dto.email}-${Date.now()}`;
  const user = this.userRepo.create({
    email: dto.email,
    deviceUuid: tempDeviceUuid,
    firstName: dto.first_name ?? null,
    lastName: dto.last_name ?? null,
    phone: dto.phone ?? null,                  // ← NUEVO
    organizationId: dto.organization_id ?? null,
    roleId: dto.role_id ?? null,
    isActive: true,
    permissions,                               // ← CAMBIO
    permissionVersion,                         // ← CAMBIO
  });
  return this.userRepo.save(user);
}
```

**Por qué denormalizar en el alta**:

- `adminUpdate` (T5.6, `users.service.ts:249-256`) ya lo hace
  en su rama de `dto.role_id !== undefined`. Dejar el alta sin
  denormalizar crea un **gap de permisos**: el usuario queda
  registrado con `permissions: []` aunque su rol las tenga, y
  cualquier chequeo de permisos falla hasta que un PATCH
  corrija.
- El cache `perm:v3:uid:{userId}` (Redis) es read-through:
  cuando el invitado acepte la invitación y loguee por primera
  vez, el lookup de `AuthService.getPermissions` leerá
  `user.permissions` de BD y lo cacheará. Si la fila está
  vacía, el cache también.
- El `permissionVersion` bumped (1 → 2) coincide con el patrón
  de T3.2 D2: cualquier cache `perm:v3:uid:*` pre-existente
  queda inmediatamente obsoleto. No hay cache pre-existente
  para un user nuevo, pero el bump es **defensa en
  profundidad** y mantiene la invariante "permissionVersion se
  incrementa en cada cambio de permisos".

**Por qué NO llamar a `authService.invalidatePermissionCache` en
el alta**:

- Los usuarios recién creados no tienen sesión activa
  (no tienen `password_hash`; están esperando invitación).
- El cache `perm:v3:uid:{userId}` sólo se puebla cuando el
  usuario loguea. Como no hay sesión, no hay entrada de cache
  que invalidar.
- Cuando el invitado acepta (`InvitationsService.redeem`),
  inserta una **nueva** fila con `permissions` ya copiadas del
  rol. Esa nueva fila no tiene cache previo.
- **Conclusión**: invalidar el cache en el alta es no-op.

**Rechazado**: Cache invalidation por simetría con
`adminUpdate` — innecesario, agrega una llamada de red
(`authService.invalidatePermissionCache` toca Redis) sin
beneficio observable.

---

### D3: NO `send_invitation` flag in DTO (separación de concerns)

**Decisión**: El DTO no acepta `send_invitation` ni equivalentes.
La invitación se hace en un endpoint separado.

**Por qué**:

- T3.6 (`InvitationsService.createInvitation` y
  `InvitationsController.invite`) ya provee el flujo canónico
  de invitación: valida `assertCanInvite` (rank/visibility),
  valida que el rol existe, valida que la org existe, chequea
  409 si el email ya tiene cuenta, genera token, encola email.
- Bifurcar `adminCreate` en "con invitación" / "sin
  invitación" duplica esa lógica y rompe el principio "un
  endpoint por intención".
- El frontend controla el flujo: tras un `POST /users`
  exitoso, si el toggle está ON llama `POST
  /admin/users/invite`; si está OFF, no.

**Comportamiento del DTO ante el flag**:

- Si la config del `ValidationPipe` global en `main.ts` tiene
  `whitelist: true, forbidNonWhitelisted: false` (lo más
  probable; verificar), el flag se ignora silenciosamente y el
  usuario se crea.
- Si tiene `forbidNonWhitelisted: true`, el POST retorna 400
  con "property send_invitation should not exist" — el
  frontend NO debe enviar el flag.

> **Acción derivada**: el `UsersController` no requiere
> cambios. El frontend (en `UsersService.createUser`) NO debe
> enviar `send_invitation` en el body. Si se envía y el
> backend rechaza, el toast muestra el error y la pantalla
> permanece abierta. **Decisión**: no enviar el flag.

**Rechazado**: Bifurcar `adminCreate` con un flag — duplica
T3.6 y rompe el principio "endpoint por intención".

---

### D4: NO `is_active` flag in DTO (always true on create)

**Decisión**: El DTO no acepta `is_active`, `status`, ni
equivalentes. El alta siempre crea usuarios activos
(`isActive = true`).

**Por qué**:

- T5.6 simplification: el alta crea usuarios activos por
  default. El "soft-disable" se hace vía `DELETE
  /api/users/:id` (soft delete con `isActive: false`).
- El toggle "Estado inicial" del mock 03-02 es decorativo en
  F6 (ver D-frontend-9 del design paralelo).
- Aceptar el flag bifurcaria el alta en "activo/inactivo" sin
  valor real: un usuario admin-creado inactivo no puede
  recibir invitación (T3.6 crea el flow con `is_active =
  true` por default en la redemption).

**Rechazado**: Aceptar `is_active` en el DTO — bifurcación sin
beneficio.

---

### D5: NO geolocation fields in DTO (F7)

**Decisión**: El DTO no acepta `canton`, `parroquia`, `zona`,
`geo_*`, ni equivalentes. La BD no tiene las columnas; el
frontend las renderiza deshabilitadas.

**Por qué**: Out of scope F6. La migración F7 las agregará
(típicamente: `users.canton_id UUID REFERENCES geo_zones(id)`,
etc.).

**Rechazado**: Agregar las columnas ahora — fuera de scope
F6, requiere diseño de jerarquía administrativa (cantón →
parroquia → zona) que no está cerrado.

---

### D6: No changes to UserEntity, UsersController, or UsersModule

**Decisión**: Este change no toca:

- `backend/src/entities/user.entity.ts` — la entidad ya tiene
  `phone: string | null` (línea 116).
- `backend/src/modules/users/users.controller.ts` — el
  controller sigue exponiendo `adminCreate(@Body() dto:
  AdminCreateUserDto)`; el cambio es transparente.
- `backend/src/modules/users/users.module.ts` — el módulo ya
  importa `TypeOrmModule.forFeature([UserEntity, RoleEntity,
  OrganizationEntity])`, y `UsersService` ya inyecta
  `roleRepo` (línea 43) — todo lo necesario está disponible.

**Por qué**: el cambio es puramente aditivo (1 campo al DTO,
1 bloque de denormalización al service). No requiere
re-configuración de módulos ni de inyección.

---

### D7: Tests

**Decisión**: Cuatro nuevos tests, todos unit, más UN e2e
nuevo (corrección de la decisión original — ver "Cambio de
plan" abajo):

1. **`admin-create-user.dto.spec.ts` (NUEVO archivo)**:
   - 4 tests del DTO vía `validateOrReject(dto)`:
     - `phone` válido se acepta
     - `phone` > 30 chars falla con mensaje `MaxLength`
     - `phone` ausente se acepta
     - `phone` con caracteres no-numéricos acepta (validación
       laxa)

2. **`users.service.spec.ts` (extensión)**: 1 test del
   service con mock de `roleRepo`:
   - `adminCreate({ email, role_id })` carga el rol,
     copia permissions, bump version.
   - `adminCreate({ email })` sin role_id mantiene
     `permissions: []`, `version: 1`.

3. **Nuevo e2e: `admin-create-user-roles.e2e-spec.ts`**:
   4 specs que prueban el camino real (login + POST con auth
   real + guard real):
   - `master` con `CREATE users` puede `POST /api/users` con
     `phone` + `role_id` → 201 con `permissions` denormalizadas
     del rol.
   - `operador_org` sin `CREATE users` recibe 403 "Missing
     permission: CREATE users" en `POST /api/users`.
   - `adminCreate` con `phone > 30 chars` retorna 400 con
     "phone must be shorter than or equal to 30 characters".
   - `adminCreate` con `role_id` inválido retorna 404 "Role
     ... not found".

**Cambio de plan** (vs el `design.md` original que decía
"no nuevos tests e2e"): el primer verify del F6 (veredicto
FAIL) demostró que el e2e de T5.6 pasaba con un master que
NO tenía `CREATE users` — el gap del catálogo se manifestaba
como `403` real en producción pero como `PASS` en CI. La
explicación es que T5.6 mockeaba la auth o usaba un rol que
no requería el guard completo. Sin un e2e que pruebe el
camino real, el gap puede volver en cualquier momento sin que
CI lo detecte. El e2e nuevo es el regression guard.

**Por qué sí e2e (ahora)**: la omisión del e2e nuevo fue el
camino que dejó pasar el gap. Costo: ~1 h para escribir 4
specs. Beneficio: la próxima vez que alguien "arregle" el role
grant y olvide el catálogo, CI grita.

---

## File Changes

| File | Change | Lines | Notes |
|------|--------|-------|-------|
| `backend/src/modules/users/dto/admin-create-user.dto.ts` | Modified | +6 | Agregar `phone?: string` con decoradores |
| `backend/src/modules/users/users.service.ts` | Modified | +15, -3 | `adminCreate()` carga rol + denormaliza si `role_id` |
| `backend/src/modules/users/users.service.spec.ts` | Modified | +30 | 1-2 tests con `roleRepo` mockeado |
| `backend/src/modules/users/dto/admin-create-user.dto.spec.ts` | New | +60 | 4 tests del DTO |
| `database/migrations/0049_admin_user_permissions.sql` | New | +60 | 3 perms al catálogo + grant a master/admin_org + denormalize |
| `database/rollback/0049_admin_user_permissions.DOWN.sql` | New | +35 | Reversa los 3 pasos de 0049 |
| `backend/test/e2e/admin-create-user-roles.e2e-spec.ts` | New | +200 | 4 e2e: master reachability, operador_org 403, phone > 30, role_id 404 |

> **Total**: 7 archivos tocados, ~410 líneas netas (incluida la
> migración 0049 y el e2e nuevo — el design original subestimó
> el alcance al no anticipar el gap del catálogo).

---

## Contracts (TypeScript)

### AdminCreateUserDto (NUEVO shape)

```typescript
export class AdminCreateUserDto {
  // ...existing fields...
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;        // ← NUEVO

  // ...rest unchanged...
}
```

### adminCreate() behavior (cambios)

```typescript
// Antes (T5.6):
async adminCreate(dto: AdminCreateUserDto): Promise<UserEntity> {
  const tempDeviceUuid = `admin-bootstrap-${dto.email}-${Date.now()}`;
  const user = this.userRepo.create({
    email: dto.email,
    deviceUuid: tempDeviceUuid,
    firstName: dto.first_name ?? null,
    lastName: dto.last_name ?? null,
    organizationId: dto.organization_id ?? null,
    roleId: dto.role_id ?? null,
    isActive: true,
    permissions: [],   // ← siempre vacío
  });
  return this.userRepo.save(user);
}

// Después (este change):
async adminCreate(dto: AdminCreateUserDto): Promise<UserEntity> {
  let permissions: string[] = [];
  let permissionVersion = 1;

  if (dto.role_id) {
    const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
    if (!role) {
      throw new NotFoundException(`Role ${dto.role_id} not found`);
    }
    permissions = role.permissions ?? [];
    permissionVersion = 2;
  }

  const tempDeviceUuid = `admin-bootstrap-${dto.email}-${Date.now()}`;
  const user = this.userRepo.create({
    email: dto.email,
    deviceUuid: tempDeviceUuid,
    firstName: dto.first_name ?? null,
    lastName: dto.last_name ?? null,
    phone: dto.phone ?? null,         // ← NUEVO
    organizationId: dto.organization_id ?? null,
    roleId: dto.role_id ?? null,
    isActive: true,
    permissions,                      // ← denormalizado
    permissionVersion,                // ← bumped si role_id
  });
  return this.userRepo.save(user);
}
```

---

## API Behavior

### POST /api/users (cambios)

**Request** (sin cambios en la estructura, sólo +1 campo
opcional):

```jsonc
// POST /api/users
// Content-Type: application/json
{
  "email": "juan.perez@municipio.gob.ec",
  "phone": "+593 99 999 9999",        // ← NUEVO (opcional)
  "first_name": "Juan",
  "last_name": "Pérez",
  "role_id": "uuid-admin-org",         // opcional
  "organization_id": "uuid-gad"        // opcional
}
```

**Response 201** (sin cambios de shape, sólo contenido):

```jsonc
{
  "id": "uuid-new-user",
  "email": "juan.perez@municipio.gob.ec",
  "phone": "+593 99 999 9999",         // ← presente si se envió
  "first_name": "Juan",
  "last_name": "Pérez",
  "role_id": "uuid-admin-org",
  "organization_id": "uuid-gad",
  "is_active": true,
  "permissions": ["READ dashboard", ...],  // ← denormalizado si role_id
  "permission_version": 2,                 // ← 2 si role_id, 1 si no
  "created_at": "2026-09-08T..."
}
```

**Response 404** (NUEVO caso — role_id inválido):

```jsonc
{
  "statusCode": 404,
  "message": "Role uuid-inexistente not found"
}
```

**Errores no modificados** (regresión T5.6):

- `400 Bad Request` — email inválido, phone > 30 chars, role_id
  no es UUID, organization_id no es UUID.
- `409 Conflict` — email duplicado.

---

## Compatibility Matrix

| Consumer | Field | Behavior |
|----------|-------|----------|
| Front paralelo (`NewUserFormComponent`) | `phone` | Enviado en body; backend acepta y persiste. |
| Front paralelo | `role_id` | Enviado; backend ahora denormaliza permissions. |
| Front paralelo | `send_invitation` | NO enviar (ver D3). El frontend debe llamar `POST /admin/users/invite` por separado. |
| T5.6 specs (adminCreate tests pre-existentes) | (sin cambios) | Tests que asuman `permissions: []` deben seguir verdes cuando NO se envía `role_id`. Tests con `role_id` deben actualizarse para esperar la denormalización. |
| T3.6 invitation flow | (sin cambios) | `POST /admin/users/invite` opera idéntico. |
| T3.9 profile flow | (sin cambios) | `PATCH /api/users/me` mantiene su `phone` independiente. |
| T5.4 form-data endpoint | (sin cambios) | `GET /api/users/form-data` no se toca. |

---

## Coherence con gemini-architect.md

- **D1** (DTO estricto sin `any`): el DTO usa
  `class-validator`, no `any`. ✓
- **D3** (Derivar modelos del controlador, no de la clase DTO):
  el response wire es snake_case vía
  `SnakeCaseResponseInterceptor`; los DTOs internos usan
  snake_case para consistencia con el wire. El frontend deriva
  del controlador, no del DTO. ✓
- **D5** (Búsqueda del patrón "regla a medias"): el T5.6
  aplicó la denormalización de permissions en `adminUpdate`
  pero la omitió en `adminCreate`. Este change cierra ese
  gap. ✓
- **D6** (Desglose atómico de tasks): ver `tasks.md`. ✓
- **Reglas estrictas**:
  - PROHIBIDO código de implementación fuera de
    `backend/src/`: este change toca sólo `users.service.ts`
    y el DTO. ✓
  - No reabrir decisiones cerradas del ROADMAP: este change
    no toca F0/F1/F2/F3/F4/F5 cerradas. ✓

---

## Out of Scope explícito

- **Cache invalidation en el alta** — no hay sesión activa
  para invalidar.
- **`assertCanGrantRole` en el alta** — gap de seguridad
  pre-existente, mismo que `adminUpdate`. No se cierra en F6.
- **Migración nueva** — la columna `phone` ya existe.
- **Reasignación de fila admin-bootstrap al redeem** —
  pre-existente, fuera de scope.
- **Tests e2e nuevos** — el e2e de T5.6 ya cubre el path
  básico; la verificación del flujo completo (crear + invitar)
  se hace manualmente.
