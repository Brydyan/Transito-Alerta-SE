# Tasks: GET /api/roles/stats

> Cambios atómicos de 0.5-1.5 h. Change chico: 1 endpoint + 1
> service method + 1 DTO + restauración frontend.

---

## Fase 1: DTO (back)

- [x] **S.1.1** Crear
  `backend/src/modules/roles/dto/role-stats.dto.ts` con la
  clase `RoleStatsDto` (3 campos `number` no opcionales).

---

## Fase 2: Service method (back)

- [x] **S.2.1** En
  `backend/src/modules/roles/roles.service.ts`, agregar
  método público `async getStats(): Promise<RoleStatsDto>`:
  - Query roles vivos (`deletedAt: IsNull()`)
  - Set de permission strings únicos → `totalPermissions`
  - Set de resources (split de "ACTION resource") →
    `protectedModules`
  - `userRepo.count({ roleId: Not(IsNull()), deletedAt:
    IsNull() })` → `assignedUsers`
- [x] **S.2.2** Verificar que `userRepo` ya está inyectado.
  Sí está (línea 44 del constructor). Sin cambios.

---

## Fase 3: Tests del service (back)

- [x] **S.3.1** En
  `backend/src/modules/roles/roles.service.spec.ts`, agregar
  3-4 tests al `describe('RolesService')`:
  - Test A: 5 roles con 124 perms únicos (12 recursos) +
    85 users asignados → stats correctas
  - Test B: 3 roles con `permissions: []` + 3 users
    asignados → `{0, 0, 3}`
  - Test C: 1 rol con permission duplicado
    (`'READ users'` en 2 roles) → `totalPermissions = 1`
  - Test D: 1 rol soft-deleted excluido del cálculo
  - Test E (opcional): permission malformada
    (`'malformed'`) → se cuenta en `totalPermissions` pero
    no en `protectedModules`

> **Nota**: los 5 tests fueron escritos y pasan (`rtk jest --testPathPatterns='roles.service.spec' --testNamePattern='getStats'` → 9/9 PASS contando los 4 sub-tests de los describe blocks y 1 de un describe previo).

---

## Fase 4: Controller endpoint (back)

- [x] **S.4.1** En
  `backend/src/modules/roles/roles.controller.ts`, agregar
  `@Get('stats')` ANTES de `@Get(':id')` (línea 63):
  - `@RequirePermission('READ')`
  - Llama a `this.rolesService.getStats()`
  - Tipo de retorno: `Promise<RoleStatsDto>`

---

## Fase 5: Verificación end-to-end backend

- [x] **S.5.1** `cd backend && pnpm test` — todos los
  suites verdes (+3-4 tests nuevos)
- [x] **S.5.2** `pnpm run lint` — 0 errores nuevos
- [x] **S.5.3** `pnpm run typecheck` — 0 errores
- [x] **S.5.4** `pnpm run build` — sin errores
- [ ] **S.5.5** Test manual: backend arriba, hacer
  `GET /api/roles/stats` con curl, verificar 200 + JSON
  correcto _(no ejecutado en este change — el backend
  local no estaba corriendo; se verifica en staging)_
- [ ] **S.5.6** Test manual: sin `READ` permission,
  verificar 403 _(idem S.5.5)_

---

## Fase 6: Frontend — restaurar loadStats()

- [x] **S.6.1** En
  `frontend/src/app/features/admin/roles/roles.component.ts`:
  - Agregar `this.loadStats();` después de
    `this.loadRoles();` en `ngOnInit` (línea 109)
  - Restaurar el método privado `loadStats()` (18 líneas
    idénticas a las que quitó el commit 9d19888c1): pipe con
    `takeUntilDestroyed(this.destroyRef)` + `catchError`
    degradando a `{0,0,0}` + `subscribe(stats =>
    this.stats.set(stats))`
- [x] **S.6.2** Verificar que `takeUntilDestroyed` y
  `catchError` ya están importados (línea 12-13). Sí.

---

## Fase 7: Verificación end-to-end frontend

- [ ] **S.7.1** `cd frontend && pnpm test` — los 2 tests
  fallidos (`roles.component.spec.ts:70,77`) ahora pasan
  _(el `pnpm test` del PR CI mostró estos 2 fallando
  todavía — ver `apply-progress.md` S.7.1 nota)_
- [x] **S.7.2** `pnpm run lint` — 0 errores nuevos
  _(no corrido localmente; lint del CI fue veredicto
  1 error pre-existente `dashboard.component.ts:11`,
  0 nuevos)_
- [x] **S.7.3** `pnpm run build` — verde
- [ ] **S.7.4** Test manual: con backend arriba, abrir
  `/app/admin/roles` y verificar que las 3 stats cards
  muestran números reales (no 0/0/0) _(no ejecutado —
  requiere integración live con backend + Redis
  flusheado, fuera de scope de este PR)_
- [ ] **S.7.5** Test manual: tirar el backend, refrescar
  la página, verificar que las cards muestran 0/0/0 sin
  error en consola (gracias al `catchError`) _(idem
  S.7.4)_

---

## Total Story Points

~3 pts back + ~0.5 pts front = ~3.5 pts. Change chico pero
necesario.

---

## Archivos NO tocados

- `backend/src/modules/roles/roles.module.ts` — el service ya
  tiene acceso a `UserEntity` y `RoleEntity`. Sin cambios.
- `database/MIGRATION_LOG.md` — 0 migraciones.
- `database/migrations/` — 0 archivos nuevos.
- `frontend/src/app/features/admin/roles/roles.component.html` —
  el `<app-stats-cards>` ya renderiza. Sin cambios.
- `frontend/src/app/features/admin/roles/services/roles.service.ts` —
  `getRoleStats()` ya existe. Sin cambios.
- `frontend/src/app/features/admin/roles/services/roles.service.spec.ts` —
  los 2 tests del service ya están y pasan. Sin cambios.
