# Tasks: Backend NestJS Migration (16 Modules)

Source artifacts: `sdd/backend-nestjs-modules/spec` (requirements R1-R16, CC1-CC5), `sdd/backend-nestjs-modules/design` (D1-D7, build order, module DAG).

Execution model: batches, user can stop/continue between phases. Strict TDD active — every task's tests are written first, per project config (jest + supertest, ≥60% coverage per module). Blocker resolutions applied: PostGIS verified manually (T1.2), geo_zones seeded from `ecuador-locations-geom.json` (T1.5), Firebase dropped, anonymous permission ceiling = {READ incidents, CREATE incidents, CREATE comments}.

Legend: `Depends on` lists task IDs that must merge first. `[P]` = can run in parallel with sibling tasks in the same phase once its own deps are met.

---

## PHASE 1 — Infrastructure + Auth (Week 1)

**Status: T1.1-T1.5 ✅ COMPLETE** (backend build + `pnpm test` green — 9 suites / 49 tests).
See `sdd/backend-nestjs-modules/apply-progress` (engram) for the full
file-by-file breakdown, deviations, and TDD evidence. Deviations from the
literal task text below: auth routes are `/api/auth/login|refresh|me|logout`
(not `/auth/device`); `geo_zones.polygon` is `geometry(MultiPolygon,4326)`
(verified Ecuador admin boundaries are MultiPolygon, not Polygon); geofencing
repository/service (T1.5's spatial-query half) landed as its own module
(`backend/src/modules/geofencing/`) rather than inline SQL, matching design
D4's "Geofencing -> (none — owns geo_zones)" DAG entry.

### T1.1 — NestJS scaffold + config
- Requirement: CC3 groundwork (no ORM auto-sync), enables all modules
- Depends on: none
- **Status: ✅ Done**
- Duration: 2-3h | PR size: ~200 LOC | Tests: 3
- Files: `backend/src/main.ts`, `backend/src/app.module.ts`, `backend/src/core/core.module.ts`, `backend/.env.example`
- Work: Create NestJS app, load `.env` (database, JWT dual-secret, Redis, S3), global `ValidationPipe`, CORS restricted to frontend domain, API prefix `/api`, CoreModule (Config, TypeORM `synchronize:false`, EventEmitter2 stub).
- Acceptance criteria:
  - `GET /api/health` returns 200 with uptime payload
  - App boots with `synchronize:false` and `migrationsRun:false` explicitly set (CC3)
  - Invalid `.env` (missing DB URL) fails fast at bootstrap, not at first query
- Test scenarios: bootstrap succeeds; health check 200; missing required env var throws at startup.

### T1.2 — Database config + manual migrations + PostGIS verification [P]
- Requirement: CC3, blocker resolution #1 (verify PostGIS manually)
- Depends on: T1.1
- **Status: ✅ Done** (`database/migrations/0001_initial_schema.sql` + DOWN; PostGIS extension enabled in 0002 — see T1.5. PostGIS version confirmation is a manual step for the user to run in Supabase and log in MIGRATION_LOG.md; not verifiable from this sandbox.)
- Duration: 3-4h | PR size: ~250 LOC (mostly SQL) | Tests: 3
- Files: `database/migrations/0001_initial_schema.sql`, `database/migrations/0001_initial_schema_down.sql`, `database/MIGRATION_LOG.md`, `backend/src/core/typeorm.config.ts`
- Work: TypeORM config (`synchronize:false`, `migrationsRun:false`), manual migration runner script. First migration creates `users`, `organizations` base tables. Manually run `CREATE EXTENSION IF NOT EXISTS postgis;` against the Supabase instance and confirm via `SELECT postgis_version();` — record result in `MIGRATION_LOG.md`.
- Acceptance criteria:
  - Connection to Supabase succeeds from the app
  - `0001_initial_schema.sql` applies cleanly on empty DB; paired down-migration drops the same objects cleanly (CC3)
  - PostGIS extension confirmed present and version logged in `MIGRATION_LOG.md` — this UNBLOCKS D4/T2.1
- Test scenarios: connection health check; migration up+down round-trip on a throwaway schema; PostGIS extension query returns a version string.

### T1.3 — Redis cache + rate limiting setup [P]
- Requirement: scale pattern (rate limiting per device_uuid, not global), supports D2
- Depends on: T1.1
- **Status: ✅ Done** (`backend/src/common/guards/rate-limiter.guard.ts`, `cache.interceptor.ts` — landed in a prior batch, verified + fixed a CACHE_MANAGER import bug in this batch that was blocking the build)
- Duration: 2-3h | PR size: ~180 LOC | Tests: 4
- Files: `backend/src/core/redis.module.ts`, `backend/src/common/guards/rate-limit.guard.ts`
- Work: ioredis client (DB 0 = streams/sessions, DB 1 = cache, per design scale patterns), `@nestjs/cache-manager` wiring, sliding-window rate limiter guard keyed by `rate:{device_uuid}:{window}` (INCR + EXPIRE), configurable per-route limits.
- Acceptance criteria:
  - Cache set/get round-trips through `CacheManager`
  - Rate limiter rejects the Nth+1 request within a window with 429
  - Rate limiting is scoped per `device_uuid`, verified two different UUIDs are not cross-throttled
- Test scenarios: cache hit/miss; rate limit rejection at threshold; independent limits per device_uuid; DB0/DB1 separation.

### T1.4 — Auth module (device-UUID + JWT, D1/D2/D3)
- Requirement: R1 (Auth), CC1 (permission-based authz), CC2 (dual identity)
- Depends on: T1.2, T1.3
- **Status: ✅ Done** (`backend/src/modules/auth/*` — `auth.controller.ts`/`.spec.ts` added this batch; service/guard/strategy/DTOs landed in a prior batch. Routes: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`, `POST /api/auth/logout`, per orchestrator instruction — deviates from the task text's `/auth/device` naming.)
- Duration: 4h (largest T1 task — may split into 2 PRs: entity+login, then guards) | PR size: ~350 LOC | Tests: 8
- Files: `backend/src/modules/auth/*`, `backend/src/common/guards/jwt.guard.ts`, `backend/src/common/guards/permission.guard.ts`, `backend/src/common/decorators/require-permission.decorator.ts`
- Work: `users` entity (id, device_uuid, account_type, permissions derived via Roles later — stub `reporter` role inline for now), `AuthService.registerDevice` (device_uuid -> user row, account_type='anon'), dual-secret JWT (access 15m/refresh 7d, claims `sub/typ/jti/pv` per D2 interface), `AuthController` (`POST /auth/device`, `GET /api/me`, `POST /auth/refresh`), `JwtGuard` (sig+exp verify), `PermissionGuard` (Redis `perm:{sub}` lookup, DB rebuild on miss, 403 on missing permission — default-deny per R7), `@RequirePermission(action, resource?)` decorator (resource inferred from route path per D3).
- Acceptance criteria:
  - First-time device with only a UUID gets a scoped anonymous session token, not a full operator JWT (R1 scenario)
  - `GET /api/me` returns flat permission array for the anonymous reporter role: `['READ incidents','CREATE incidents','CREATE comments']` (blocker resolution #4)
  - Missing permission on a mutating endpoint returns 403 without executing the mutation (CC1)
  - Refresh token rotation invalidates the prior `jti`
- Test scenarios: device registration issues anon JWT; `/api/me` permission list; JWT guard rejects tampered/expired token; permission guard 403 on missing grant; permission guard passes on Redis cache hit and on DB-rebuild cache miss; refresh rotation.

### T1.5 — Geo zones seed data (Santa Elena) [P]
- Requirement: blocker resolution #2, unblocks R11 (Locations) and D4
- Depends on: T1.2
- **Status: ✅ Done** (`database/migrations/0002_add_postgis_and_geo_zones.sql` + `0003_seed_geo_zones.sql` + matching DOWN rollbacks; `database/seeds/generate-geo-zones-seed.js` generator; `backend/src/modules/geofencing/` repository+service+specs. Column type is `geometry(MultiPolygon,4326)`, not `Polygon` — verified against source data.)
- Duration: 2h | PR size: ~100 LOC + seed SQL | Tests: 2
- Files: `database/migrations/0002_geo_zones.sql`, `database/migrations/0002_geo_zones_down.sql`, `database/seeds/geo_zones_santa_elena.sql`
- Work: `geo_zones` table (id, name, geom GEOMETRY(Polygon,4326)) with GIST index per design's index list. Parse `ecuador-locations-geom.json` (GeoReporta source) and seed the Santa Elena jurisdiction polygon as the first `geo_zones` row.
- Acceptance criteria:
  - `geo_zones` table exists with GIST index on `geom`
  - Santa Elena polygon row present and `ST_IsValid(geom)` returns true
  - Down-migration cleanly drops table + index
- Test scenarios: migration up/down; seeded polygon passes `ST_IsValid`; `ST_Contains` against a known Santa Elena coordinate returns true.

**Batch 1 = T1.1 -> {T1.2, T1.3}[P] -> T1.5[P] -> T1.4.** Suggested assignees: 1 dev sequential, or 2 devs (Dev A: T1.1->T1.2->T1.5, Dev B: T1.3 in parallel, both converge on T1.4).

---

## PHASE 2 — Core Domains (Week 2-3) — STATUS: ✅ 6/6 COMPLETE

Full detail in `apply-progress.md` (Phase 2 section) / Engram `sdd/backend-nestjs-modules/apply-progress`.
Migration numbering deviates from this file (see per-task notes below and apply-progress): incidents=0004 (not 0003), comments=0005 (not 0004), users=0006 (new — not originally numbered), assignments=0007 (not 0006). All Pending in `database/MIGRATION_LOG.md`, none auto-applied.

### T2.0 — Geofencing module (owns geo_zones, D4) [x] DONE (commit 5f92ecc)
- Requirement: CC5 (geofencing cache consistency), R11 groundwork
- Depends on: T1.5, T1.4
- Duration: 3h | PR size: ~200 LOC | Tests: 5
- Files: `backend/src/modules/geofencing/geofencing.repository.ts`, `backend/src/modules/geofencing/geofencing.service.ts`
- Work: Raw PostGIS SQL isolated in a repository (swappable per design). `resolveZone(location)` -> `ST_Contains` against `geo_zones`, resolved once at write time. `findNearby(point, radiusM)` -> `ST_DWithin` at read time. Cache key builder `geo:{zone_id}:{lat3}:{lng3}:{radius}:{status}` (60s TTL) and tag-set writer `geo:tags:{zone_id}`.
- Acceptance criteria:
  - `resolveZone` returns `zone_id=null` for a point outside all zones (does not throw) — supports R2's `geofence_matched=false` scenario
  - Cache key uses 3-decimal lat/lng rounding (~110m grid) to bound cardinality
  - Purge helper clears all keys tagged under `geo:tags:{zone_id}`
- Test scenarios: containment inside Santa Elena polygon; containment outside all zones; proximity query radius boundary; cache key determinism; tag-set purge removes all tagged keys.

### T2.1 — Incidents module (core domain, calibration slice) [x] DONE (commit ee60bc2, migration renumbered 0004)
- Requirement: R2 (Incidents), CC5 (geofencing cache)
- Depends on: T2.0, T1.4
- Duration: 4h (calibration slice — establishes Jest/Supertest conventions per design; expect this to run long, do not compress) | PR size: ~400 LOC | Tests: 10
- Files: `backend/src/modules/incidents/*`, `database/migrations/0003_incidents.sql` (+ down)
- Work: `Incident` entity (id, title, description, location GEOMETRY, status, priority, citizen_id, assigned_to, zone_id, geofence_matched). `IncidentsService.create` resolves zone via Geofencing (T2.0), persists `geofence_matched=false` when zone is null but still accepts the incident (R2 scenario), purges `geo:tags:{zone_id}` and emits `incident.created` via EventEmitter2 + XADD to `incidents:events` (per design data flow). `findAll` cached by zone (`geo:` key), `findOne`, `updateStatus` (pending->in_progress->resolved) emits `incident.status_changed`.
- Acceptance criteria:
  - Incident outside all zones is still accepted with `geofence_matched=false` (R2)
  - Cached list query hits Redis on second call within 60s TTL, misses after invalidation
  - Status transition only allows the defined lifecycle order; illegal transition rejected
  - `incident.created` and `incident.status_changed` events land on the `incidents:events` Redis Stream
- Test scenarios: create inside zone (zone_id set); create outside all zones (geofence_matched=false, still 201); cache hit/miss on list; cache invalidation after status change; illegal status transition rejected; anonymous device can create (CC2); permission-gated status update requires `UPDATE incidents`.

### T2.2 — Comments module [P] [x] DONE (commit 0f00f1b, migration renumbered 0005)
- Requirement: R3 (Comments)
- Depends on: T2.1
- Duration: 2-3h | PR size: ~200 LOC | Tests: 5
- Files: `backend/src/modules/comments/*`, `database/migrations/0004_comments.sql` (+ down)
- Work: `Comment` entity (id, content, incident_id, user_id, created_at). `CommentService.create` sanitizes content (strip/escape script tags) before persisting (R3 scenario). `findByIncident`, `delete` (owner-only). Emits `comment.added`.
- Acceptance criteria:
  - Comment containing `<script>` tags is stripped/escaped before persist, never stored raw (R3)
  - Delete is rejected with 403 for a non-owner
  - Anonymous device with `CREATE comments` permission can comment (blocker resolution #4)
- Test scenarios: create with sanitization; read by incident; delete as owner; delete as non-owner rejected; anonymous CREATE allowed, anonymous DELETE rejected.

### T2.3 — Users module [P] [x] DONE (commit 239c724, migration 0006_users.sql — new slot, see apply-progress)
- Requirement: R4 (Users)
- Depends on: T1.4
- Duration: 3h | PR size: ~250 LOC | Tests: 6
- Files: `backend/src/modules/users/*`
- Work: Extend `User` entity (first_name, last_name, avatar_url, role, organization_id, is_active). `UserService.findById`, `updateProfile`, `updateAvatar` (multipart -> S3 -> signed URL), `list` (paginated). Track device/session history per login (R4 scenario) — writes a lightweight session row (full `Sessions` module lands in Phase 3, this is just the tracking hook).
- Acceptance criteria:
  - New-device login records a tracked session source (R4)
  - Avatar upload returns a signed S3 URL and persists it on the user row
  - Pagination default/limits enforced on `GET /api/users`
- Test scenarios: profile CRUD; avatar upload round-trip (mocked S3); pagination bounds; new-device session tracking row created.

### T2.4 — Assignments module [x] DONE (commit 096f3cb, migration renumbered 0007)
- Requirement: R5 (Assignments)
- Depends on: T2.1, T1.4 (Permissions/Roles stub from T1.4 sufficient; full T3.1 not required to start)
- Duration: 3h | PR size: ~220 LOC | Tests: 5
- Files: `backend/src/modules/assignments/*`, `database/migrations/0005_assignments.sql` (+ down)
- Work: `Assignment` entity (id, incident_id, operator_id, role, created_at). `assign` (validates `ASSIGN`/`UPDATE assignments` permission), `release`, `list`. Second-claim-on-already-assigned incident rejected with a conflict state (R5 scenario). Emits `incident.assigned`.
- Acceptance criteria:
  - Assigning an already-assigned incident returns a conflict (409), not a silent overwrite (R5)
  - Operator without `assignments:UPDATE` gets 403 without a DB write (CC1)
  - Release clears `assigned_to` on the incident
- Test scenarios: assign happy path; double-claim conflict; permission-denied assign; release workflow.

### T2.5 — WebSocket gateway (real-time, D5/D6) [x] DONE (commit 4dbbae4)
- Requirement: CC4 (realtime event delivery)
- Depends on: T2.1, T1.4
- Duration: 4h | PR size: ~300 LOC | Tests: 6
- Files: `backend/src/modules/realtime/events.gateway.ts`, `backend/src/modules/realtime/streams.consumer.ts`
- Work: `IncidentsGateway` (namespace `/incidents`), JWT verified on connect (reuse JwtGuard logic), auto-join `user:{id}` + permission-gated `geo:{zone_id}`/`org:{org_id}` rooms. Redis Streams consumer group `realtime` reads `incidents:events`, target rooms computed from event payload (zone_id/org_id), broadcasts via `socket.io-redis-adapter` for cross-instance fan-out. Events: `incident:created`, `incident:assigned`, `comment:added`, `status:changed`.
- Acceptance criteria:
  - Operator connected to `geo:{zone_id}` room receives `incident:assigned` within 2s without polling (CC4 scenario)
  - Socket without READ permission on a zone/org is not auto-joined to that room
  - Broadcast reaches sockets connected to a different app instance (adapter test, may require Testcontainers Redis)
- Test scenarios: connect+auth; room auto-join respects permissions; single-instance emit/receive; multi-room targeting from payload; consumer-group delivery does not duplicate across the same group.

**Batch 2 = T2.0 -> T2.1 -> {T2.2, T2.3, T2.4, T2.5}[P].** Suggested assignees (3 devs): Dev A owns T2.0->T2.1 (calibration slice, do not parallelize this critical path). Once T2.1 merges, Dev A takes T2.5 (realtime), Dev B takes T2.2+T2.3, Dev C takes T2.4.

---

## PHASE 3 — Scale + RBAC (Week 4)

### T3.1 — Roles + Permissions modules
- Requirement: R6 (Roles), R7 (Permissions), formalizes D2/D3 groundwork from T1.4
- Depends on: T1.4
- Duration: 3h | PR size: ~220 LOC | Tests: 6
- Files: `backend/src/modules/roles/*`, `backend/src/modules/permissions/*`, `database/migrations/0006_roles_permissions.sql` (+ down)
- Work: `Role` entity (id, name, permissions JSON array of `"ACTION resource"` strings), `Permission` entity (resource, action enum READ/CREATE/UPDATE/DELETE) consumed by `PermissionGuard`. `RoleService.listPermissions`, `assignRole` (bumps `pv` per D2 to invalidate cached blobs). Replace T1.4's inline `reporter` stub with a real seeded role row.
- Acceptance criteria:
  - Role with no assigned permissions denies every mutating action for a user holding only that role (R6 scenario)
  - New resource introduced with no permission entries default-denies (R7 scenario — matches PermissionGuard's default-deny from T1.4)
  - Role reassignment bumps `pv`, invalidating the user's cached `perm:{sub}` set
- Test scenarios: empty-permission role denies all mutations; unknown resource default-denies; role assignment bumps pv and forces Redis rebuild.

### T3.2 — Organizations module [P]
- Requirement: R8 (Organizations)
- Depends on: T2.1, T2.3
- Duration: 2-3h | PR size: ~180 LOC | Tests: 4
- Files: `backend/src/modules/organizations/*`, `database/migrations/0007_organizations.sql` (+ down)
- Work: `Organization` entity (id, name, zone_id FK to `geo_zones`). `OrgService.findByZone`, scoped incident/user queries. Cross-org visibility gated by an explicit permission.
- Acceptance criteria:
  - User in Org A querying incidents excludes Org B data unless explicitly cross-org permitted (R8 scenario)
  - `findByZone` returns organizations whose `zone_id` matches a `geo_zones` row
- Test scenarios: org-scoped incident visibility; cross-org denial by default; cross-org access with explicit permission granted.

### T3.3 — Notifications module [P]
- Requirement: R9 (Notifications), depends on Mail (T3.5) and realtime events
- Depends on: T2.1, T2.4, T2.5, T3.5
- Duration: 4h | PR size: ~300 LOC | Tests: 6
- Files: `backend/src/modules/notifications/*`, `database/migrations/0008_notifications.sql` (+ down)
- Work: `Notification` entity (id, user_id, type email/telegram/push, related_incident_id, is_read). Passive listener (EventEmitter2/Streams consumer group `notifications` per D7 — never imported by Incidents) fans out on `incident.created`/`incident.assigned` events. Bull queue job for async delivery (mail via T3.5, Telegram via Bot API), deduplicated per event+channel (R9 scenario).
- Acceptance criteria:
  - User with both Telegram and email configured receives both channels for a critical event with no duplicate sends per channel (R9)
  - Notification delivery is fully async — never blocks the triggering request
  - Notifications module has zero import edges from Incidents (D7 — verify via module graph)
- Test scenarios: dual-channel delivery no duplicates; queue job retry on transient failure; mark-as-read; passive subscription confirmed (no direct import from Incidents).

### T3.4 — StatusHistory module (passive audit trail) [P]
- Requirement: R14 (StatusHistory), D7 (passive domain)
- Depends on: T2.1
- Duration: 2h | PR size: ~150 LOC | Tests: 4
- Files: `backend/src/modules/status-history/*`, `database/migrations/0009_status_history.sql` (+ down)
- Work: `StatusHistory` entity (id, incident_id, old_status, new_status, changed_by_user_id, created_at) — append-only, no update/delete endpoints. EventEmitter2/Streams consumer group `status-history` subscribes to `incident.status_changed` (passive, no import from Incidents per D7). `getAuditTrail(incidentId)`.
- Acceptance criteria:
  - Every incident status transition persists an immutable history record with actor, timestamp, from/to state (R14 scenario)
  - No update or delete route exists for `StatusHistory` rows
  - Module has zero import edges from/to Incidents (event-only coupling, D7)
- Test scenarios: status change produces exactly one history row; audit trail ordered by created_at; immutability enforced (no PATCH/DELETE route registered).

### T3.5 — Mail module [P]
- Requirement: R13 (Mail), unblocks T3.3 and T3.6
- Depends on: T1.1
- Duration: 2h | PR size: ~150 LOC | Tests: 3
- Files: `backend/src/modules/mail/*`
- Work: SMTP client wrapper, templated send (invitations, notifications). Failures are logged, not silently dropped (R13 scenario); retried via the same Bull queue infra used by Notifications.
- Acceptance criteria:
  - SMTP send failure is logged with enough context to diagnose and does not silently drop the notification (R13 scenario)
  - Templates render with variable interpolation and escape user-provided content
- Test scenarios: successful send (mocked transport); transport failure logs error and surfaces retry; template rendering with variable substitution.

### T3.6 — Invitations module [P]
- Requirement: R12 (Invitations)
- Depends on: T3.1, T3.5
- Duration: 2-3h | PR size: ~200 LOC | Tests: 4
- Files: `backend/src/modules/invitations/*`, `database/migrations/0010_invitations.sql` (+ down)
- Work: `Invitation` entity (id, email, role_id, token, expires_at, used_at). Single-use, expiring token issuance + redemption. Redeeming an expired token is rejected and requires a new invitation (R12 scenario). Sends via Mail (T3.5).
- Acceptance criteria:
  - Expired invitation token redemption is rejected (R12 scenario)
  - Token is single-use — second redemption attempt with the same token fails even before expiry
- Test scenarios: issue + redeem happy path; expired token rejected; already-used token rejected; mail send triggered on issuance.

### T3.7 — IncidentCategories module [P]
- Requirement: R10 (IncidentCategories)
- Depends on: T2.1
- Duration: 2-3h | PR size: ~180 LOC | Tests: 4
- Files: `backend/src/modules/incident-categories/*`, `database/migrations/0011_incident_categories.sql` (+ down)
- Work: Adjacency-list hierarchical category taxonomy (id, name, parent_id). `getSubtree(parentId)` returns full subtree via recursive CTE (R10 scenario). Wire `Incident.category_id` FK.
- Acceptance criteria:
  - Querying a parent category returns its full subtree, not just direct children (R10 scenario)
  - Circular parent references are rejected on write
- Test scenarios: subtree query multi-level depth; direct-children-only regression guard; circular reference write rejected.

### T3.8 — Locations module [P]
- Requirement: R11 (Locations), CC5 cache invalidation trigger
- Depends on: T2.0
- Duration: 2h | PR size: ~150 LOC | Tests: 3
- Files: `backend/src/modules/locations/*` (thin service wrapping `geo_zones` CRUD — Geofencing repository from T2.0 remains the query path)
- Work: Admin-facing CRUD over `geo_zones` boundary polygons. Editing a boundary polygon triggers cache invalidation per CC5 (purge all `geo:tags:{zone_id}` keys for the edited zone).
- Acceptance criteria:
  - Saving an edited boundary polygon triggers cache invalidation and the next lookup bypasses stale cache (CC5 scenario)
  - Invalid polygon geometry (`ST_IsValid=false`) is rejected on write
- Test scenarios: boundary edit purges tagged cache keys; next containment lookup after edit reflects new boundary; invalid geometry write rejected.

### T3.9 — Sessions module [P]
- Requirement: R15 (Sessions)
- Depends on: T1.4
- Duration: 2h | PR size: ~150 LOC | Tests: 3
- Files: `backend/src/modules/sessions/*`, `database/migrations/0012_sessions.sql` (+ down)
- Work: Track active device/operator sessions (jti, user_id, device_info, issued_at, revoked_at) for revocation and audit. Revoking a refresh token's `jti` forces re-authentication on next use (R15 scenario) — hooks into T1.4's refresh rotation.
- Acceptance criteria:
  - Using a revoked refresh token is rejected and requires re-authentication (R15 scenario)
  - Session list is queryable per user for audit purposes
- Test scenarios: revoke then attempt refresh with revoked jti (rejected); active session list per user; revocation is immediate (no TTL lag).

### T3.10 — Menus module [P]
- Requirement: R16 (Menus)
- Depends on: T3.1
- Duration: 1-2h | PR size: ~100 LOC | Tests: 3
- Files: `backend/src/modules/menus/*`
- Work: Serve dynamic navigation filtered by the caller's permission set (reuses `PermissionGuard`'s Redis lookup, no separate storage needed beyond a static menu-to-permission map).
- Acceptance criteria:
  - User lacking `assignments:READ` does not see the Assignments menu entry in the response (R16 scenario)
- Test scenarios: full-permission user sees all entries; restricted user has entries filtered; anonymous user sees only reporter-scoped entries.

**Batch 3 = T3.1 -> {T3.2, T3.4, T3.5, T3.7, T3.8, T3.9}[P] -> {T3.3, T3.6, T3.10}[P].** Suggested assignees (3 devs): Dev A: T3.1 -> T3.3 (Notifications, longest). Dev B: T3.5 -> T3.6 (Mail->Invitations chain) + T3.9 (Sessions). Dev C: T3.2 + T3.4 + T3.7 + T3.8 (independent, can run fully parallel). T3.10 last (any dev, quick).

---

## PHASE 4 — Polish + Testing (Week 5)

### T4.1 — Integration tests (E2E workflows) — STATUS: 🟡 PARTIAL (T4.1a + T4.1a-step-2 done, T4.1b deferred)
- Requirement: validates CC1-CC5, R1-R16 end-to-end
- Depends on: all Phase 2 + Phase 3 tasks
- Duration: 4h | PR size: ~300 LOC (test-only) | Tests: 4 full-flow scenarios
- Files: `backend/test/e2e/*.e2e-spec.ts`
- Work: Supertest + Testcontainers (postgis:16-3.4, redis:7) flows: (1) citizen reports incident anonymously; (2) admin assigns to operator, verified via WebSocket event; (3) operator comments + changes status, StatusHistory row confirmed; (4) notification delivered to citizen (mocked transport, queue job asserted).
- Acceptance criteria: all four flows pass against real Postgres+PostGIS and Redis containers, not mocks.
- Test scenarios: as listed above (4 flows), each asserting cross-module side effects (cache, events, audit rows).

**T4.1a — e2e harness — ✅ DONE** (`backend/test/jest-e2e.json`, `backend/test/support/run-migrations.ts`, `backend/test/support/test-environment.ts`, `backend/test/e2e/health.e2e-spec.ts`; CI `integration` job added to `.github/workflows/ci.yml`). Real Testcontainers (postgis/postgis:16-3.4 + redis:7-alpine, verified working in-sandbox, no docker-compose fallback needed), schema from `database/migrations/[0-9]*.sql` (never `synchronize`), app booted with the exact `main.ts` pipeline. One smoke spec only (health 200 + anonymous login returns the 4-permission ceiling). Side-fix: `RedisIoAdapter` never closed its `pubClient`/`subClient` on shutdown — a real production leak (infinite ioredis reconnect retries after every restart), discovered because the harness is the first thing to exercise a real app shutdown against real Redis; fixed with a `close()` override + `redis-io.adapter.spec.ts`. Full detail: `sdd/backend-nestjs-modules/apply-progress`.

**T4.1a step 2 — regression tests + flows — ✅ DONE** (`backend/test/e2e/regressions.e2e-spec.ts` — 9 tests, one per defect shipped in Phases 1-2; `backend/test/e2e/flows.e2e-spec.ts` — 5 real workflow flows: anonymous emergency report, anonymous ceiling CC2, assignment claim/conflict/stream, comment lifecycle with persisted-row sanitization check, status lifecycle with cache-purge + stream-emission assertions). Built ON the T4.1a harness, harness itself untouched. Two NEW production defects surfaced while writing the flows and fixed in their own commits (separate from the test commits): (1) `GeofencingService.getCachedZoneByPoint` tried to `cache.set(key, null, ttl)` for a point outside all zones — cache-manager-redis-yet's `isCacheable()` rejects null/undefined, so every out-of-zone incident create 500'd (R2 requires 201); fixed by skipping the cache write for a null result. (2) `AssignmentsService.assign()` only emitted a local `EventEmitter2` event, never XADDed to `incidents:events` — a claim was invisible to `RealtimeStreamsConsumer` and every other API instance (CC4 gap); fixed by publishing `incident.assigned` to the stream, matching Incidents' pattern. Full detail: `sdd/backend-nestjs-modules/apply-progress`.

**T4.1b — StatusHistory/Notifications assertions — still deferred until after Phase 3** (StatusHistory and Notifications don't exist yet — T3.4/T3.3).

**⚠️ Branch discrepancy found during T4.1a**: this task's source instruction named `brydyan/sc-194/backend-nestjs-modules`, but the checked-out working tree was already on `brydyan/sc-252/fase-3-de-la-migracion-del-backend` (descendant of sc-194's tip, +2 commits including the one that created `ci.yml`'s `backend`/`migrations` jobs) before T4.1a started. The harness commit landed on sc-252, confirmed correct and unchanged for this batch (T4.1a step 2 also landed on sc-252, per this batch's explicit instruction).

### T4.2 — Load testing (25k+ users) [P]
- Requirement: scale patterns (WebSockets 5k sockets/instance target, geofencing cache)
- Depends on: T2.5, T2.0
- Duration: 3-4h | PR size: ~150 LOC (scripts) | Tests: n/a (measurement, not pass/fail unit tests)
- Files: `backend/loadtest/*.js` (k6 or Artillery)
- Work: Simulate concurrent WebSocket connections toward the 25k target, geofencing query performance under load, Redis cache hit-rate measurement, latency/throughput/error-rate capture.
- Acceptance criteria:
  - Geofencing proximity queries hold p95 < 100ms warm (per design's testing strategy)
  - Cache hit rate reported and reviewed against the 60s TTL assumption
  - Results documented with concrete numbers, not just "passed"
- Test scenarios: ramp to target concurrent sockets; sustained geofencing query load; cache hit-rate under mixed read/write.

### T4.3 — Security hardening [P]
- Requirement: CC1, scale pattern (rate limiting per device_uuid), general hardening
- Depends on: T1.3, T1.4
- Duration: 3h | PR size: ~150 LOC | Tests: 5
- Files: `backend/src/common/guards/*`, `backend/src/main.ts` (CORS review)
- Work: Confirm rate limiting is per-`device_uuid` (not global) under load, CORS restricted to the frontend domain, JWT secret rotation procedure documented (if applicable), SQL injection regression tests confirming all queries are parameterized/query-builder (no raw string concatenation outside the Geofencing repository's isolated raw SQL, which is parameterized).
- Acceptance criteria:
  - Rate limit enforcement confirmed per-device under concurrent load from multiple devices
  - CORS rejects requests from non-allowlisted origins
  - Injection attempts against all mutating endpoints are rejected/neutralized
- Test scenarios: rate limit enforcement per device; CORS rejection; SQL injection payloads against incidents/comments/auth endpoints.

### T4.4 — Documentation + README [P]
- Requirement: closes out the change for handoff
- Depends on: all prior tasks (content-complete)
- Duration: 3h | PR size: docs-only | Tests: n/a
- Files: `backend/README.md`, `docs/API.md` (or Swagger setup), `docs/ARCHITECTURE.md`
- Work: API endpoint reference (Swagger or manual per module), architecture diagrams (ASCII/Mermaid reflecting the module DAG from design), setup instructions (Docker, env vars), deployment checklist (migration run order, PostGIS extension check, Redis DB0/DB1 split).
- Acceptance criteria: a new developer can follow the README + MIGRATION_LOG.md to stand up the backend locally without out-of-band help.

**Batch 4 = T4.1 (blocking, needs everything) -> {T4.2, T4.3, T4.4}[P].**

---

## Full Dependency Graph

```
T1.1 -> T1.2 -> T1.5 -> T2.0 -> T2.1 -> T2.2
     -> T1.3 ------------------------> T2.3
     -> T1.4 (needs T1.2,T1.3) ------> T2.4
                                    -> T2.5
T1.4 -> T3.1 -> T3.2 (needs T2.1,T2.3)
             -> T3.4 (needs T2.1)
             -> T3.5 -> T3.6
             -> T3.7 (needs T2.1)
T2.0 -> T3.8
T1.4 -> T3.9
T3.1 -> T3.10
{T2.1,T2.4,T2.5,T3.5} -> T3.3

{Phase2, Phase3 all} -> T4.1 -> {T4.2, T4.3, T4.4}
```

## Batch Summary

| Batch | Tasks | Critical path | Parallel slots |
|---|---|---|---|
| 1 | T1.1-T1.5 | T1.1->T1.2->T1.4 | T1.3, T1.5 parallel to T1.2 |
| 2 | T2.0-T2.5 | T2.0->T2.1 (calibration, do not compress) | T2.2/T2.3/T2.4/T2.5 after T2.1 |
| 3 | T3.1-T3.10 | T3.1->T3.5->T3.6->... | T3.2/T3.4/T3.7/T3.8/T3.9 fully parallel after T3.1 |
| 4 | T4.1-T4.4 | T4.1 (E2E gate) | T4.2/T4.3/T4.4 parallel after T4.1 |

## Assignee Slots (1-3 developers)

- **Solo dev**: follow task order top to bottom; ~5 weeks matches the phase labels.
- **2 devs**: Dev A takes the critical-path chain each phase (T1.1/T1.2/T1.4, T2.0/T2.1, T3.1/T3.5/T3.6, T4.1); Dev B takes parallel siblings (T1.3, T2.2-T2.5 rotating, T3.2/T3.4/T3.7-T3.9, T4.2-T4.4).
- **3 devs**: as noted per-batch above (Dev A/B/C breakdown in each phase's batch note).

## Risks / Bottlenecks

- T2.1 (Incidents, calibration slice) is the single highest-risk serialization point — 5 of the remaining Phase-2/3 modules depend on it directly or transitively. Do not parallelize work into it; let it set conventions first.
- T1.4 (Auth) blocks nearly everything downstream (10+ tasks). Treat as highest priority in Phase 1; consider splitting into two PRs (entity+login, then guards) as noted to reduce time-to-merge risk.
- T3.3 (Notifications) has the most dependencies (T2.1, T2.4, T2.5, T3.5) — schedule last within Phase 3 and assign to whichever dev finishes their chain first.
- Open design questions still unresolved at task-authoring time: Streams retention/MAXLEN cap (affects T2.5's consumer implementation — default to a reasonable cap and flag for revisit); anonymous permission ceiling is now fixed by blocker resolution #4, superseding the open question in design.
