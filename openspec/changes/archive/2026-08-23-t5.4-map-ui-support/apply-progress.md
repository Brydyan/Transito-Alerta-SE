# Apply Progress: T5.4 Map UI Support

**Change**: t5.4-map-ui-support
**Implementer**: Minimax (Mavis)
**Date**: 2026-08-23
**Status**: READY FOR VERIFY

---

## Resumen

Dos endpoints de referencia para la UI: `GET /api/map/filters` (categorías de incidente)
y `GET /api/users/form-data` (roles + organizaciones para formularios de gestión de usuarios).
Sin migraciones; cambios aditivos en módulos `map` (nuevo) y `users` (extendido).

## Tareas completadas

### Fase 0 — Constantes
- ✅ `backend/src/modules/users/role-exclusions.constants.ts` con `SYSTEM_ONLY_ROLES` (`as const` tuple)
  y `SYSTEM_ADMIN_ROLE_NAME` para reusar en `UsersService.getFormData`.

### Fases 1+2+4 — MapModule (nuevo)
- ✅ `backend/src/modules/map/map.module.ts` con `TypeOrmModule.forFeature([IncidentCategoryEntity])` (D1 — sin importar el módulo completo).
- ✅ `backend/src/modules/map/map-support.service.ts` con `getMapFilters()` que consulta
  `id, name ORDER BY name ASC` y devuelve `{data: {categories: [...]}}`.
- ✅ `backend/src/modules/map/dto/category.dto.ts` y `map-filters-response.dto.ts`.
- ✅ `backend/src/modules/map/map.controller.ts` con `@Controller('map')`, `@UseGuards(JwtAuthGuard)`
  (sin `PermissionGuard` — solo autenticación; el catálogo es global, no resource-gated).
- ✅ Registrado en `AppModule.imports` después de `IncidentCategoriesModule`.

### Fase 3 — Unit tests map-support (3/3 ✓)
- Devuelve categorías en orden de la query (el sort es del DB via `order`).
- Devuelve `[]` cuando no hay categorías.
- Query pide `select: ['id', 'name']` (verifica no leak de otros campos).

### Fases 5+7 — Users form-data
- ✅ `backend/src/modules/users/dto/form-data-response.dto.ts` con `RoleDto`, `OrganizationDto`,
  y `FormDataResponseDto`.
- ✅ `UsersService.getFormData(currentUser)`:
  - System admin: `where: {}` para roles (sin filtro), todos los orgs.
  - No-system-admin: `where: { name: Not(In([...])) }` para excluir `SYSTEM_ONLY_ROLES`, y
    `where: { id: currentUser.organizationId }` para orgs.
  - Edge case: caller no-system-admin sin `organizationId` → `organizations: []` sin tocar el repo de orgs.
- ✅ `UsersService` ahora inyecta `@InjectRepository(OrganizationEntity) orgRepo`.
- ✅ `UsersModule` agrega `OrganizationEntity` al `TypeOrmModule.forFeature`.
- ✅ `UsersController` agrega `@Get('form-data')` con `@RequirePermission('READ', 'users')`,
  declarado **antes** de cualquier `:id` route (defense in depth, aunque no existe `:id` actualmente).

### Fase 6 — Unit tests getFormData (4/4 ✓)
- Archivo separado: `users.service.form-data.spec.ts` (rebuild del testing module — la spec
  original tiene muchos providers no relevantes para este método).
- System admin: roles incluye system-only, organizations todos.
- Org admin: roles excluye system-only, organizations solo el propio.
- Caller no-system-admin sin org: roles normales, `organizations: []`, **orgRepo.find NO se llama**.
- Ambos queries piden `order: { name: 'ASC' }`.

### Fase 8 — E2E (6/6 ✓ en 18.4s)
- `backend/test/e2e/map-ui-support.e2e-spec.ts`:
  - Seed 3 categorías en orden no alfabético → `GET /map/filters` devuelve alfabético.
  - 401 sin auth.
  - System admin ve todos los roles + ambos orgs.
  - Org admin no ve `admin_sistema`/`operador_sistema`, solo su org.
  - Sin `READ users` → 403.
  - Sin auth → 401.

---

## Verificación final

| Check | Resultado |
|-------|-----------|
| `pnpm test` (unit) | ✅ 80 suites / 734 tests (+7 nuevos: 3 map-support + 4 getFormData) |
| `pnpm run test:e2e --runInBand` | ✅ 17 suites / 152 tests (+6 nuevos del workflow) |
| `pnpm run typecheck` | ✅ 0 errores |
| `pnpm run lint` | ✅ 0 errores, 16 warnings pre-existentes |
| `pnpm run build` | ✅ clean |

## Desviaciones del diseño

1. **D1 confirmado**: `MapModule` importa `TypeOrmModule.forFeature([IncidentCategoryEntity])`
   directamente, no el `IncidentCategoriesModule` completo. Evita el pull-in del controller
   y service permission-gated del módulo existente.
2. **Unit tests de getFormData en archivo separado** (`users.service.form-data.spec.ts`):
   la spec original de `users.service.spec.ts` mockea `avatarStorage`, `authService`,
   `sessionsRepository` (no relevantes para `getFormData`). Recrear el `TestingModule` solo
   con los 2 repos relevantes da un test más limpio y rápido.
3. **Sort no se testea en memoria** — el test unit de map-support verifica que la query
   pide `order: { name: 'ASC' }` y devuelve lo que el repository le pasa. El sort real es
   responsabilidad del DB; el e2e test confirma el end-to-end con datos reales.

## Archivos modificados

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `backend/src/modules/users/role-exclusions.constants.ts` | nuevo | `SYSTEM_ONLY_ROLES`, `SYSTEM_ADMIN_ROLE_NAME` |
| `backend/src/modules/map/map.module.ts` | nuevo | `MapModule` |
| `backend/src/modules/map/map-support.service.ts` | nuevo | `MapSupportService` |
| `backend/src/modules/map/map.controller.ts` | nuevo | `MapController` |
| `backend/src/modules/map/dto/category.dto.ts` | nuevo | `CategoryDto` |
| `backend/src/modules/map/dto/map-filters-response.dto.ts` | nuevo | `MapFiltersResponseDto` |
| `backend/src/modules/map/map-support.service.spec.ts` | nuevo | 3 unit tests |
| `backend/src/modules/users/dto/form-data-response.dto.ts` | nuevo | `FormDataResponseDto` |
| `backend/src/modules/users/users.service.ts` | modificado | `getFormData()` + `orgRepo` injection |
| `backend/src/modules/users/users.controller.ts` | modificado | `GET form-data` route |
| `backend/src/modules/users/users.module.ts` | modificado | `OrganizationEntity` to forFeature |
| `backend/src/modules/users/users.service.form-data.spec.ts` | nuevo | 4 unit tests |
| `backend/src/app.module.ts` | modificado | `MapModule` import |
| `backend/test/e2e/map-ui-support.e2e-spec.ts` | nuevo | 6 e2e tests |
| `openspec/changes/t5.4-map-ui-support/tasks.md` | modificado | todas `[x]` |

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/t5.4-map-ui-support/specs/**`
- `openspec/changes/t5.4-map-ui-support/design.md`
- `openspec/changes/t5.4-map-ui-support/proposal.md`
- `backend/src/modules/incident-categories/**` (MapModule reusa solo el repository)
- `database/migrations/**` (sin migraciones)

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría.
