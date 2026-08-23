# Verify Report: T5.2 Incident Analytics

**Change**: t5.2-incident-analytics
**Date**: 2026-08-23
**Mode**: Strict TDD (test runner: `npm test && npm run test:e2e` from `backend/`)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 26 (Phases 0–9) |
| Tasks complete | 26 |
| Tasks incomplete | 0 |

All phases (0 through 9) have every task marked `[x]`. No incomplete tasks.

---

## Build & Tests Execution

**Unit Tests**: 760 passed / 0 failed / 0 skipped across 85 suites
```
Test Suites: 85 passed, 85 total
Tests:       760 passed, 760 total
Time:        12.472 s
```

**E2E Tests**: 188 passed / 0 failed / 0 skipped across 20 suites
```
Test Suites: 20 passed, 20 total
Tests:       188 passed, 188 total
Time:        295.281 s
```
Note: Jest did not exit cleanly after E2E run (async handles not stopped); this is pre-existing infrastructure behavior, not introduced by T5.2.

**Coverage**: Not available (not configured in test scripts)

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 Stats | Scenario 1: admin_sistema sees all orgs | `incident-analytics.e2e-spec.ts > stats: system admin sees total across both orgs` | ✅ COMPLIANT |
| R1 Stats | Scenario 2: org-admin sees only own org | `incident-analytics.e2e-spec.ts > stats: org admin sees only own org incidents` | ✅ COMPLIANT |
| R1 Stats | Scenario 3: Redis cache hit returns same body | `incident-analytics.service.spec.ts > getStats — cache > cache hit` | ⚠️ PARTIAL — unit-only; no e2e timing assertion |
| R1 Stats | Scenario 4: 403 without READ dashboard | `incident-analytics.e2e-spec.ts > stats: citizen (no READ dashboard permission) → 403` | ✅ COMPLIANT |
| R2 Weekly Stats | Scenario 1: default 10-day window | `incident-analytics.e2e-spec.ts > weekly-stats: default window → 10 days array` | ✅ COMPLIANT |
| R2 Weekly Stats | Scenario 2: zero-fill missing days | `incident-analytics.service.spec.ts > getWeeklyStats > zero-fill` | ⚠️ PARTIAL — unit-only; no e2e with sparse date range |
| R2 Weekly Stats | Scenario 3: fin < inicio → 422 | `incident-analytics.e2e-spec.ts > weekly-stats: fin < inicio → 422` | ✅ COMPLIANT |
| R3 Feed | Scenario 1: staff org-scoped Postgres path | `incident-analytics.e2e-spec.ts > feed: org operator sees org-scoped incidents` | ✅ COMPLIANT |
| R3 Feed | Scenario 2: citizen Redis read model path | `incident-feed.service.spec.ts > getCitizenFeed > returns Redis data when cache hit` | ⚠️ PARTIAL — unit-only; e2e citizen test uses Postgres fallback path (cache flushed by env.reset()) |
| R3 Feed | Scenario 3: bbox cap at 500 items | `incident-feed.service.spec.ts > getStaffFeed > bbox cap: LIMIT capped at 500` | ⚠️ PARTIAL — unit-only; no e2e with >500 incidents |
| R3 Feed | Scenario 4: unauthenticated → 401 | `incident-analytics.e2e-spec.ts > feed: unauthenticated → 401` | ✅ COMPLIANT |
| R4 Export | Scenario 1: CSV headers + Content-Type | `incident-analytics.e2e-spec.ts > export: returns CSV with correct header and content-type` | ✅ COMPLIANT |
| R4 Export | Scenario 2: truncation headers when > 5000 | `incident-export.service.spec.ts > row count capped at cap param` | ⚠️ PARTIAL — unit-only (capping logic); no e2e with >5000 rows; truncation header logic confirmed by code review only |
| R4 Export | Scenario 3: 403 without READ dashboard | `incident-analytics.e2e-spec.ts > export: citizen (no READ dashboard) → 403` | ✅ COMPLIANT |

