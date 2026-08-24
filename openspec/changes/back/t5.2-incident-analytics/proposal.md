# Proposal: T5.2 Incident Analytics — Stats, Weekly-Stats, Feed, Export CSV

Port reference:
- `GeoReporta/backend/app/Domains/Incidents/Http/IncidentStatsController.php`
- `GeoReporta/backend/app/Domains/Incidents/Http/IncidentWeeklyStatsController.php`
- `GeoReporta/backend/app/Domains/Incidents/Http/FeedController.php`
- `GeoReporta/backend/app/Domains/Incidents/Http/ExportIncidenciasController.php`

No new migrations needed.

## Intent

The NestJS backend can create and query incidents but has no analytics layer: no aggregate stats,
no time-series, no unified map/citizen feed, and no data export. These four read-side endpoints
are the backbone of the GeoReporta dashboard and citizen map. T5.2 ports them as NestJS services
within the existing `incidents` module.

## Scope

### In Scope

- `IncidentAnalyticsService` — `getStats(filters, user)`, `getWeeklyStats(filters, user)`.
  - Org-scoped via `SubjectScope` pattern (admin_sistema = all, others = own org).
  - Redis cache (`CACHE_MANAGER`) TTL 1h per cache key (org scope + filter hash).
  - Stats: total, by_status, by_priority, recent_count (last 7d), locations_count,
    average_resolution_time (days + hours + seconds), trends (vs previous period),
    top_categories (top 5 by count with resolved/pending split).
  - Weekly stats: daily series `{date, label, recibidas, resueltas}` for a configurable window
    (default last 10 days).
  - Filters: `inicio`, `fin` (Y-m-d), `tipo_id`, `ciudad_id`, `provincia_id`, `pais_id`.
  - Permission gate: `@RequirePermissions('READ dashboard')`.

- `IncidentFeedService` — `getStaffFeed(filters)`, `getFeedForCitizen(filters)`.
  - Staff path (admins / operators): live Postgres, org-scoped, same filters as incidents index
    plus optional `bbox` (minLng,minLat,maxLng,maxLat) and `zoom`. Returns slim item shape
    (no images, no full description). Hard cap 500 markers for bbox queries.
  - Citizen path: Redis-backed read model (lightweight; high-traffic insulation). Filters:
    `status`, `organization_id`, `location_id`, pagination (max 50).
  - Auth required (JWT). Permission gate:
    - Staff → `@RequirePermissions('READ incidents')`
    - Citizen → `@RequirePermissions('READ feed')` (separate permission row).

- `IncidentExportService` — `countFiltered(filters)`, `filteredIncidents(filters, cap)`,
  `exportCsv(rows)`.
  - Initially CSV only (XLSX deferred — no spreadsheet library in current stack).
  - `Content-Disposition: attachment; filename=incidencias-{date}.csv`.
  - Headers: `X-Report-Truncated`, `X-Report-Original-Total`, `X-Report-Exported` when capped.
  - Hard cap: 5000 rows (CSV). Permission gate: `@RequirePermissions('READ dashboard')`.

- Endpoint wiring:
  - `GET /api/incidents/stats`
  - `GET /api/incidents/weekly-stats`
  - `GET /api/incidents/feed`
  - `GET /api/incidents/export`

- DTO validation (class-validator): `StatsQueryDto`, `WeeklyStatsQueryDto`, `FeedQueryDto`,
  `ExportQueryDto`.
- Unit tests per service (stats computation, cache key generation, feed dispatch logic).
- E2e tests: stats org isolation, weekly series date fill-in, feed auth paths, export CSV download.

### Out of Scope

- XLSX / PDF export — library `exceljs` / `pdfkit` not currently in the stack; deferred.
- Real-time feed updates via WebSocket (T4.x realtime module).
- Public/anonymous feed access — auth is mandatory per GeoReporta's own decision.

## Capabilities

### New Capabilities
- `incident-analytics`: stats, weekly-stats, feed, CSV export within the incidents module.

### Modified Capabilities
- `incidents` module: gains analytics controller + three new services.

## Approach

All four endpoints live in `IncidentsModule` to avoid cross-module imports of the `IncidentEntity`.
Services are pure query-side (no writes). Cache is injected via `CacheModule` (already used in the
project for other Redis operations). Org scoping is done by service method parameter (`userId`,
`roleId`, `organizationId`) — same pattern as existing `IncidentsService`.

Feed dispatch is a role-type check in the controller: if `user.roleId` maps to a staff role →
staff path (Postgres); else → citizen path (Redis). This keeps the controller thin and both paths
testable in isolation.

Export streams a readable Node.js stream (no temp file) so memory is bounded by the `Transform`
stream buffer, not the full dataset.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/incidents/incident-analytics.service.ts` | New | stats + weekly-stats |
| `backend/src/modules/incidents/incident-feed.service.ts` | New | staff + citizen feed paths |
| `backend/src/modules/incidents/incident-export.service.ts` | New | CSV streaming export |
| `backend/src/modules/incidents/incidents.controller.ts` | Modified | 4 new route methods |
| `backend/src/modules/incidents/dto/` | New | `StatsQueryDto`, `WeeklyStatsQueryDto`, `FeedQueryDto`, `ExportQueryDto` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cache invalidation on incident write | Med | Cache keyed by org+filter hash; TTL 1h acceptable for dashboard (same as legacy) |
| Citizen Redis read model not seeded | Med | Fall back to Postgres query with a soft-deleted filter when Redis key absent; design decision D1 |
| CSV memory usage for large datasets | Low | Hard cap 5000 rows; streaming `Transform` pipeline |

## Rollback Plan

1. Remove analytics controller methods and three new services — zero DB changes.
2. No migration to revert.

## Dependencies

- T2.1 Incidents module + `IncidentEntity`.
- T3.2 Organizations (`organization_id` scoping on incidents).
- Redis `CacheModule` (already wired in app).
- T5.1 Incident workflow (parallel — no dependency, but `status` values must align).

## Success Criteria

- [ ] `GET /api/incidents/stats` returns `total`, `by_status`, `by_priority`, `recent_count`,
  `locations_count`, `average_resolution_time`, `trends`, `top_categories` for the caller's org scope.
- [ ] Response is cache-hit on second identical request (verifiable via Redis TTL key inspection).
- [ ] Admin_sistema caller sees all orgs; admin_organizacion caller sees only their org.
- [ ] `GET /api/incidents/weekly-stats` returns N days array with `date`, `label`, `recibidas`,
  `resueltas`; defaults to last 10 days when no filter provided.
- [ ] `GET /api/incidents/feed` returns slim item shape for staff; citizen path returns Redis read model.
- [ ] `GET /api/incidents/feed?bbox=lng1,lat1,lng2,lat2` caps at 500 markers.
- [ ] `GET /api/incidents/export` streams CSV with correct headers; `X-Report-Truncated` present when row count > 5000.
- [ ] Unauthenticated request to any endpoint returns 401.
- [ ] `npm test && npm run test:e2e` green.
