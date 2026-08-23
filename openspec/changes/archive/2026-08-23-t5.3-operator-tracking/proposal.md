# Proposal: T5.3 Operator Tracking — GPS Location + Operator Dashboard

Port reference:
- `GeoReporta/backend/app/Domains/Users/Http/OperatorLocationController.php`
- `GeoReporta/backend/app/Domains/Users/Http/OperatorDashboardController.php`

No new DB migrations needed (operator locations live in Redis).

## Intent

Operators in GeoReporta broadcast their GPS position at intervals and the map shows their live
positions. The NestJS backend has no equivalent: no `POST /operator/location` endpoint, no Redis
key for operator positions, and no operator-specific dashboard view. T5.3 adds this as a new
`operators` module.

## Scope

### In Scope

- `OperatorLocationService` — `record(userId, organizationId, lat, lng)`: writes to Redis with
  TTL (e.g., 5 min inactivity = position expires). `activeFor(organizationId, isSystemAdmin)`:
  returns all active operator positions scoped to org (or all for system admin).
- `OperatorDashboardService` — `forOperator(userId, filters)`: returns operator's assigned/claimed
  incidents with stats (total assigned, in_progress count, resolved_today, plus paginated incident
  list). Date/location/pagination filters supported.
- `OperatorsController`:
  - `POST /api/operator/location` — JWT + role guard (operator roles only)
  - `GET /api/operator/locations` — JWT + role guard (operators + org admins + system admin)
  - `GET /api/operator/dashboard` — JWT + `@RequirePermissions('READ dashboard')` + operator role
- New `OperatorsModule` with Redis integration via `@nestjs/bull` / `ioredis` (use existing Redis
  connection, not a new `CacheModule` instance).
- DTOs: `UpdateLocationDto` (`lat`, `lng`), `OperatorLocationResponseDto`, `DashboardQueryDto`.
- Unit tests per service (location TTL expiry, org scoping, dashboard aggregation).
- E2e tests: location write + read round-trip, non-operator rejection, dashboard filters.

### Out of Scope

- WebSocket real-time location streaming (existing `realtime` module covers that separately).
- Historical location trail / GPS track storage in Postgres.
- Location-based push notifications.

## Capabilities

### New Capabilities
- `operator-tracking`: GPS ping, active-locations map query, operator dashboard view.

## Approach

Operator locations are ephemeral — Redis `HSET operators:locations:{orgId} {userId} {json}` with
`EXPIRE` reset on each ping (5-minute TTL). `GET /api/operator/locations` does `HGETALL` on the
org key (system admins call each org key or a global set). This mirrors GeoReporta's
`OperatorLocationService::record()` / `::activeFor()`.

Dashboard aggregation runs two queries against `incidents`: count by status for this operator
(as claimer / assignee) plus a paginated list with category and location joins.

Role check: the controller performs an explicit role guard (not just a permission) because the
endpoint is role-semantically meaningful — a non-operator shouldn't be able to ping a location
even with the right permission bit. This mirrors GeoReporta's `PING_ROLES`/`QUERY_ROLES` constants.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/operators/` | New | Module, controller, 2 services, DTOs |
| `backend/src/modules/operators/operator-location.service.ts` | New | Redis ping + query |
| `backend/src/modules/operators/operator-dashboard.service.ts` | New | Dashboard aggregation |
| `backend/src/modules/operators/operators.controller.ts` | New | 3 HTTP endpoints |
| `backend/src/app.module.ts` | Modified | Import `OperatorsModule` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Redis key design collides with existing keys | Low | Use `operators:loc:{orgId}:{userId}` namespace — check existing key patterns first |
| Stale positions after TTL not shown on map | Low (by design) | 5-min TTL is correct; document the expiry contract in the spec |
| Operator role check logic differs from permission guard | Med | Document as design decision; explicit role name check is correct here (behavior-coupled, not permission-coupled) |

## Rollback Plan

1. Remove `OperatorsModule` — no DB changes, no migrations.
2. Redis keys expire naturally; can also `DEL operators:loc:*` to flush immediately.

## Dependencies

- T2.1 Incidents module (operator dashboard reads incident data).
- T3.1 Roles (role name constants for guard logic).
- T3.2 Organizations (org-scoped location queries).
- Redis connection (already wired via `CacheModule` / `ioredis`).
- T5.1 Incident workflow (dashboard shows claimed incidents — depends on `claimed_by` column).

## Success Criteria

- [ ] `POST /api/operator/location` with valid `{lat, lng}` returns `{status: "ok"}` and sets Redis key.
- [ ] Position expires from Redis after TTL elapses (tested with short TTL in e2e).
- [ ] Non-operator caller gets 403.
- [ ] `GET /api/operator/locations` returns active positions scoped to caller's org.
- [ ] System admin caller sees positions from all orgs.
- [ ] `GET /api/operator/dashboard` returns `stats` + paginated `incidents` for the calling operator.
- [ ] Date filter on dashboard narrows incident list correctly.
- [ ] `npm test && npm run test:e2e` green.
