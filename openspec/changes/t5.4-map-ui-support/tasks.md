# Tasks: T5.4 Map UI Support — Map Filters + Users Form-Data

Source: `proposal.md`, `specs/map-ui-support/spec.md`, `design.md`.
No new migrations. Strict TDD. Run `npm test` baseline before Phase 1.

## Phase 0: Constants

- [ ] 0.1 Create `backend/src/modules/users/role-exclusions.constants.ts` (or add to existing
      constants file) with `SYSTEM_ONLY_ROLES = ['admin_sistema', 'operador_sistema', 'admin_legacy']
      as const`.

## Phase 1: Map Module Scaffold

- [ ] 1.1 Create `backend/src/modules/map/` directory.
- [ ] 1.2 Create `backend/src/modules/map/map.module.ts`:
      ```typescript
      @Module({
        imports: [TypeOrmModule.forFeature([IncidentCategoryEntity])],
        controllers: [MapController],
        providers: [MapSupportService],
      })
      export class MapModule {}
      ```
- [ ] 1.3 Add `MapModule` to `AppModule` imports.

## Phase 2: Map Support Service

- [ ] 2.1 Create `backend/src/modules/map/map-support.service.ts` injecting
      `@InjectRepository(IncidentCategoryEntity) categoryRepo`.
- [ ] 2.2 Implement `getMapFilters(): Promise<MapFiltersResponseDto>`:
      - `categoryRepo.find({ select: ['id', 'name'], order: { name: 'ASC' } })`
      - Return `{ data: { categories: rows } }`.

## Phase 3: Unit Tests (Map Support Service)

- [ ] 3.1 `backend/src/modules/map/map-support.service.spec.ts`:
      - Returns categories sorted alphabetically.
      - Returns empty array when no categories exist.
      - Returned items contain only `id` and `name`.

## Phase 4: Map Controller

- [ ] 4.1 Create `backend/src/modules/map/map.controller.ts`:
      - `@Controller('map')`, `@UseGuards(JwtAuthGuard)`.
      - `@Get('filters')` → `mapSupportService.getMapFilters()` → 200.
- [ ] 4.2 Create `backend/src/modules/map/dto/map-filters-response.dto.ts` with
      `{ data: { categories: { id: string; name: string }[] } }`.

## Phase 5: Users Form-Data — Service

- [ ] 5.1 Add `getFormData(currentUser: UserEntity): Promise<FormDataResponseDto>` to
      `backend/src/modules/users/users.service.ts`:
      - Determine `isSystemAdmin` by checking `currentUser.roleName === 'admin_sistema'` or
        equivalent role check (consistent with how other methods do it in this service).
      - Roles query: `SELECT id, name FROM roles ORDER BY name`; exclude `SYSTEM_ONLY_ROLES`
        when not system admin.
      - Organizations query: `SELECT id, name FROM organizations ORDER BY name`; filter to
        `WHERE id = currentUser.organizationId` when not system admin.
      - Return `{ roles, organizations }`.
- [ ] 5.2 Create `backend/src/modules/users/dto/form-data-response.dto.ts` with
      `roles: {id:string,name:string}[]` and `organizations: {id:string,name:string}[]`.

## Phase 6: Unit Tests (Users Service — getFormData)

- [ ] 6.1 Add to `backend/src/modules/users/users.service.spec.ts` (or new file):
      - System admin: all roles returned (no exclusion), all orgs returned.
      - Org-admin: system-only roles excluded, only own org returned.
      - Non-system admin with null `organizationId`: organizations returns empty array (edge case).
      - Results are sorted by name.

## Phase 7: Users Controller — form-data Route

- [ ] 7.1 Add to `backend/src/modules/users/users.controller.ts`:
      - `@Get('form-data')` → `@UseGuards(JwtAuthGuard)` + `@RequirePermissions('READ users')`
        → `usersService.getFormData(req.user)`.
- [ ] 7.2 Verify route order: `GET /users/form-data` is registered before `GET /users/:id`
      to prevent `'form-data'` from being matched as an `:id` param.

## Phase 8: E2E Tests

- [ ] 8.1 `backend/test/e2e/map-ui-support.e2e-spec.ts`:
      - Seed 3 categories in random insertion order.
      - `GET /api/map/filters` → 200, categories sorted alphabetically.
      - Unauthenticated `GET /api/map/filters` → 401.
      - Seed roles (including admin_sistema) + 2 orgs.
      - System admin `GET /api/users/form-data` → all roles, both orgs, sorted.
      - Org-admin `GET /api/users/form-data` → excludes system-only roles, only own org.
      - Citizen (no `READ users`) `GET /api/users/form-data` → 403.
      - Unauthenticated → 401.

## Phase 9: Lint + Type Check

- [ ] 9.1 `npm run lint` — zero new violations.
- [ ] 9.2 `npm run typecheck` — no errors.
- [ ] 9.3 `npm run build` — clean.
- [ ] 9.4 `npm test && npm run test:e2e` — full suite green.
