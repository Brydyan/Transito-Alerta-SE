# Spec: Admin User Creation — Backend Enhancements

> **Complemento de**: `front/2026-09-08-f6-new-user-form/`
> **Endpoint afectado**: `POST /api/users` (T5.6)
> **Sin migraciones nuevas**.

---

## Purpose

`POST /api/users` (T5.6) cubre el alta básica, pero la pantalla
del mock 03-02 requiere que el backend persista `phone` (que el
DTO actual ignora) y que los permisos del rol se denormalicen al
crear (no sólo al update, como hace hoy `adminUpdate`).

Este spec asegura que `AdminCreateUserDto` y
`UsersService.adminCreate()` cumplen los requisitos del form
F6.2 sin romper la compatibilidad con consumidores existentes
(T5.6 specs, T3.6 invitation flow, R4 profile).

---

## Requirements

### Requirement: AdminCreateUserDto Accepts phone

El DTO MUST aceptar `phone` opcional, validado con
`MaxLength(30)`. El campo es opcional (no es required) y
cualquier string de hasta 30 caracteres es aceptado.

#### Scenario: phone válido se acepta

- **GIVEN** un POST a `/api/users` con `{ email, phone:
  "+593 99 999 9999" }`
- **WHEN** `AdminCreateUserDto` lo valida
- **THEN** la validación pasa
- **AND** el servicio persiste `users.phone = "+593 99 999
  9999"`

#### Scenario: phone > 30 caracteres rechazado

- **GIVEN** un POST a `/api/users` con `{ email, phone:
  "x".repeat(31) }`
- **WHEN** `AdminCreateUserDto` lo valida
- **THEN** la validación falla con 400 y mensaje:
  "phone must be shorter than or equal to 30 characters"

#### Scenario: phone ausente permitido

- **GIVEN** un POST a `/api/users` con sólo `{ email }`
- **WHEN** `AdminCreateUserDto` lo valida
- **THEN** la validación pasa
- **AND** el servicio persiste `users.phone = null`
  (backward compatible con T5.6)

#### Scenario: phone con formato inválido se acepta (sin validación de formato)

- **GIVEN** un POST a `/api/users` con `{ email, phone:
  "abc-123" }`
- **WHEN** `AdminCreateUserDto` lo valida
- **THEN** la validación pasa (no se valida formato; la
  validación de prefijo Ecuador la hace el frontend)

---

### Requirement: adminCreate Persists Role Permissions

El servicio MUST denormalizar los permisos del rol al crear
cuando `role_id` viene presente, igual que `adminUpdate` lo hace
en su rama `dto.role_id !== undefined`.

#### Scenario: Usuario creado con role_id hereda permisos

- **GIVEN** `adminCreate({ email, role_id: "admin_org_uuid" })`
  donde `admin_org` tiene `permissions: ["READ dashboard",
  "READ incidents", ...]`
- **WHEN** el servicio ejecuta
- **THEN** el `UserEntity` creado tiene
  `user.permissions = ["READ dashboard", "READ incidents", ...]`
  (copia exacta del rol)
- **AND** `user.permissionVersion = 2` (bumped de 1)

#### Scenario: Usuario creado sin role_id queda con permissions vacías

- **GIVEN** `adminCreate({ email })` sin `role_id`
- **WHEN** el servicio ejecuta
- **THEN** el `UserEntity` creado tiene
  `user.permissions = []` (backward compatible con T5.6)
- **AND** `user.permissionVersion = 1` (default)

#### Scenario: role_id inválido se rechaza con 404

- **GIVEN** `adminCreate({ email, role_id: "uuid-inexistente" })`
- **WHEN** el servicio busca el `RoleEntity`
- **THEN** se lanza `NotFoundException("Role uuid-inexistente
  not found")` con HTTP 404
- **AND** no se crea ningún usuario (transaccional)

#### Scenario: role_id soft-deleted se rechaza con 404

- **GIVEN** el rol con `id = "uuid-x"` está
  `soft-deleted = true` (`roles.deleted_at IS NOT NULL`)
- **AND** `adminCreate({ email, role_id: "uuid-x" })`
- **WHEN** el servicio busca el `RoleEntity`
- **THEN** se lanza `NotFoundException` con 404
- **AND** no se crea el usuario

---

### Requirement: adminCreate Persists phone and First/Last Name

El servicio MUST persistir `dto.phone` en `users.phone`,
`dto.first_name` en `users.first_name`, y `dto.last_name` en
`users.last_name`. (Esta parte ya existe en T5.6; este spec
sólo verifica que `phone` se sume sin romper lo previo.)

#### Scenario: Nombre y apellido se persisten (regresión)

- **GIVEN** `adminCreate({ email, first_name: "Juan",
  last_name: "Pérez" })`
- **WHEN** el servicio ejecuta
- **THEN** `user.firstName = "Juan"`, `user.lastName = "Pérez"`
- **AND** la respuesta serializa `firstName`/`lastName` (vía
  `SnakeCaseResponseInterceptor`)

#### Scenario: Phone se persiste (NUEVO)

- **GIVEN** `adminCreate({ email, phone: "+593 99 999 9999" })`
- **WHEN** el servicio ejecuta
- **THEN** `user.phone = "+593 99 999 9999"`
- **AND** la respuesta serializa `phone: "+593 99 999 9999"`

#### Scenario: Sin phone se persiste null (regresión + NUEVO)

- **GIVEN** `adminCreate({ email })`
- **WHEN** el servicio ejecuta
- **THEN** `user.phone = null`
- **AND** la respuesta serializa `phone: null`

---

### Requirement: Email Uniqueness Enforced (regresión T5.6)

