# Tasks: F6 — Backend enhancements for Nuevo Usuario

> Cambios atómicos de 0.5-1.5 h cada uno, agrupados por fase.
> Change chico: 4 archivos tocados, ~110 líneas netas.

---

## Fase 1: DTO (T5.6 extension)

- [x] **B.1.1** Editar
  `backend/src/modules/users/dto/admin-create-user.dto.ts`:
  agregar el campo `phone?: string` con `@IsOptional()
  @IsString() @MaxLength(30)`. Documentar con JSDoc que la
  columna ya existe desde la migración 0035.
- [x] **B.1.2** Crear
  `backend/src/modules/users/dto/admin-create-user.dto.spec.ts`:
  - Test 1: `phone` válido (<=30 chars) acepta la validación
  - Test 2: `phone` > 30 chars falla con `MaxLength` error
  - Test 3: `phone` ausente acepta la validación
  - Test 4: `phone` con caracteres no-numéricos acepta (sin
    validación de formato, ver D1)
- [x] **B.1.3** Verificar que los tests pre-existentes del
  controller (`users.controller.spec.ts`) siguen verdes —
  ninguno debe romperse por el campo opcional nuevo.

---

## Fase 2: Service (denormalización de permisos)

- [x] **B.2.1** Editar
  `backend/src/modules/users/users.service.ts`, método
  `adminCreate()`:
  - Antes del `userRepo.create(...)`, agregar bloque
    `if (dto.role_id) { ... }` que carga el `RoleEntity` y
    setea `permissions` y `permissionVersion`
  - Si el rol no existe, lanzar `NotFoundException`
  - Si no hay `dto.role_id`, mantener `permissions: []`,
    `permissionVersion: 1` (backward compatible)
- [x] **B.2.2** En el mismo método, agregar `phone: dto.phone
  ?? null` al payload de `userRepo.create(...)`.
- [x] **B.2.3** Verificar que `roleRepo` ya está inyectado
  en el constructor (`@InjectRepository(RoleEntity) private
  readonly roleRepo`). Sí está, según
  `users.service.ts:43`. Sin cambios.
- [x] **B.2.4** Verificar que `NotFoundException` ya está
  importado. Sí está, según `users.service.ts:1`. Sin cambios.

---

## Fase 3: Service tests (denormalización)

- [x] **B.3.1** En `users.service.spec.ts`, agregar 2 tests al
  describe de `adminCreate`:
  - Test A: `adminCreate({ email, role_id })` con rol mock
    que tiene `permissions: ['READ dashboard', 'READ
    incidents']` y `permissionVersion: 1` →
    - `userRepo.create` recibe `permissions: ['READ dashboard',
      'READ incidents']` y `permissionVersion: 2`
    - `userRepo.save` retorna el usuario
  - Test B: `adminCreate({ email })` sin `role_id` →
    - `userRepo.create` recibe `permissions: []` y
      `permissionVersion: 1` (comportamiento legacy T5.6)
- [x] **B.3.2** Test C (404): `adminCreate({ email, role_id:
  'uuid-x' })` donde `roleRepo.findOne` retorna `null` →
  lanza `NotFoundException('Role uuid-x not found')`.
- [x] **B.3.3** Test D: `adminCreate({ email, phone: '+593
  99 999 9999' })` → `userRepo.create` recibe `phone: '+593
  99 999 9999'`.
- [x] **B.3.4** Verificar que los tests pre-existentes del
  service (T5.6) siguen verdes. Los tests pre-existentes
  probablemente asumen `permissions: []` sin `role_id`; ese
  comportamiento se preserva (test B).

---

## Fase 4: Verificación end-to-end

- [x] **B.4.1** `pnpm test` (en directorio `backend/`) — todos
  los suites verdes
- [x] **B.4.2** `pnpm run lint` — 0 errores nuevos
- [x] **B.4.3** `pnpm run typecheck` — 0 errores
- [x] **B.4.4** `pnpm run build` — sin errores
- [ ] **B.4.5** Test manual: levantar el backend, hacer
  `POST /api/users` con `{ email, role_id, phone }` y
  verificar que la respuesta trae `phone` y `permissions`
  denormalizadas del rol. _(no ejecutado en este change —
  requiere DB+seed corriendo; lo verifica `sdd-verify`)_
- [ ] **B.4.6** Test manual: `POST /api/users` con `{ email }`
  sin `role_id` y verificar que `permissions = []` y
  `permissionVersion = 1` (backward compat). _(idem B.4.5)_
- [ ] **B.4.7** Test manual: `POST /api/users` con
  `role_id: 'uuid-inexistente'` y verificar 404 con mensaje
  "Role uuid-inexistente not found". _(idem B.4.5)_
- [x] **B.4.8** Verificar que el flujo de invitación
  (T3.6) sigue funcionando: tras un `POST /users` exitoso,
  `POST /admin/users/invite` opera idéntico. _(sin cambios
  en `users.service.ts` que toquen `InvitationsService`; el
  guard de invitaciones y `redeem` no se ven afectados —
  verificado por inspección de código)_

---