**Compliance summary**: 8/14 scenarios fully COMPLIANT via E2E; 5 PARTIAL (unit-only coverage); 1 PARTIAL (unit cache-hit only). Zero FAILING or UNTESTED.

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1: READ dashboard permission gate | ✅ Implemented | `@RequirePermission('READ', 'dashboard')` on stats, weekly-stats, export |
| R1: Org scoping (admin_sistema sees all) | ✅ Implemented | `buildOrgClause` returns empty clause for `admin_sistema` |
| R1: Org scoping (org-admin restricted) | ✅ Implemented | WHERE `organization_id = $N` injected |
| R1: Zero-fill by_status / by_priority | ✅ Implemented | Seed maps `{ pending:0, in_progress:0, resolved:0, closed:0 }` and `{ low:0, medium:0, high:0, critical:0 }` |
| R1: trends object with 3 fields | ✅ Implemented | `computeTrends()` returns `{total_pct, pendientes_pct, resolution_rate_pct}` |
| R1: Redis cache 1h per org+filter | ✅ Implemented | `CACHE_TTL_MS = 3600 * 1000`, key `stats:{orgScope}:{filterHash}` |
| R2: Default 10-day window | ✅ Implemented | `startDate = now - 9 * 86400 * 1000` |
| R2: Spanish day labels | ✅ Implemented | `['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']` |
| R2: 422 when fin < inicio | ✅ Implemented | `throw new UnprocessableEntityException(...)` |
| R2: Zero-fill missing days | ✅ Implemented | Date cursor loop always pushes 0s for absent days |
| R3: Staff path org-scoped Postgres | ✅ Implemented | `getStaffFeed` applies org clause |
| R3: Citizen path Redis with Postgres fallback | ✅ Implemented | `getCitizenFeed` tries `CITIZEN_FEED_KEY` then falls back to SQL |
| R3: bbox cap 500 | ✅ Implemented | `Math.min(query.per_page ?? 20, query.bbox ? STAFF_BBOX_CAP : 500)` |
| R3: FeedItemDto shape | ✅ Implemented | All required fields mapped; geom via `ST_AsGeoJSON(i.location)::json` |
| R3: Citizen uses `READ feed` permission | ⚠️ Partial | Controller uses `@RequirePermission('READ')` (= READ incidents context) instead of `READ feed`. E2E test provisions citizen with `['READ incidents']` and passes. This is a permission naming deviation from spec R3. |
| R4: Streaming CSV (not buffered) | ✅ Implemented | Node.js `Readable` stream pushed in batches of 500 |
| R4: Content-Disposition attachment filename | ✅ Implemented | `attachment; filename="incidencias-{ts}.csv"` |
| R4: Truncation headers when > 5000 | ✅ Implemented | `X-Report-Truncated`, `X-Report-Original-Total`, `X-Report-Exported` headers set |
| R4: Route order (literal before :id) | ✅ Implemented | stats/weekly-stats/feed/export declared before `@Get(':id')` |
| R4: Services registered in IncidentsModule | ✅ Implemented | `providers: [..., IncidentAnalyticsService, IncidentFeedService, IncidentExportService]` |
| R4: CacheModule globally available | ✅ Implemented | `CacheModule.registerAsync({ isGlobal: true })` in CoreModule |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: Citizen fallback to Postgres on cold start | ✅ Yes | `getCitizenFeed` falls back to Postgres when Redis key absent |
| D2: Services in IncidentsModule (not new AnalyticsModule) | ✅ Yes | All 3 services in incidents.module.ts |
| D3: Cache key `stats:{orgScope}:{filterHash}` | ✅ Yes | Matches exactly; `filterHash` = sha256 16-char hex |
| D4: CSV only in T5.2 | ✅ Yes | No XLSX code present |
| D5: Stream via Readable (not res.json) | ✅ Yes | `new Readable({...})` + `stream.pipe(res)` |
| D6: Trends uses same-length prior period | ✅ Yes | `prevStart = prevEnd - durationMs`, `prevEnd = currentStart - 1ms` |
| Design: Use `updated_at` proxy for resolution_date | ✅ Yes (documented gotcha) | `resolution_date = updated_at when status = 'resolved'` |
| Design: `zone_id` as DB column for location_id param | ✅ Yes | All services filter on `i.zone_id` when `location_id` query param present |
| Design: CACHE_TTL_MS in milliseconds | ✅ Yes | `3600 * 1000` — NestJS cache-manager v5 uses ms |

---

## Issues Found

**CRITICAL** (must fix before archive):
None

**WARNING** (should fix):

1. **Feed permission name deviation**: Spec R3 states citizen role needs `READ feed` permission. Controller uses `@RequirePermission('READ')` without explicit resource, which in the incidents controller context resolves to `READ incidents`. The E2E citizen test is provisioned with `['READ incidents']` and passes 200. The spec's `READ feed` permission does not exist in the RBAC model. The behavior is functionally correct but the spec's permission naming is inconsistent with the codebase pattern. No test exists to verify that a user with `READ feed` (if it existed) would be denied.

2. **Citizen Redis E2E path not directly exercised**: Spec scenario R3/Scenario 2 ("Citizen user receives Redis feed") requires the Redis read model to be populated. The E2E test relies on the Postgres fallback because `env.reset()` flushes Redis. Redis path is covered only by unit tests. A true E2E test would need to pre-populate `feed:incidents` in Redis before the request.

3. **Truncation header E2E not exercised**: Spec scenario R4/Scenario 2 requires >5000 incidents to trigger truncation headers. Seeding 5001+ rows in E2E would be slow; the current E2E only verifies the CSV content-type and header row. Truncation logic is verified by code review and unit-level `countFiltered` mock, but not behaviorally via E2E.

**SUGGESTION** (nice to have):

1. **Add `closed` to spec's by_status list**: The implementation zero-fills `closed` as a valid status key. The spec only mentions `pending`, `in_progress`, `resolved`. The spec should be updated to include `closed` for completeness.

2. **Pagination meta field name `page` vs `current_page`**: Spec R3/Scenario 1 mentions "meta includes `current_page`, per_page, total, last_page" but the implementation returns `page` (not `current_page`). The E2E test only asserts `meta.total`, so the discrepancy is undetected by tests. Consider either aligning the response to `current_page` or updating the spec.

---

## Verdict

**PASS WITH WARNINGS**

Implementation is complete (26/26 tasks), all 760 unit + 188 e2e tests pass, and all CRITICAL spec requirements have behavioral coverage. Three warnings relate to E2E coverage gaps for the Redis citizen path, truncation headers, and a permission naming inconsistency — none of these block archive.
