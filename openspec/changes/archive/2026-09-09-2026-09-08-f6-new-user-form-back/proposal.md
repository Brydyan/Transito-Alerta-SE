# Proposal: F6 — Backend enhancements for Nuevo Usuario

**Change**: `2026-09-08-f6-new-user-form`
**Scope**: Backend (NestJS)
**Complemento de**: `front/2026-09-08-f6-new-user-form/`
**Date**: 2026-09-08

---

## Intent

El endpoint `POST /api/users` (T5.6) ya existe y es suficiente
para cubrir el alta básica de usuarios. Sin embargo, **dos gaps**
impiden que la pantalla de mock 03-02 funcione end-to-end:

1. **`phone` no se persiste en el alta**. La entidad `UserEntity`
   tiene la columna `phone` desde la migración 0035
   (`database/migrations/0035_domain_columns.sql`); el DTO
   `AdminCreateUserDto` no la acepta, así que la pantalla de
   creación que muestra el campo Teléfono (mock 03-02) **no tiene
   manera de guardarlo**. Hoy el único path para asignar
   `phone` es `PATCH /api/users/me` (T3.9, perfil propio).
2. **Los permisos del rol no se heredan al crear**. Cuando el
   admin asigna un `role_id`, el usuario queda con
   `permissions = []` y `permission_version = 1`, lo que rompe
   cualquier chequeo de permisos hasta que un PATCH
   `adminUpdate` (T5.6) los reescriba. El
   `adminUpdate` **sí** denormaliza los permisos del rol
   (`users.service.ts:255-256`); el `adminCreate` quedó
   incompleto por la simplificación documentada en T5.6.