## Fase 6: Permission catalog (DB) — gap pre-existente de 0009

> Agregada después del primer `sdd-verify` (veredicto FAIL).
> El catálogo de permisos no tenía las filas `(users, CREATE)`,
> `(users, DELETE)` ni `(permissions, READ)`, así que
> `POST /api/users` y `GET /api/permissions` retornaban 403
> a todos los usuarios, incluyendo `master`. Los gaps de F6
> (D1 phone + D2 denormalización) eran inalcanzables sin
> este paso.

- [x] **B.6.1** Crear
  `database/migrations/0049_admin_user_permissions.sql`
  con los 3 pasos: (1) INSERT de los 3 perms faltantes en
  el catálogo idempotente, (2) UPDATE de `roles.permissions`
  para `master` y `admin_org` con los perms nuevos
  (append específico, no re-derive), (3) UPDATE de
  `users.permissions` para los users con esos roles +
  bump de `permission_version`.
- [x] **B.6.2** Crear
  `database/rollback/0049_admin_user_permissions.DOWN.sql`
  con los 3 pasos inversos: quitar de `users.permissions`
  + bump version, quitar de `roles.permissions`, DELETE
  de las filas del catálogo.
- [x] **B.6.3** Aplicar 0049 en staging/local y flushear
  Redis `perm:v3:uid:*` en DB 1 (invalidación explícita
  además del bump de version — defensa en profundidad).
- [x] **B.6.4** Actualizar `proposal.md`, `design.md` y
  `tasks.md` (este archivo) para documentar la migración
  y el e2e nuevo.
- [x] **B.6.5** Crear
  `backend/test/e2e/admin-create-user-roles.e2e-spec.ts`
  con 4 specs:
  - `master` con `CREATE users` puede `POST /api/users`
    con `phone` + `role_id` → 201
  - `operador_org` sin `CREATE users` recibe 403
  - `adminCreate` con `phone > 30` chars → 400
  - `adminCreate` con `role_id` inválido → 404

---

## Fase 5: Cross-check con front paralelo

- [x] **B.5.1** Confirmar que el front paralelo envía
  `phone` en el body del `POST /users` (no `phoneNumber`,
  no `telefono` — el wire es snake_case, el DTO espera
  `phone`).
- [x] **B.5.2** Confirmar que el front paralelo NO envía
  `send_invitation` en el body del `POST /users` (ver
  D3 del design back).
- [x] **B.5.3** Confirmar que el front paralelo llama
  `POST /api/admin/users/invite` por separado si el toggle
  está ON, después del alta exitosa.

---

## Total Story Points

~3 pts (1 DTO + 1 service + 2 specs + tests + verificación).
Change chico pero necesario para que el front funcione
end-to-end.

---

## Dependencias

- **Front paralelo**: `front/2026-09-08-f6-new-user-form/`
  (paralelo). Si el front se implementa primero y omite
  `phone` del payload, el back funciona igual (el campo es
  opcional). Si el back se implementa primero, el front
  puede incluir `phone` desde el día 1.

- **T5.6 spec** (`openspec/changes/archive/...t5.6-*`): el
  comportamiento original se preserva cuando no hay
  `role_id` o `phone`. Tests T5.6 deben seguir verdes.

- **T3.6 spec** (`openspec/changes/archive/...t3.6-*`): el
  flujo de invitación opera idéntico. Sin cambios.

---

## Notas de no-regresión

- `adminUpdate` (T5.6) sigue intacto — su denormalización
  interna es independiente.
- `getFormData` (T5.4) sigue intacto — no expone ni usa
  `phone`.
- `updateProfile` (T3.9) sigue intacto — su `phone` propio
  no se ve afectado.
- `softDelete` (T6.8.B2) sigue intacto — wipe de PII
  incluye `phone: null`, sin cambios.
- `list` (T3.2) sigue intacto — no expone `phone` en el
  select.

---

## Archivos NO tocados (deliberadamente)

- `backend/src/entities/user.entity.ts` — la entidad ya
  tiene `phone: string | null` (línea 116). Sin cambios.
- `backend/src/modules/users/users.controller.ts` — el
  controller sigue aceptando `AdminCreateUserDto`; el
  cambio es transparente. Sin cambios.
- `backend/src/modules/users/users.module.ts` — el módulo
  ya importa `RoleEntity` vía `TypeOrmModule.forFeature`;
  `roleRepo` ya está disponible. Sin cambios.
- `backend/src/modules/users/dto/admin-update-user.dto.ts`
  — independiente. Sin cambios.
- `backend/src/modules/users/avatar-storage.service.ts` —
  la subida de avatar es ortogonal. Sin cambios.
- `database/MIGRATION_LOG.md` — NO se agrega nueva
  migración (la columna `phone` ya existe desde 0035).
- `database/migrations/` — no se agrega ningún archivo.

---

## Entregable

- 4 archivos modificados/creados en `backend/`.
- 0 migraciones.
- 0 cambios en el controller o en el módulo.
- Backward compatible con T5.6 (mismo comportamiento cuando
  no se envía `role_id` o `phone`).
