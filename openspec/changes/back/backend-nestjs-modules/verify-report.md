# Verify Report: Backend NestJS Modules — Phase 1 (T1.1-T1.5) + Phase 2 (T2.0-T2.5)

**Date**: 2026-08-15
**Mode**: Standard (no strict-tdd testing-capabilities record found in Engram for this project; tasks.md states "Strict TDD active" but no cached capability doc was found — proceeded with real-execution verification per sdd-verify skill regardless)
**Verifier**: sdd-verify, live-environment mode (Postgres `tase-postgres`, Redis `tase-redis`, API on :3001)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total (Phase 1+2) | 11 (T1.1-T1.5, T2.0-T2.5) |
| Tasks complete (per tasks.md) | 11/11 |
| Tasks incomplete | 0 |

Phase 3 (T3.1-T3.10) and Phase 4 (T4.1-T4.4) not started — out of scope for this verify pass, consistent with tasks.md.

---

## Build & Tests Execution

**Build**: PASSED — `pnpm run build` (nest build), clean, no errors.

**Tests**: PASSED — `pnpm test`: **27 suites / 183 tests, all green**. Exit code 0.

**Coverage**: Not run (no coverage threshold configured; not requested).

These numbers exceed apply-progress's recorded "23 suites / 144 tests" — additional tests were added after the recorded apply-progress snapshot (migration 0008 / CC2 comments-read work, per git log `ea81b98 feat(auth): add READ comments to the anonymous ceiling`, `985162b feat(api): normalise every response to snake_case keys`). **These two commits are NOT reflected in apply-progress or tasks.md** — see Issues below.

**A fully green suite did not catch the CRITICAL defect below** — same failure class the task brief warned about (unit test mocks the exact boundary where the defect lives). See CRITICAL-1.

---

## CRITICAL Issues

### CRITICAL-1 — `PATCH /incidents/:id/status` returns an array-wrapped body; corrupts cache purge AND the realtime event payload

**File**: `backend/src/modules/incidents/incidents.repository.ts:100-108` (`IncidentsRepository.updateStatus`)
**Violates**: R2 (incident lifecycle), CC5 (geofencing cache invalidation on status change), CC4 (realtime event delivery)

**Evidence** (live, reproduced 3x independently, including after a full clean `pnpm run build` + fresh process restart to rule out stale-process/instrumentation artifacts):

```
$ curl -s -X PATCH localhost:3001/api/incidents/<id>/status \
    -H "Authorization: Bearer <operator-token>" -d '{"status":"in_progress"}'
[{"id":"87700a41-...","title":"clean-rebuild-check", ..., "status":"in_progress", ...}]
```
Note the leading `[` / trailing `]` — the entire incident object is wrapped in a 1-element array. `POST /incidents` (create, also `RETURNING`) and `GET /incidents/:id` on the same row both correctly return a bare object — only the `PATCH .../status` path is affected.

**Root cause** (confirmed via temporary instrumentation of the gitignored `dist/` build, reverted afterward with a clean `pnpm run build` — not present in committed source):
`IncidentsRepository.updateStatus()` runs `UPDATE incidents SET status=$2, updated_at=now() WHERE id=$1 RETURNING ...` through `this.dataSource.query(sql, params)`. For this specific `UPDATE ... RETURNING` call, the driver/TypeORM combination returns a **2-element tuple** `[actualRows, affectedRowCount]` instead of the plain rows array `create()`'s `INSERT ... RETURNING` gets:
```
DEBUG_REPO_ROWS true 2 1 [[{"id":"...","status":"in_progress",...}],1]
```
So `rows[0]` (line 107) evaluates to `[row]` — an array, not the row — and that array is what the controller returns and the `SnakeCaseResponseInterceptor` (correctly) passes through unmodified.

**Blast radius beyond the HTTP response**:
- `IncidentsService.updateStatus()` (`incidents.service.ts:95-110`) does `await this.geofencingService.purgeZoneCache(updated.zone_id)` — since `updated` is actually an array, `updated.zone_id` is `undefined`. `purgeZoneCache(undefined)` no-ops (`if (!zoneId) return;`), so **the geofencing cache is never invalidated on a status change**, directly violating CC5's "GIVEN the underlying Location boundary is updated... THEN the next lookup MUST bypass stale cache" (status-change path specifically, not create-path).
- `await this.publish('incident.status_changed', { ...updated, actor_id: actorId })` spreads an array, producing `{'0': {...row}, actor_id}` — no `zone_id`, `id`, or any real incident field at the top level. `resolveRoomsForEvent()` (`realtime/room.util.ts:31-36`) reads `payload.zone_id ?? payload.zoneId` to route the event to `geo:{zone_id}` — with this payload shape it finds neither, so **`incident.status_changed` events never reach the correct geo-scoped WebSocket room**, violating CC4 ("operator MUST receive `incident:assigned`/status events within 2s").