Este change cierra ambos gaps y deja la API lista para el form
del mock. **Sí agrega una migración** (0049, ver "Scope
actualizado" abajo) porque el catálogo de permisos tenía un
gap pre-existente de la migración 0009 que impedía que
`POST /api/users` fuera alcanzable para cualquier usuario,
incluyendo `master`. El gap se documenta y cierra como parte
de F6 porque sin él los dos gaps de D1/D2 son inalcanzables
en producción.

---

## Scope

### In Scope

- Agregar `phone?: string` a `AdminCreateUserDto` (campo
  opcional, `MaxLength(30)`, validado por `class-validator`).
- Modificar `UsersService.adminCreate()`:
  - Si `dto.role_id` viene, cargar el `RoleEntity` y copiar
    `role.permissions` a `user.permissions`, igual que
    `adminUpdate` (líneas 254-256). Bumpear
    `permission_version` (1 → 2) para que cualquier cache
    futuro herede la invalidez.
  - Persistir `dto.phone` en la columna `phone`.
- Mantener `is_active = true` en el alta (F6 simplification, sin
  cambios).
- Tests unit del DTO y del servicio.

### Out of Scope (no se hace en este change)

- **Flag `send_invitation` en el DTO**. La invitación es un
  endpoint separado (`POST /api/admin/users/invite`, T3.6) que
  el frontend llama **después** del alta si el toggle está ON.
  Esto evita bifurcar `adminCreate` y respeta el patrón T3.6.
- **Flag `is_active` en el DTO**. El alta siempre crea usuarios
  activos. El toggle "Estado inicial" del mock 03-02 es
  decorativo en F6.
- **Campos de geolocalización** (cantón/parroquia/zona). El mock
  los muestra, pero la BD no tiene las columnas y F7 los
  implementará.
- **SMS como canal de notificación**. Sólo email (T3.6).
- **Cache invalidation de permisos en el alta**. Los usuarios
  recién creados no tienen sesión activa (no tienen
  `password_hash` todavía), así que no hay entrada de cache
  `perm:v3:uid:{userId}` que invalidar. Cuando el invitado
  acepta la invitación, el lookup subsecuente leerá de BD.
- **Cambio al `device_uuid` placeholder**. El patrón
  `admin-bootstrap-${email}-${Date.now()}` se mantiene (T5.6
  simplification). El usuario creado por admin no puede
  loguearse hasta aceptar una invitación; entonces
  `InvitationsService.redeem` inserta una fila NUEVA con
  `password_hash` (no updatea la fila del admin — precondición
  fuera de scope de este change).
- **Migración nueva**. La columna `phone` ya existe desde 0035.
  _Excepción_: la migración **0049_admin_user_permissions.sql** sí
  es parte de este change. Cierra un gap pre-existente del
  catálogo: `(users, CREATE)`, `(users, DELETE)` y
  `(permissions, READ)` nunca fueron sembrados por 0009, así que
  `POST /api/users` y `GET /api/permissions` retornaban 403 a
  todos los usuarios. 0049 inserta los 3 perms en el catálogo
  (idempotente), los otorga a `master` y `admin_org` (los 2
  roles que legítimamente crean/borran usuarios y consultan el
  catálogo), los denormaliza a las filas de `users` existentes
  con `role_id` apuntando a esos roles, y bumpea
  `permission_version` para invalidar el cache `perm:v3:uid:*`
  en Redis (DB 1). El DOWNScript correspondiente
  (`0049_admin_user_permissions.DOWN.sql`) revierte los 3
  pasos. La convención de soft-delete del catálogo NO aplica
  aquí (los perms son tan fundamentales que reinsertarlos en
  DOWN + UP es seguro, y deja la traza más clara).

---

## Capabilities

### Modified Capabilities

- `admin-user-creation-form` (paralelo al front del mismo
  nombre): el backend pasa de "crea usuario con permisos vacíos"
  a "crea usuario con permisos del rol denormalizados si
  `role_id` viene".
- `user-management` (T5.6): `AdminCreateUserDto` acepta
  `phone` opcional.

### No new Capabilities

El change no introduce un nuevo endpoint ni un nuevo recurso.
Sólo ajusta el DTO y la lógica de `adminCreate`.

---

## Approach

1. Editar
   `backend/src/modules/users/dto/admin-create-user.dto.ts`:
   agregar `phone?: string` con `@IsOptional() @IsString()
   @MaxLength(30)`.
2. Editar
   `backend/src/modules/users/users.service.ts`,
   método `adminCreate()`: si `dto.role_id` está presente,
   cargar el `RoleEntity` y aplicar la misma denormalización
   que `adminUpdate` (líneas 254-256). Si no, mantener
   `permissions = []` (compatible con el comportamiento
   actual para usuarios sin rol).
3. Agregar tests:
   - `admin-create-user.dto.spec.ts` (o extension de
     `users.controller.spec.ts`): el DTO acepta/rechaza phone
     según las reglas.
   - `users.service.form-data.spec.ts` (ya existe): agregar
     caso `adminCreate` con `role_id` que verifica que las
     permissions se copian del rol.
4. Sin migración, sin cambio al controller, sin cambio al
   módulo.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/users/dto/admin-create-user.dto.ts` | Modified | +1 campo `phone?: string` |
| `backend/src/modules/users/users.service.ts` | Modified | `adminCreate()` ahora carga `RoleEntity` si `dto.role_id` está presente y denormaliza permisos |
| `backend/src/modules/users/users.service.spec.ts` | Modified | +1-2 unit tests del flujo con/sin `role_id` |
| `database/MIGRATION_LOG.md` | Modified | Se documenta 0049 con su justificación |
| `database/migrations/0049_admin_user_permissions.sql` | New | 3 perms al catálogo + grant a master/admin_org + denormalize |
| `database/rollback/0049_admin_user_permissions.DOWN.sql` | New | Reversa los 3 pasos de 0049 |
| `backend/test/e2e/admin-create-user-roles.e2e-spec.ts` | New | 4 e2e: master reachability, operador_org 403, phone > 30, role_id 404 |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| El cambio rompe tests existentes que asumían `permissions = []` al crear | Low | Buscar con `grep "adminCreate"` en los specs; los specs previos (T5.6) testean que `permissions: []` se persiste. Actualizar esos tests para esperar el nuevo comportamiento cuando `role_id` viene. |
| El cambio rompe el flujo de invitación (T3.6) si la fila admin-bootstrap se usa después | Low | El flujo de invitación `redeem` inserta una **nueva** fila (`InvitationsService.redeem:212-225`); la fila admin-bootstrap queda huérfana pero no se lee. La duplicación de email es un problema pre-existente, fuera de scope. |
| El actor no-master no puede asignar un rol con `permissions` que incluyan `REVEAL incidents` | Low | El guard `assertCanGrantRole` (en `assignRole`) sólo aplica al flujo de asignación posterior (T3.2). El alta directo via `adminCreate` **no** verifica permisos del rol. Esto es coherente con el comportamiento actual de `adminCreate` y con `adminUpdate` (que también acepta cualquier role_id). Es un gap de seguridad que este change **no cierra** (es pre-existente). |
| `phone` con formato libre (no se valida como `+593...`) | Low | El campo es opcional y `MaxLength(30)`. La validación de formato estricto (Ecuador: `+593` o `09`) la hace el frontend con `Validators.pattern`. Backend acepta cualquier string ≤ 30 chars, igual que el `updateProfile` actual. |

---

## Rollback Plan

- Revertir el commit que agrega `phone` al DTO.
- Revertir la denormalización de permisos en `adminCreate` (dejar
  `permissions: []`).
- Sin rollback de DB (no hay migración).
- Sin impacto al edit (`adminUpdate` mantiene su flujo
  independiente).

---

## Dependencies

- **Front paralelo**: `front/2026-09-08-f6-new-user-form/` —
  el frontend envía `phone` en el payload; este back lo
  acepta.
- **Capability `admin-user-creation-form`** (paralelo): las
  decisiones de UI sobre qué enviar al backend.
- **Capability `user-management`** (T5.6): el endpoint
  `POST /api/users` y el DTO original.

---

## Success Criteria

- [ ] `AdminCreateUserDto` acepta un campo opcional `phone:
      string` con `MaxLength(30)`.
- [ ] `UsersService.adminCreate()` con `role_id` carga el
      `RoleEntity`, copia `role.permissions` a
      `user.permissions`, y bumpea `permissionVersion` (1 → 2).
- [ ] `UsersService.adminCreate()` con `phone` persiste el
      valor en la columna `users.phone`.
- [ ] `UsersService.adminCreate()` sin `role_id` mantiene
      `permissions = []` (backward compatible con tests
      pre-existentes que asuman ese comportamiento).
- [ ] Tests del DTO: phone válido pasa; phone > 30 chars
      falla; phone ausente pasa.
- [ ] Tests del service: con `role_id` se copian
      permissions; sin `role_id` permissions queda `[]`.
- [ ] `pnpm test` verde, `pnpm run lint` verde, `pnpm run
      typecheck` verde.
- [ ] Verificar que `adminUpdate` y el flujo de invitación
      siguen funcionando sin cambios.
- [ ] No hay migración nueva en `database/migrations/` aparte de
      0049 (que cierra un gap pre-existente documentado arriba).

---

## Out of Scope explícito

- **Flag `is_active` en el DTO**: el alta siempre crea
  usuarios activos.
- **Geolocalización**: cantón/parroquia/zona no existen en
  BD; F7 los agrega.
- **SMS**: canal de notificación sólo email.
- **Cache invalidation en el alta**: usuarios nuevos no
  tienen sesión; el cache se puebla en el primer login.
- **Validación de formato de `phone` (Ecuador)**: el campo es
  libre hasta 30 chars; la validación de prefijo la hace el
  frontend.
- **Reasignación de fila admin-bootstrap al redeem**: la
  duplicación email es pre-existente y queda para otro
  change.
- **`assertCanGrantRole` en el alta**: gap de seguridad
  pre-existente, fuera de scope de F6.
- **Nuevo e2e para `adminCreate` reachability** — SÍ es
  scope de F6. El e2e pre-existente de T5.6 testeó el
  endpoint con un master que se ASUMÍA tenía `CREATE users`
  — el catálogo tenía el gap, así que el master nunca tuvo
  el perm, pero los specs pasaban porque la auth del e2e
  no usa el guard real (usa un mock o un usuario con rol
  distinto). F6 agrega un e2e que prueba el camino real
  (login como master → POST /api/users) y sirve como
  regression guard para el catálogo. Ver
  `backend/test/e2e/admin-create-user-roles.e2e-spec.ts`.
