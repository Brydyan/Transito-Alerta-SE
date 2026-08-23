# Tasks: T5.3 Operator Tracking — GPS Location + Operator Dashboard

Source: `proposal.md`, `specs/operator-tracking/spec.md`, `design.md`.
No new DB migrations. Strict TDD. Run `npm test` baseline before Phase 1.

## Phase 0: Module Scaffold

- [ ] 0.1 Create `backend/src/modules/operators/` directory.
- [ ] 0.2 Create `backend/src/modules/operators/operators.module.ts` with `@Module({})` stub.
      Import `TypeOrmModule.forFeature([IncidentEntity, IncidentCategoryEntity])`. Wire Redis
      via `IORedis` or the existing `ioredis` connection token (check `app.module.ts` for the
      existing Redis provider token).
- [ ] 0.3 Add `OperatorsModule` to `AppModule` imports.

## Phase 1: Constants + DTOs

- [ ] 1.1 Create `backend/src/modules/operators/operator-role.constants.ts` with:
      `OPERATOR_PING_ROLES = ['operador_organizacion', 'operador_sistema']`
      `OPERATOR_QUERY_ROLES = ['operador_organizacion', 'operador_sistema', 'admin_organizacion']`
- [ ] 1.2 Create `backend/src/modules/operators/dto/update-location.dto.ts` with `@IsNumber()
      @Min(-90) @Max(90) lat` and `@IsNumber() @Min(-180) @Max(180) lng`.
- [ ] 1.3 Create `backend/src/modules/operators/dto/dashboard-query.dto.ts` with `inicio?`,
      `fin?` (IsDateString), `location_id?` (IsUUID), `page?` (IsInt, min 1), `per_page?`
      (IsInt, 1–50).
- [ ] 1.4 Create `backend/src/modules/operators/dto/operator-location.dto.ts` with `userId`,
      `organizationId`, `lat`, `lng`, `updatedAt` (ISO string).
- [ ] 1.5 Create `backend/src/modules/operators/dto/operator-dashboard-response.dto.ts` with
      `stats: {total_assigned, in_progress, resolved_today}`, `incidents: DashboardIncidentDto[]`,
      `pagination: PaginationMeta`.

## Phase 2: Location Service

- [ ] 2.1 Create `backend/src/modules/operators/operator-location.service.ts` injecting the
      `ioredis` connection (or `CACHE_MANAGER` — verify which Redis client token is used in
      the project for raw commands like `HSET`/`EXPIRE`/`HGETALL`).
- [ ] 2.2 Implement `record(userId: string, orgId: string, lat: number, lng: number): Promise<void>`:
      - `HSET operators:loc:{orgId} {userId} {JSON.stringify({userId, organizationId: orgId, lat, lng, updatedAt: new Date().toISOString()})}`
      - `EXPIRE operators:loc:{orgId} 300`
- [ ] 2.3 Implement `activeFor(orgId: string | null, isSystemAdmin: boolean): Promise<OperatorLocationDto[]>`:
      - If `isSystemAdmin`: scan `operators:loc:*` keys, `HGETALL` each.
      - Else: `HGETALL operators:loc:{orgId}`.
      - Parse JSON values, return array.

## Phase 3: Unit Tests (Location Service)

- [ ] 3.1 `backend/src/modules/operators/operator-location.service.spec.ts`:
      - `record`: calls HSET + EXPIRE with correct key and TTL.
      - `record`: called twice updates the entry (HSET overwrites) and resets TTL.
      - `activeFor` org scope: returns only entries for the given org.
      - `activeFor` system admin: aggregates across multiple org keys.
      - `activeFor` empty hash: returns empty array.

## Phase 4: Dashboard Service

- [ ] 4.1 Create `backend/src/modules/operators/operator-dashboard.service.ts` injecting `DataSource`.
- [ ] 4.2 Implement `forOperator(userId: string, filters: DashboardQueryDto): Promise<OperatorDashboardResponseDto>`:
      - Run stats query: COUNT total, in_progress, resolved_today for `claimed_by = userId OR assigned_to = userId`.
      - Run paginated incident query with LEFT JOIN to `incident_categories`.
      - Apply `inicio`/`fin` date filters on `incidents.created_at`.
      - Apply `location_id` filter.
      - Return `{stats, incidents, pagination}`.

## Phase 5: Unit Tests (Dashboard Service)

- [ ] 5.1 `backend/src/modules/operators/operator-dashboard.service.spec.ts`:
      - Returns correct `in_progress` count for operator's claimed incidents.
      - `resolved_today` counts only incidents resolved on the current date.
      - Date filter on `inicio`/`fin` narrows incident list.
      - Empty result returns `{stats: {0,0,0}, incidents: [], pagination: {...}}`.

## Phase 6: Controller

- [ ] 6.1 Create `backend/src/modules/operators/operators.controller.ts`:
      - `@Post('location')` → `@UseGuards(JwtAuthGuard)` + role check in service
        → `locationService.record(user.id, user.organizationId, dto.lat, dto.lng)` → `{status: 'ok'}`.
      - `@Get('locations')` → `@UseGuards(JwtAuthGuard)` + role check in controller
        → `locationService.activeFor(user.organizationId, isSystemAdmin)`.
      - `@Get('dashboard')` → `@UseGuards(JwtAuthGuard)` + `@RequirePermissions('READ dashboard')`
        + operator role guard → `dashboardService.forOperator(user.id, query)`.
- [ ] 6.2 Implement role guard logic in controller: check `user.roleName` against `OPERATOR_PING_ROLES`
      or `OPERATOR_QUERY_ROLES`; system admin passes all checks.
- [ ] 6.3 Register controller and both services in `OperatorsModule`.
- [ ] 6.4 Add `@Controller('operator')` prefix to `OperatorsController`.

## Phase 7: E2E Tests

- [ ] 7.1 `backend/test/e2e/operator-tracking.e2e-spec.ts`:
      - Seed org + 2 operators + 1 citizen user.
      - Operator pings location → 200, Redis key exists with TTL ≈ 300.
      - Citizen pings location → 403.
      - Invalid lat (> 90) → 422.
      - GET locations (org-admin) → sees operator, not citizen.
      - GET locations (system admin) → sees all orgs.
      - GET dashboard (operator) → returns stats + incidents.
      - GET dashboard (non-operator) → 403.
      - Unauthenticated → 401.

## Phase 8: Lint + Type Check

- [ ] 8.1 `npm run lint` — zero new violations.
- [ ] 8.2 `npm run typecheck` — no errors.
- [ ] 8.3 `npm run build` — clean.
- [ ] 8.4 `npm test && npm run test:e2e` — full suite green.