**Why the green suite missed it** — this is the exact failure mode flagged in the verify brief: `incidents.repository.spec.ts:98` mocks `dataSource.query.mockResolvedValue([{ id: 'inc-1', status: 'in_progress' }])` — i.e., the test hard-codes the assumption that `query()` returns a flat rows array, which is true for `SELECT`/`INSERT...RETURNING` in this codebase but empirically false for this `UPDATE...RETURNING` call. `incidents.service.spec.ts` mocks `incidentsRepository.updateStatus` directly, so it never touches the real `dataSource.query` boundary either. No test exercises the actual HTTP response shape (no Supertest/e2e test hits `PATCH /incidents/:id/status` against a real Postgres instance).

**Recommendation** (not applied — report only): explicitly request `useStructuredResult` off / index the actual rows array (e.g. destructure with `const [rows] = ...` if the tuple shape is confirmed intentional for this TypeORM/pg driver version, or, simpler, avoid raw `dataSource.query` for this single-row UPDATE and use `queryRunner.query(..., undefined, false)` or the QueryBuilder). Add a Supertest test that hits the real `PATCH .../status` route end-to-end.

---

### CRITICAL-2 — Rate limiting (CC1) is not keyed by device_uuid in practice — it is effectively global

**File**: `backend/src/common/guards/rate-limiter.guard.ts:40-46`
**Violates**: CC1 (spec doesn't state this explicitly but design "Scale Patterns" table: `rate:{device_uuid}:{window}` — task brief also explicitly calls this out: "keyed per device_uuid, not global")

**Evidence** (live):
```
$ docker exec tase-redis redis-cli -n 1 keys "rate-limit:*"
rate-limit:anonymous:/api/incidents/9bbcbd09-b92f-4b2c-8c5d-31dc6865772e:29780266
rate-limit:anonymous:/api/auth/login:29780266
```
Every single key across the entire session — anonymous device traffic AND a manually-provisioned authenticated `operator-test-1` device — bucketed under the **literal string `"anonymous"`**, never anything device-specific, despite two distinct JWTs (different `sub`/user IDs) being used throughout testing.

**Root cause**: `RateLimiterGuard.canActivate()` reads `request.headers?.['x-device-uuid'] ?? 'anonymous'` (line 42). But **no code path in this codebase ever sends or requires an `X-Device-Uuid` header** — the actual identity mechanism is the JWT (`Authorization: Bearer`), resolved via `JwtStrategy`/`request.user.userId`. Since the header is never populated by any real client, every request from every device/user falls through to the hard-coded default `'anonymous'`, meaning:
1. All authenticated operators share one global rate-limit bucket with all anonymous devices, per route.
2. A malicious/heavy device can exhaust the shared budget and 429-lock out every other user (including operators) on that route.

**Confirmed it does trigger** (functioning, just wrongly scoped):
```
$ for i in $(seq 1 105); do curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/incidents -H "Authorization: Bearer <invalid>"; done | sort | uniq -c
    100 401
      5 429
```
429s begin exactly after ~100 requests (default `RATE_LIMIT_MAX_REQUESTS=100`) to the SAME shared `anonymous` bucket, regardless of caller.

**Why the green suite missed it**: `rate-limiter.guard.spec.ts:5-8` constructs the mock `ExecutionContext` with `headers: { 'x-device-uuid': deviceUuid }` set directly by the test — again, the test mocks exactly the boundary (header presence) that never happens in the real request pipeline. The two "different key for different device" tests pass because the test supplies the header the real HTTP layer never does.

**Recommendation**: derive the rate-limit key from `request.user?.userId` (post-`JwtAuthGuard`) or from the device_uuid resolved during auth, not from an unused custom header. Note ordering: `RateLimiterGuard` is `APP_GUARD` and therefore runs *before* `JwtAuthGuard`/`PermissionGuard` (which are route-level `@UseGuards`), so `request.user` is not yet populated at the point this guard runs today — this is an architecture question for whoever fixes it (may need re-ordering or a lightweight pre-parse of the JWT `sub` inside the rate limiter itself).

---

### CRITICAL-3 — CC5 geofencing cache is unwired dead code; zone lookups are never cached

**File**: `backend/src/modules/geofencing/geofencing.service.ts` (`buildZoneCacheKey`, `tagCacheKey`, `getCachedZoneByPoint`); `backend/src/modules/incidents/incidents.service.ts:44-70` (`create`)
**Violates**: CC5 ("The system MUST cache PostGIS containment lookups for 60s") and design D4 (cache key `geo:{zone_id}:{lat3}:{lng3}:{radius}:{status}`, 60s TTL, tag-set purge)

**Evidence** (live): after 15+ incident creates and several status updates spanning both zone-matched and out-of-zone coordinates during this session, Redis DB 1 contains **zero** `geo:*` keys of any shape:
```
$ docker exec tase-redis redis-cli -n 1 keys "*"
perm:operator-test-1
perm:uid:...
rate-limit:anonymous:...
```
(no `geo:point:*`, `geo:{zone_id}:*`, or `geo:tags:*` keys at any point).

**Root cause**: `buildZoneCacheKey()`, `tagCacheKey()`, and `getCachedZoneByPoint()` exist and are unit-tested (`geofencing.service.spec.ts`), but grep confirms **none of the three is ever called from application code** — only from their own spec file. `IncidentsService.create()` calls `this.geofencingService.resolveZone(...)`, which calls `validateIncidentInZone()`, which calls `this.geofencingRepository.findZoneByPoint(...)` directly — a **fresh, uncached** `ST_Contains` query on every single incident create. `purgeZoneCache(zoneId)` IS called (on create and on status-update, modulo CRITICAL-1's `undefined` bug on the latter), but it purges `geo:tags:{zoneId}`, a set that is never populated (`tagCacheKey` is dead code) — so `purgeZoneCache` is a guaranteed no-op (`SMEMBERS` always returns `[]`).

Net effect: the entire CC5 caching pillar — one of the four cross-cutting requirements the design doc calls out as a "key payoff" (D4: "cache invalidation... Because every incident carries `zone_id`, the read cache is tagged by zone and purged precisely") — is present as scaffolding/unit-tested helper functions but **never exercised by a real request**. apply-progress's claim "T2.0 Geofencing reconciliation: added `resolveZone()`... `buildZoneCacheKey()`... `tagCacheKey()`/`purgeZoneCache()`" is accurate about what was *built*, but is presented as if the caching pillar is functional end-to-end; it is not wired into the write or read path.

**Recommendation**: wire `create()` (and any future zone-lookup read path, e.g. `findAll`/near-me) through `getCachedZoneByPoint` (or a zone-scoped equivalent using `buildZoneCacheKey`+`tagCacheKey`), so `purgeZoneCache` actually has something tagged to purge.

---

## WARNING Issues

### WARNING-1 — apply-progress/tasks.md drifted from the actual git history

Two commits exist on the branch (`985162b feat(api): normalise every response to snake_case keys`, `ea81b98 feat(auth): add READ comments to the anonymous ceiling`, plus `bbfafa5 docs(db): record migrations 0001-0008 as applied to supabase`) that are **not** reflected in the tasks.md "Phase 2 (T2.0-T2.5): 6/6 DONE" summary or in the apply-progress artifact read for this verify pass (which cites 23 suites/144 tests and commits ending at `4dbbae4`/`7118004`). These commits fixed exactly the two known production defects described in the verify brief (JwtStrategy `sub`/`device_uuid` mismatch, `SnakeCaseResponseInterceptor` not traversing entity instances) plus added migration 0008 (anonymous READ comments). **The fixes are real and CONFIRMED live** (see Confirmed list below) — this is a documentation/traceability gap, not a functional regression, but it means the artifact store (Engram `apply-progress`) is stale relative to the actual code and should be refreshed before Phase 3 work builds on it.

### WARNING-2 — Permission cache key scheme deviates from design D2 without being flagged as a deviation

**File**: `backend/src/modules/auth/auth.service.ts:106-108, 148-150`
Design D2 specifies `perm:{user_id}`. The actual implementation uses two different key shapes: `perm:{deviceUuid}` (`getPermissions`, used by `login()`) and `perm:uid:{userId}` (`getPermissionsByUserId`, used by `JwtStrategy`) — functionally correct (each guard path is internally consistent and confirmed working live) but not documented as a deviation in apply-progress, and doubles the cache footprint per identity (one entry per device_uuid, one per user id, for the same permission set). Not CRITICAL since it works correctly in every scenario tested, but should be reconciled or explicitly logged as a deviation.

### WARNING-3 — `AssignmentsService`/`IncidentsController` have no DELETE route for incidents, undocumented in spec

Not a defect (spec never requires incident deletion), but `DELETE /api/incidents/:id` returns a generic 404 rather than a documented "not supported" response — low-severity API ergonomics note, not scored against R2.

---

## SUGGESTION Issues

### SUGGESTION-1 — `pnpm run lint` still fails (no ESLint config)
Confirmed still true (flagged in apply-progress since Phase 1, unresolved through Phase 2). Non-blocking but growing technical debt as more modules land in Phase 3.

### SUGGESTION-2 — `AvatarStorageService` (T2.3) has no real S3 SDK wired
Confirmed accurately flagged already in apply-progress as a known stub — mockable seam only, `upload()`/`getSignedUrl()` side-effect-free. No live avatar upload path exists to test against real storage. This is disclosed, not mis-presented as complete — no new finding, just confirming the existing disclosure is accurate.

### SUGGESTION-3 — Streams retention/MAXLEN uncapped
Confirmed still true, already flagged in tasks.md as a pre-load-testing follow-up (T4.2). Not re-verified live (would require sustained load); no new evidence gathered either way.

---

## Spec Compliance Matrix (Phase 1 + Phase 2 scope)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| CC1 (permission RBAC) | 403 without permission | Live: anon UPDATE/ASSIGN → 403 with correct "Missing permission" message | ✅ COMPLIANT |
| CC1 (rate limit keyed by device) | Keyed per device_uuid | Live: Redis shows single shared `anonymous` bucket across all identities | ❌ **CRITICAL-2** |
| CC2 (anonymous read/create incidents+comments) | Anon CREATE/READ incidents, CREATE/READ comments | Live: 201 create incident, 200 read comments (post-0008) | ✅ COMPLIANT |
| CC2 (anonymous ceiling: no UPDATE/DELETE/ASSIGN) | 403 on mutating actions | Live: PATCH status → 403, DELETE comment → 403, POST assignments → 403 | ✅ COMPLIANT |
| CC3 (manual migrations, synchronize:false) | No auto-sync, paired down migrations | `synchronize:false`/`migrationsRun:false` confirmed in source; 8/8 migrations have matching `.DOWN.sql`; MIGRATION_LOG.md accurate (0001-0008 all "✅ Applied") | ✅ COMPLIANT |
| CC4 (realtime event delivery via Streams+adapter) | Both XADD/consumer-group AND socket.io-redis-adapter wired | Static: both present in `streams.consumer.ts`/`redis-io.adapter.ts`, wired in `main.ts`. NOT live-verified end-to-end via a connected socket in this pass. `incident.status_changed` payload is corrupted by CRITICAL-1 (spread of an array) | ⚠️ **PARTIAL** (wiring present, status_changed payload broken) |
| CC5 (60s geofencing cache + invalidation) | Cache populated + purged on boundary change | Live: zero `geo:*` keys ever created despite 15+ writes; cache-populate functions (`buildZoneCacheKey`/`tagCacheKey`) never called from app code | ❌ **CRITICAL-3** |
| R1 (dual JWT, device-UUID anon session) | Anon login issues scoped token, not full operator JWT | Live: `/api/auth/login` with `device_uuid:"anonymous"` issues access+refresh JWT scoped to `['READ incidents','CREATE incidents','READ comments','CREATE comments']` | ✅ COMPLIANT |
| R2 (incident lifecycle, geofenced create) | Inside zone → zone_id+geofence_matched=true; outside → still 201, zone_id=null | Live: inside Santa Elena → `zone_id` set, `geofence_matched:true`; outside (Quito coords) → 201, `zone_id:null`, `geofence_matched:false` | ✅ COMPLIANT |
| R2 (forward-only status transitions) | pending→in_progress→resolved; backward/illegal rejected | Live: in_progress→pending → 400 "Illegal status transition"; pending→in_progress → 200 (but response malformed, CRITICAL-1) | ⚠️ PARTIAL (transition logic correct; response/side-effects broken) |
| R3 (comment sanitization) | `<script>` stripped before persist | Live DB row: `<script>alert(1)</script>hello <b>world</b>` persisted as `hello &lt;b&gt;world&lt;/b&gt;` (script fully stripped, remaining markup HTML-escaped) | ✅ COMPLIANT |
| R4 (device tracking history) | New device login recorded | Not independently re-verified this pass (unit-tested via EventEmitter2 `auth.login`/`UsersService.handleAuthLogin` per apply-progress); `/api/users/me` confirms entity shape correct | ➖ Not re-verified live (out of critical path this pass) |
| R5 (assignment claim conflict) | Second claim on assigned incident → conflict | Live: 1st claim → 201, 2nd claim same incident → 409 "already assigned" | ✅ COMPLIANT |
| Security (parameterized PostGIS SQL) | No string interpolation in spatial queries | `IncidentsRepository`/`GeofencingRepository` source inspected directly: all queries use `$1,$2,...` placeholders, zero template-literal interpolation of user input | ✅ COMPLIANT |
| Security (ST_Point argument order) | ST_Point(lng, lat) | Live: incident at `lat:-2.2166,lng:-80.8583` (Santa Elena) correctly resolved to the Santa Elena zone; a Quito-coordinate incident correctly resolved to no zone. Source comment + regression test both explicit about (lng,lat) order | ✅ COMPLIANT |

**Compliance summary**: 9/13 fully compliant, 2 partial (blast radius of CRITICAL-1), 2 failing (CRITICAL-2, CRITICAL-3).

---

## Confirmed Fixed (previously-known defects from prior sessions — re-verified live, not re-flagged)

- **JwtStrategy `sub`/`device_uuid` mismatch**: FIXED. `jwt.strategy.ts:33` now calls `authService.getPermissionsByUserId(payload.sub)` (resolves by user id, not device_uuid). Live: every permission-gated endpoint correctly authorizes/denies (403 works, 200 works) for both anonymous and a manually-provisioned operator identity.
- **`SnakeCaseResponseInterceptor` skipping entity instances**: FIXED. `snake-case.ts` `toSnakeCaseKeys()` explicitly traverses "arrays, object literals AND class instances," with an explicit `isValueObject()` guard for `Date`/`RegExp`/`Map`/`Set`/`Buffer` so timestamps survive. Live: `/api/users/me` (a real TypeORM entity) returns correctly snake_cased keys with intact ISO-string `created_at`/`updated_at`.

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 (identity spectrum, one users row) | ✅ Yes | Confirmed: `users` table has both anon and operator rows, same schema, `role` column drives permission set for non-anon |
| D2 (permissions in Redis, not JWT) | ⚠️ Deviated (cosmetic) | Two key shapes instead of one (WARNING-2); functionally correct |
| D3 (permission strings from route metadata) | ✅ Yes | `@RequirePermission('UPDATE')` + `inferResourceFromPath` confirmed live (403 messages show correctly inferred resource names) |
| D4 (materialized zones + cached containment) | ❌ Half-followed | Containment logic (ST_Contains, zone_id persistence) correct; the caching half is entirely unwired (CRITICAL-3) |
| D5 (Streams + socket.io-redis-adapter, both required) | ✅ Yes (static) | Both present and wired in `main.ts`/`streams.consumer.ts`; not live-socket-tested this pass |
| D6 (permission-gated, non-role-based rooms) | ✅ Yes (static) | `room.util.ts`/`events.gateway.ts` confirm `geo:`/`org:`/`incident:`/`user:` rooms, no role-based room found in source |
| D7 (passive listeners via EventEmitter2) | ✅ Yes | `AuthService` emits `auth.login`, `UsersService.handleAuthLogin` listens; no direct AuthModule→UsersModule import (checked `auth.module.ts`) |

---

## Verdict

**FAIL** — 3 CRITICAL issues block Phase 3. Do not archive Phase 1+2 as-is; recommend routing back to `sdd-apply` to fix CRITICAL-1/2/3 before ten more modules are stacked on the incidents/realtime/geofencing/rate-limiting foundations they touch.

One-line summary: **183/183 unit tests green, but three boundary-level defects (UPDATE...RETURNING tuple unwrap, rate-limit key never populated, geofencing cache never wired) are invisible to the current test suite and independently break CC1, CC4, and CC5 in the live system.**
