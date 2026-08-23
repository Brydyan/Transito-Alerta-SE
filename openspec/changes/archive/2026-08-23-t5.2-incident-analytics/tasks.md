# Tasks: T5.2 Incident Analytics — Stats, Weekly-Stats, Feed, Export CSV

Source: `proposal.md`, `specs/incident-analytics/spec.md`, `design.md`.
No new migrations. Strict TDD. Run `npm test` baseline before Phase 1.

## Phase 0: DTOs

- [x] 0.1 Create `backend/src/modules/incidents/dto/stats-query.dto.ts` with class-validator
      decorators: `inicio?`, `fin?` (IsDateString), `tipo_id?`, `ciudad_id?`, `provincia_id?`,
      `pais_id?` (IsUUID, optional).
- [x] 0.2 Create `backend/src/modules/incidents/dto/weekly-stats-query.dto.ts` — same fields as
      `StatsQueryDto`.
- [x] 0.3 Create `backend/src/modules/incidents/dto/feed-query.dto.ts` with `bbox?` (IsString),
      `zoom?` (IsInt, 1–22), `status?`, `priority?`, `location_id?`, `incident_category_id?`,
      `per_page?` (IsInt, 1–500), `page?` (IsInt, min 1).
- [x] 0.4 Create `backend/src/modules/incidents/dto/export-query.dto.ts` (extends StatsQueryDto).
- [x] 0.5 Create `backend/src/modules/incidents/dto/stats-response.dto.ts` — interfaces for
      `IncidentStatsResponseDto`, `WeeklyStatsResponseDto`, `FeedResponseDto`, `FeedItemDto`.

## Phase 1: Analytics Service

- [x] 1.1 Create `backend/src/modules/incidents/incident-analytics.service.ts` injecting
      `DataSource` and `CACHE_MANAGER`.
- [x] 1.2 Implement `buildOrgScope(user: UserEntity): string | null` helper — returns `'system'`,
      `'org:{id}'`, or `'user:{id}'` based on role.
- [x] 1.3 Implement `getStats(query: StatsQueryDto, user: UserEntity): Promise<IncidentStatsResponseDto>`:
      - Compute cache key: `stats:{orgScope}:{filterHash}`.
      - Try Redis cache; on miss, compute and cache for 3600s.
      - Compute: `total`, `by_status` (zero-filled for all 3 statuses), `by_priority`
        (zero-filled for all 4 priorities), `recent_count` (created_at >= now - 7d),
        `locations_count` (DISTINCT location_id), `average_resolution_time` (AVG EPOCH),
        `trends` (current vs previous equal-length period), `top_categories` (top 5 by count).
      - Apply org scope via WHERE clause on `organization_id`.
      - Apply date/category/location filters from `query`.
- [x] 1.4 Implement `getWeeklyStats(query: WeeklyStatsQueryDto, user: UserEntity): Promise<WeeklyStatsResponseDto>`:
      - Default window: last 10 days (`endDate = now, startDate = now - 9 days`).
      - Validate `fin >= inicio` when both provided (422 if not).
      - Build daily series by fetching `recibidas` (GROUP BY created_at date) and `resueltas`
        (GROUP BY resolution_date date, status = 'resolved').
      - Zero-fill every day in the range that has no data.
      - Spanish day labels: `['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dayOfWeek]`.
      - Cache 3600s.

## Phase 2: Unit Tests (Analytics Service)

- [x] 2.1 `backend/src/modules/incidents/incident-analytics.service.spec.ts`:
      - `getStats` org scoping: system admin gets total across orgs; org-admin gets only own org.
      - `getStats` zero-fill: all status/priority keys present even with no data.
      - `getStats` trends: positive total_pct when current > previous.
      - `getWeeklyStats` default window: 10 entries.
      - `getWeeklyStats` zero-fill: missing days present with 0.
      - `getWeeklyStats` fin < inicio: throws UnprocessableEntityException.
      - Cache hit: second call returns cached response without DB query.

## Phase 3: Feed Service

- [x] 3.1 Create `backend/src/modules/incidents/incident-feed.service.ts` injecting
      `DataSource` and `CACHE_MANAGER` (for citizen Redis read model).