El sistema MUST rechazar emails duplicados con 409 Conflict. El
comportamiento es idéntico al de T5.6; este spec lo documenta
para que el cambio de DTO no lo rompa inadvertidamente.

#### Scenario: Email duplicado se rechaza

- **GIVEN** ya existe un `UserEntity` con `email =
  "juan@municipio.ec"`
- **WHEN** `POST /api/users` con ese email
- **THEN** retorna 409: `{ message: "Email ya registrado" }`
  (o código equivalente de T5.6)

---

### Requirement: Invitation is a Separate Flow (no flag in DTO)

El DTO MUST NOT aceptar `send_invitation`, `invite_email`, ni
ningún flag que bifurque el alta. La invitación es un endpoint
separado (`POST /api/admin/users/invite`, T3.6) que el frontend
llama **después** del alta si el toggle está ON.

#### Scenario: DTO rechaza flag de invitación

- **GIVEN** un POST a `/api/users` con `{ email,
  send_invitation: true }`
- **WHEN** `class-validator` (`whitelist: true`) procesa el DTO
- **THEN** `send_invitation` se ignora silenciosamente
  (no es propiedad del DTO)
- **OR** se rechaza con 400 "property send_invitation should
  not exist" (depende de la config de `ValidationPipe`)
- **AND** el usuario se crea igualmente

> **Nota**: el comportamiento exacto depende de la config de
> `ValidationPipe` en `main.ts` (`whitelist` y `forbidNonWhitelisted`).
> Este spec asume el comportamiento más permisivo (strip
> silencioso). Si la auditoría revela lo contrario, ajustar el
> frontend para NO enviar el flag.

#### Scenario: Frontend llama invite por separado

- **GIVEN** un POST a `/api/users` con `{ email,
  organization_id, role_id }` retorna 201
- **AND** un POST subsecuente a `/api/admin/users/invite` con
  `{ email, role_id, organization_id }` retorna 201
- **WHEN** el flujo de creación con toggle ON completa
- **THEN** la invitación se envía por email
- **AND** el actor de `adminCreate` no es el mismo que el
  de `invite` necesariamente (pueden ser request separados)

---

### Requirement: is_active Always True on Create (F6 simplification)

El DTO MUST NOT aceptar `is_active`, `status`, ni equivalentes.
El alta siempre crea usuarios activos (T5.6 simplification).

#### Scenario: DTO rechaza flag de estado

- **GIVEN** un POST a `/api/users` con `{ email, is_active:
  false }`
- **WHEN** el DTO se valida
- **THEN** `is_active` se ignora silenciosamente
- **AND** el usuario se crea con `is_active = true`

---

### Requirement: Geolocation Fields Rejected (F7+)

El DTO MUST NOT aceptar `canton`, `parroquia`, `zona`, `geo_*`,
ni equivalentes. La BD no tiene las columnas; el mock los
muestra pero el frontend los renderiza deshabilitados.

#### Scenario: DTO rechaza flags geográficos

- **GIVEN** un POST a `/api/users` con `{ email, canton:
  "Guayaquil" }`
- **WHEN** el DTO se valida
- **THEN** `canton` se ignora silenciosamente
- **AND** el usuario se crea sin ese dato (columna no existe
  aún)

---

## Out of Scope (F7+)

- **Geolocalización** (cantón/parroquia/zona). Schema no las
  tiene. F7 las agrega.
- **Canal SMS**. Solo "Correo Electrónico" en F6.
- **Estado inicial configurable** (`is_active` flag). Siempre
  `true` en F6.
- **Reasignación de fila admin-bootstrap al redeem**.
  Pre-existente: cuando el invitado acepta, se inserta una
  NUEVA fila (`InvitationsService.redeem`), no se actualiza la
  fila admin-bootstrap. Esto crea duplicación de email si el
  flujo de invitación se usa después del alta.
- **`assertCanGrantRole` en `adminCreate`**. Pre-existente:
  el alta no valida que el actor pueda conceder el rol
  (`role.permissions` puede incluir `REVEAL incidents` aunque
  el actor no sea master). Mismo gap que `adminUpdate`.

---

## Compatibility Notes

- **T5.6 adminCreate behavior preservado**:
  - `permissions: []` cuando `role_id` es null o ausente.
  - `permissionVersion: 1` por default.
  - `isActive: true` por default.
  - `deviceUuid: "admin-bootstrap-..."` (T5.6 simplification).
  - No se llama a `authService.invalidatePermissionCache` (no
    hay sesión activa para invalidar).

- **T3.6 invitation flow sin cambios**: `POST
  /api/admin/users/invite` sigue funcionando idéntico. El
  frontend lo llama después del alta si el toggle está ON.

- **T3.9 profile flow sin cambios**: `PATCH /api/users/me` (con
  `phone` ya soportado) sigue siendo el path para que el
  usuario edite su propio teléfono.

- **R4 user listing sin cambios**: `GET /api/users` no expone
  `phone` por default (select específico del controller); este
  change no lo modifica.

---

## Files Touched (resumen)

| File | Change | Notes |
|------|--------|-------|
| `backend/src/modules/users/dto/admin-create-user.dto.ts` | +6 lines | Agregar `phone?: string` con `@IsOptional() @IsString() @MaxLength(30)` |
| `backend/src/modules/users/users.service.ts` | +15 lines, -3 lines | En `adminCreate()`: cargar `RoleEntity` si `dto.role_id`; copiar `permissions` y bump `permissionVersion` |
| `backend/src/modules/users/users.service.spec.ts` | +1 test | `adminCreate` con `role_id` copia permissions |
| `backend/src/modules/users/dto/admin-create-user.dto.spec.ts` (NEW) | +20 lines | 3-4 tests del DTO: phone válido/inválido/ausente |