- [x] 3.2 Implement `isStaffRole(user: UserEntity): boolean` helper using role name constants.
- [x] 3.3 Implement `getStaffFeed(query: FeedQueryDto, user: UserEntity): Promise<FeedResponseDto>`:
      - Apply org scope.
      - Optional `bbox` filter using PostGIS `ST_Within(location, ST_MakeEnvelope(...))`.
      - Hard cap 500 when `bbox` present (`LIMIT MIN(per_page, 500)`).
      - Joins: `incident_categories`, `organizations`, `users` (slim user shape).
      - Returns `{data: FeedItemDto[], meta: PaginationMeta}`.
- [x] 3.4 Implement `getCitizenFeed(query: FeedQueryDto): Promise<FeedResponseDto>`:
      - Read from Redis key `feed:incidents` (JSON array).
      - On cache miss: fall back to Postgres with no org scope, status filter applied (design D1).
      - Filter by `status`, `organization_id`, `location_id` in memory (or SQL fallback).
      - Paginate result (max 50/page).

## Phase 4: Unit Tests (Feed Service)

- [x] 4.1 `backend/src/modules/incidents/incident-feed.service.spec.ts`:
      - Staff feed: returns org-scoped incidents.
      - Citizen feed: returns Redis data when present.
      - Citizen feed: falls back to Postgres when Redis key absent.
      - bbox cap: never returns > 500 items.

## Phase 5: Export Service

- [x] 5.1 Create `backend/src/modules/incidents/incident-export.service.ts` injecting `DataSource`.
- [x] 5.2 Implement `countFiltered(query: ExportQueryDto, user: UserEntity): Promise<number>`.
- [x] 5.3 Implement `createCsvStream(query: ExportQueryDto, user: UserEntity, cap: number): Readable`:
      - Node.js `PassThrough` stream.
      - Write CSV header row.
      - Fetch rows in batches of 500 (cursor-based or OFFSET) up to `cap`.
      - Write each batch as CSV rows.
      - Fields: id, title, status, priority, organization, category, created_at, resolution_date.

## Phase 6: Unit Tests (Export Service)

- [x] 6.1 `backend/src/modules/incidents/incident-export.service.spec.ts`:
      - CSV header row matches expected columns.
      - Row count capped at 5000 when total > 5000.
      - Filters applied correctly (date range narrows result).

## Phase 7: Controller Wiring

- [x] 7.1 Add to `IncidentsController`:
      - `GET /incidents/stats` → `@RequirePermissions('READ dashboard')` → `analyticsService.getStats()`.
      - `GET /incidents/weekly-stats` → same guard → `analyticsService.getWeeklyStats()`.
      - `GET /incidents/feed` → `JwtAuthGuard` + role dispatch in service → `feedService.getStaffFeed()` or `getCitizenFeed()`.
      - `GET /incidents/export` → `READ dashboard` + `@Res()` streaming → `exportService`.
- [x] 7.2 Register `IncidentAnalyticsService`, `IncidentFeedService`, `IncidentExportService` in
      `IncidentsModule` providers.
- [x] 7.3 Ensure `CacheModule` is imported in `IncidentsModule` (or globally available).
- [x] 7.4 Verify route order: `GET /incidents/stats`, `/weekly-stats`, `/feed`, `/export` are all
      registered BEFORE `GET /incidents/:id` to avoid shadowing.

## Phase 8: E2E Tests

- [x] 8.1 `backend/test/e2e/incident-analytics.e2e-spec.ts`:
      - Seed incidents across 2 orgs.
      - System admin stats → total across both orgs.
      - Org admin stats → only own org.
      - Weekly-stats default → 10 days.
      - Feed staff → paginated, org-scoped.
      - Feed citizen → Redis path (mock or seed Redis).
      - Export → CSV attachment, truncation headers when >5000.
      - Unauthenticated → 401 on all endpoints.
      - Wrong permission → 403 on stats/weekly-stats/export.

## Phase 9: Lint + Type Check

- [x] 9.1 `npm run lint` — zero new violations.
- [x] 9.2 `npm run typecheck` — no errors.
- [x] 9.3 `npm run build` — clean.
- [x] 9.4 `npm test && npm run test:e2e` — full suite green.
