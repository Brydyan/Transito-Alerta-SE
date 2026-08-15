# Apply Progress: Backend NestJS Migration — Phase 1 (T1.1-T1.5)

Change: `backend-nestjs-modules` | Batch: 1 (Infrastructure + Auth) | Mode: Strict TDD | Status: **5/5 tasks complete**

Package manager: **pnpm** (`pnpm install`, `pnpm run build`, `pnpm test`). Lockfile `backend/pnpm-lock.yaml`.

## Task status

| Task | Status | Notes |
|------|--------|-------|
| T1.1 — NestJS scaffold + config | ✅ Done | Pre-existing on disk, committed this batch (`3069de3`) |
| T1.2 — DB config + manual migrations | ✅ Done | Entities pre-existing; `0001_initial_schema.sql` + DOWN, MIGRATION_LOG.md, README.md new this batch (`82a2569`) |
| T1.3 — Redis cache + rate limiting | ✅ Done | Pre-existing on disk; fixed a build-breaking `CACHE_MANAGER` import bug this batch (`d7b69bc`) |
| T1.4 — Auth module | ✅ Done | Service/guard/strategy/DTOs pre-existing; controller + module + spec new this batch (`f7d487a`) |
| T1.5 — Geo zones seed (Santa Elena) | ✅ Done | Entity pre-existing; migrations 0002/0003 + rollbacks, seed generator, geofencing module all new this batch (`4c9c04e`) |

## TDD Cycle Evidence

| Task | Unit | RED (test first) | GREEN (impl passes) | REFACTOR |
|------|------|-------------------|----------------------|----------|
| T1.4 | `AuthController` | `auth.controller.spec.ts` written alongside controller, asserting delegation to `AuthService` for login/refresh/me/logout | `auth.controller.ts` implemented to satisfy all 5 spec cases | N/A — matched existing controller pattern (thin delegation, see `app.controller.ts`) |
| T1.4 | `AuthService.getMe` | Extended `auth.controller.spec.ts` to require `getMe(userId)` returning `{deviceUuid, permissions}` | Added `getMe` to `auth.service.ts` | N/A |
| T1.5 | `GeofencingRepository` | `geofencing.repository.spec.ts` written first — including an explicit regression test asserting `ST_Point(lng, lat)` argument order | `geofencing.repository.ts` implemented with parameterized `ST_Contains`/`ST_DWithin` queries | N/A |
| T1.5 | `GeofencingService` | `geofencing.service.spec.ts` written first — cache-key format, TTL, invalid-coordinate rejection, R2 "outside boundary returns null not throw" | `geofencing.service.ts` implemented (`validateIncidentInZone`, `getCachedZoneByPoint`) | N/A |

All 4 new units follow RED→GREEN; existing units (T1.1-T1.3 core files) were pre-existing with their own specs already passing.

## Files changed (this batch)

| File | Action | What Was Done |
|------|--------|----------------|
| `backend/src/modules/auth/auth.controller.ts` | Created | `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me` (JWT-guarded), `POST /api/auth/logout` |
| `backend/src/modules/auth/auth.controller.spec.ts` | Created | Unit tests for all 4 routes |
| `backend/src/modules/auth/auth.module.ts` | Created | Wires `TypeOrmModule.forFeature([UserEntity])`, `PassportModule`, `JwtModule.registerAsync`, exports `AuthService` |
| `backend/src/modules/auth/auth.service.ts` | Modified | Added `getMe(userId)` for the `/me` route |
| `.env.example` (project root) | Created | All documented vars, placeholders only, no Firebase |
| `database/migrations/0001_initial_schema.sql` | Created | `users`/`organizations`/`roles` + anonymous identity seed row |
| `database/migrations/0002_add_postgis_and_geo_zones.sql` | Created | `CREATE EXTENSION postgis`, `geo_zones` (MultiPolygon), GIST index, deferred FK from `organizations.zone_id` |
| `database/migrations/0003_seed_geo_zones.sql` | Created | Generated INSERTs for Santa Elena province + 3 cantons |
| `database/rollback/0001_initial_schema.DOWN.sql` | Created | Drops users/organizations/roles |
| `database/rollback/0002_add_postgis_and_geo_zones.DOWN.sql` | Created | Drops FK + geo_zones table |
| `database/rollback/0003_seed_geo_zones.DOWN.sql` | Created | Deletes the 4 seeded rows by fixed UUID |
| `database/MIGRATION_LOG.md` | Created | 3 migrations, all `⏳ Pending`, manual-execution policy documented |
| `database/README.md` | Created | How to apply/roll back, how to regenerate the geo_zones seed |
| `database/seeds/generate-geo-zones-seed.js` | Created | Node script: reads `ecuador-locations-geom.json`, emits `ST_GeomFromGeoJSON` INSERTs for EC-24 + cantons |
| `database/seeds/0003_seed_geo_zones.generated.sql` | Created | Generator output (mirrored into `database/migrations/0003_seed_geo_zones.sql`) |
| `backend/src/modules/geofencing/geofencing.repository.ts` | Created | `findZoneByPoint` (ST_Contains), `findZonesNearby` (ST_DWithin), parameterized SQL via `DataSource.query` |
| `backend/src/modules/geofencing/geofencing.repository.spec.ts` | Created | Incl. explicit `ST_Point(lng, lat)` argument-order regression test |
| `backend/src/modules/geofencing/geofencing.service.ts` | Created | `validateIncidentInZone` (400 on invalid coords), `getCachedZoneByPoint` (Redis, `geo:point:{lat.3}:{lng.3}`, 60s TTL) |
| `backend/src/modules/geofencing/geofencing.service.spec.ts` | Created | Cache-key format, TTL, R2 "outside boundary" behavior |
| `backend/src/modules/geofencing/geofencing.module.ts` | Created | Providers + exports `GeofencingService` |
| `backend/src/common/guards/rate-limiter.guard.ts` | Modified | Fixed `CACHE_MANAGER` import (`@nestjs/cache-manager`, not `@nestjs/common`) — was a build-breaking pre-existing bug |
| `backend/src/common/interceptors/cache.interceptor.ts` | Modified | Same `CACHE_MANAGER` import fix |
| `backend/src/modules/auth/auth.service.ts` | Modified | Same `CACHE_MANAGER` import fix + `getMe` |

## Files verified pre-existing (not recreated)

`backend/package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `backend/.gitignore`, `backend/src/main.ts`, `app.module.ts`, `app.controller.ts`(+spec), `backend/src/config/{auth,cache,database}.config.ts`, `backend/src/entities/{user,organization,role,geo-zone}.entity.ts`, `backend/src/common/guards/{permission,rate-limiter}.guard.ts`(+specs), `backend/src/common/decorators/require-permission.decorator.ts`(+spec), `backend/src/common/interceptors/cache.interceptor.ts`(+spec), `backend/src/core/core.module.ts`, `backend/src/modules/auth/{auth.service.ts(+spec), jwt.strategy.ts, jwt-auth.guard.ts, dto/*, interfaces/jwt-payload.interface.ts}`.

## Deviations from Design

- **Auth routes**: task text (`tasks.md` T1.4) says `POST /auth/device`; actual implementation is `POST /api/auth/login` (per explicit orchestrator instruction and consistency with `refresh`/`me`/`logout` all under `/api/auth/*`). Behaviorally equivalent — still issues a scoped session for a device UUID.
- **`geo_zones.polygon` type**: design/task text says `GEOMETRY(Polygon,4326)`; implementation uses `geometry(MultiPolygon, 4326)`. Verified against the actual source data (`GeoReporta/backend/database/data/ecuador-locations-geom.json`, key `EC-24`): Santa Elena province and its 3 cantons are all `MultiPolygon`, not `Polygon`. Using `Polygon` would have made `ST_GeomFromGeoJSON` on the seed data throw a type-mismatch error.
- **Geofencing landed as its own module** rather than inline SQL/service code inside T1.5's file list — matches design D4/module DAG ("Geofencing -> (none — owns geo_zones)") and D-DAG's `GeofencingRepository`/`GeofencingService` naming from the design's "File Changes" table.
- **No Sessions/revocation logic** in `logout` — stateless JWT discard only. Design explicitly defers Sessions (R15) to T3.9; noted in the controller's inline comment.

## Issues Found

- Pre-existing bug: `CACHE_MANAGER` was imported from `@nestjs/common` in 3 already-on-disk files (`rate-limiter.guard.ts`, `cache.interceptor.ts`, `auth.service.ts`). In the installed NestJS 10.4.x / `@nestjs/cache-manager` 2.2.2 combination, `CACHE_MANAGER` is exported from `@nestjs/cache-manager`, not `@nestjs/common`. This broke `pnpm run build` entirely. Fixed by changing the import source in all 3 files (and in the new `geofencing.service.ts`, which would have had the same bug).
- `pnpm run lint` fails — no ESLint config file exists yet (`eslint.config.js` / `.eslintrc`), despite `@typescript-eslint/*` being in `devDependencies`. This is a T1.1 scaffold gap, not part of the assigned T1.1-T1.5 batch scope; flagging for a follow-up task (does not block build/test).
- PostGIS extension availability (proposal Q3 / T1.2 acceptance criterion "PostGIS extension confirmed present... in MIGRATION_LOG.md") cannot be verified from this sandbox — no live Supabase connection. The migration SQL (`CREATE EXTENSION IF NOT EXISTS postgis;`) is written and ready; the user must run it manually and update `MIGRATION_LOG.md` per the documented policy.

## Test Results

```
$ pnpm run build
$ nest build
(no errors)

$ pnpm test
PASS src/common/decorators/require-permission.decorator.spec.ts
PASS src/app.controller.spec.ts
PASS src/common/guards/permission.guard.spec.ts
PASS src/common/interceptors/cache.interceptor.spec.ts
PASS src/modules/geofencing/geofencing.service.spec.ts
PASS src/common/guards/rate-limiter.guard.spec.ts
PASS src/modules/geofencing/geofencing.repository.spec.ts
PASS src/modules/auth/auth.service.spec.ts
PASS src/modules/auth/auth.controller.spec.ts

Test Suites: 9 passed, 9 total
Tests:       49 passed, 49 total
Snapshots:   0 total
Time:        ~3s
```

## Remaining Tasks (Phase 2+, not in this batch)

- [ ] T2.0 — Geofencing integration into Incidents write path (owns geo_zones already built; needs Incidents module)
- [ ] T2.1 — Incidents (calibration slice)
- [ ] T2.2-T2.5 — Comments, Users, Assignments, WebSocket gateway
- [ ] Phase 3 (T3.1-T3.10), Phase 4 (T4.1-T4.4) — unstarted

## Git

Branch `brydyan/sc-194/backend-nestjs-modules`, 5 commits (not pushed):
1. `3069de3` — T1.1 scaffold
2. `82a2569` — T1.2 DB schema + CoreModule
3. `d7b69bc` — T1.3 Redis guards (+ CACHE_MANAGER fix)
4. `f7d487a` — T1.4 Auth module
5. `4c9c04e` — T1.5 Geofencing module + PostGIS migrations + seed

## Status (Phase 1)

5/5 Phase-1 tasks complete. Build green, 49/49 tests passing. **Ready for `sdd-verify`**, or continue to Phase 2 (`T2.0-T2.5`) apply batch.

---

# Apply Progress: Backend NestJS Migration — Phase 2 (T2.0-T2.5)

Change: `backend-nestjs-modules` | Batch: 2 (Core Domains) | Mode: Strict TDD | Status: **6/6 tasks complete**

## Task status

| Task | Status | Notes |
|------|--------|-------|
| T2.0 — Geofencing reconciliation | ✅ Done | `resolveZone`, `buildZoneCacheKey`, `tagCacheKey`/`purgeZoneCache` added to existing `GeofencingService` (`5f92ecc`) |
| T2.1 — Incidents (calibration slice) | ✅ Done | Entity + repository + service + controller + module, migration `0004_incidents.sql` (`ee60bc2`) |
| T2.2 — Comments | ✅ Done | Sanitization, owner-only delete, migration `0005_comments.sql` (`0f00f1b`) |
| T2.3 — Users | ✅ Done | Profile columns, avatar upload seam, pagination, session tracking, migration `0006_users.sql` (`239c724`) |
| T2.4 — Assignments | ✅ Done | Claim/release, ASSIGN permission, conflict on double-claim, migration `0007_assignments.sql` (`096f3cb`) |
| T2.5 — WebSocket gateway | ✅ Done | Redis Streams consumer group + socket.io Redis adapter, multi-dimensional rooms (`4dbbae4`) |

## CRITICAL — migration renumbering (reconciled)

`tasks.md` originally said incidents=`0003_incidents.sql`, comments=`0004_comments.sql`, assignments=`0006_assignments.sql`. Those numbers conflicted with Phase 1's `0001_initial_schema.sql`/`0002_add_postgis_and_geo_zones.sql`/`0003_seed_geo_zones.sql`, and Users (T2.3) also needed its own migration that wasn't in the original numbering. **Actual numbering on disk:**

| # | File | Table(s) |
|---|------|----------|
| 0004 | `incidents.sql` | `incidents` |
| 0005 | `comments.sql` | `comments` |
| 0006 | `users.sql` | ALTER `users` (profile cols) + `user_sessions` |
| 0007 | `assignments.sql` | `assignments` |

Every migration has a matching `database/rollback/*.DOWN.sql` and a `⏳ Pending` row in `database/MIGRATION_LOG.md`. TypeORM stays `synchronize: false`, `migrationsRun: false` — nothing auto-applies; the user runs these manually in Supabase.

## Files changed (Phase 2)

### T2.0 — Geofencing
- `backend/src/core/core.module.ts` — added `REDIS_CLIENT` (raw ioredis) DI token, marked `@Global()` so any feature module can `@Inject(REDIS_CLIENT)` without importing CoreModule directly (needed for SADD/SMEMBERS/DEL and later XADD/XREADGROUP — cache-manager's `Cache` interface has no tag-set or stream primitives).
- `backend/src/modules/geofencing/geofencing.service.ts`(+spec) — `resolveZone()` (never throws for "outside all zones", returns `{zone_id: null, zone: null}`), `buildZoneCacheKey()` (`geo:{zone_id}:{lat3}:{lng3}:{radius}:{status}`), `tagCacheKey()`/`purgeZoneCache()`.

### T2.1 — Incidents
- `backend/src/entities/incident.entity.ts` — Point location (SRID 4326), status/priority, citizen_id, assigned_to, zone_id, geofence_matched.
- `backend/src/modules/incidents/{incidents.repository,incidents.service,incidents.controller,incidents.module}.ts` (+specs) — raw parameterized PostGIS SQL (ST_Point lng/lat order, mirrors `GeofencingRepository`); `create` resolves zone, purges geofencing cache tag-set + incidents list cache, emits `incident.created` via EventEmitter2 AND XADDs `incidents:events`; `updateStatus` enforces forward-only `pending -> in_progress -> resolved`.
- `database/migrations/0004_incidents.sql` + rollback.

### T2.2 — Comments
- `backend/src/entities/comment.entity.ts`.
- `backend/src/modules/comments/{comments.service,comments.controller,comments.module}.ts` (+specs) — `sanitizeContent()` strips `<script>` tags then HTML-entity-escapes remaining markup; `delete` is owner-only (403 ForbiddenException for non-owners).
- `database/migrations/0005_comments.sql` + rollback.

### T2.3 — Users
- `backend/src/entities/user.entity.ts` (modified) — added first_name, last_name, avatar_url, role, organization_id.
- `backend/src/entities/user-session.entity.ts` (new) — lightweight `user_sessions` tracking table.
- `backend/src/modules/users/{users.service,users.controller,users.module,avatar-storage.service}.ts` (+specs) — `list()` enforces `DEFAULT_PAGE_SIZE=20`/`MAX_PAGE_SIZE=100`; `AvatarStorageService` is a pure/mockable seam (no live S3 SDK wired this batch — was not in the explicit dependency list; `upload()`/`getSignedUrl()` are side-effect-free and fully unit tested).
- `backend/src/modules/auth/auth.service.ts` (modified) — now takes `EventEmitter2`, emits `auth.login({userId, deviceUuid})` on every login; `UsersService.handleAuthLogin` (`@OnEvent('auth.login')`) records the session row. Passive fan-out (design D7) — AuthModule does NOT import UsersModule.
- `database/migrations/0006_users.sql` + rollback.

### T2.4 — Assignments
- `backend/src/entities/assignment.entity.ts`.
- `backend/src/modules/assignments/{assignments.service,assignments.controller,assignments.module}.ts` (+specs) — `assign()` throws 409 ConflictException on a second claim (R5); DB-level `UNIQUE(incident_id)` backstop in the migration.
- `backend/src/common/decorators/require-permission.decorator.ts` (modified) — extended `PermissionAction` with `'ASSIGN'`.
- `database/migrations/0007_assignments.sql` + rollback.

### T2.5 — WebSocket gateway
- Added deps: `socket.io`, `@nestjs/websockets`, `@nestjs/platform-socket.io` (pinned `^10.4.4` — pnpm resolved v11 by default, which is incompatible with the rest of the NestJS 10.x stack; had to explicitly re-pin), `@socket.io/redis-adapter`.
- `backend/src/modules/realtime/room.util.ts`(+spec) — pure `resolveRoomsForEvent()`/`canJoinRoom()` — rooms computed from event payload, gated by `READ incidents` permission; NEVER role-based (design D6, the 25k-user fan-out failure mode).
- `backend/src/modules/realtime/stream-event.util.ts`(+spec) — pure `decodeStreamEntry()`.
- `backend/src/modules/realtime/events.gateway.ts`(+spec) — JWT auth on connect, auto-join `user:{id}`, gated `join` message handler, `broadcast()`.
- `backend/src/modules/realtime/streams.consumer.ts`(+spec) — `RealtimeStreamsConsumer`, XREADGROUP consumer group `realtime` over `incidents:events`, XACKs every entry (including malformed ones, to avoid poison-message loops).
- `backend/src/modules/realtime/redis-io.adapter.ts` — `RedisIoAdapter extends IoAdapter`, wired in `main.ts` via `app.useWebSocketAdapter(...)`.
- `backend/src/modules/realtime/realtime.module.ts`.
- No new migration — Streams/WS are runtime-only.

## Deviations from tasks.md / design (Phase 2)

1. Migration renumbering (see table above) — tasks.md's literal 0003/0004/0006 slots were already taken or needed reordering; see per-file header comments.
2. `AvatarStorageService` does not call a real AWS S3 SDK — `@aws-sdk/client-s3` was not in the explicit T2.5 dependency list, so this batch built a swappable, fully-mockable seam instead (upload key convention `avatars/{userId}/{uuid}-{filename}`, deterministic placeholder signed URL). Flagged as a follow-up: wire a real S3 client behind the same interface.
3. `AuthService` gained an `EventEmitter2` constructor dependency to support R4 session-tracking via passive fan-out (design D7) — not explicitly listed in T2.3's task text, but required to satisfy "GIVEN a user logs in from a new device... THEN system MUST record the new device" without creating an `Auth -> Users` DAG edge.
4. `PermissionAction` extended with `'ASSIGN'` (was `READ`/`CREATE`/`UPDATE`/`DELETE`) — required by T2.4's explicit "requires the ASSIGN permission" acceptance criterion; not called out in the original CC1/R7 spec text but consistent with its resource+action model.
5. Anonymous permission ceiling (`auth.config.ts`) was NOT changed — it still lacks `READ comments`, `DELETE comments`, `ASSIGN assignments`. This matches spec (anonymous can create incidents/comments, cannot delete/assign) but means anonymous also cannot list comments on an incident; flagged as a possible product-decision follow-up, not a bug.

## Issues Found / Not Verifiable From Sandbox

- Live app boot (`NestFactory.create(AppModule)`) was smoke-tested via a one-off script; it progresses through the full DI graph and then blocks on `cache-manager-redis-yet`'s connection retry loop because there is no live Redis in this sandbox (`ECONNREFUSED ::1:6379`). This is the same pre-existing sandbox limitation noted in the Phase 1 apply-progress — not a regression introduced this batch. All 23 Jest suites (144 tests) run with mocked Redis/DB and pass.
- PostGIS/Supabase migration application is still entirely manual and unverified from this sandbox (Phase 1 limitation, unchanged).

## Test Results

```
$ pnpm install
Already up to date

$ pnpm run build
$ nest build
(no errors)

$ pnpm test
Test Suites: 23 passed, 23 total
Tests:       144 passed, 144 total
Snapshots:   0 total
Time:        ~9-13s (varies)
```

## Remaining Tasks

- [ ] Phase 3 (T3.1-T3.10) — Roles+Permissions, Organizations, StatusHistory, Mail, Invitations, IncidentCategories, Locations, Sessions (full), Menus
- [ ] Phase 4 (T4.1-T4.4) — Integration E2E, load testing, security hardening, docs
- [ ] Follow-up: wire a real S3 client behind `AvatarStorageService`
- [ ] Follow-up: `pnpm run lint` still fails (no ESLint config file) — pre-existing T1.1 gap, unchanged this batch
- [ ] Follow-up (optional/product decision): should anonymous hold `READ comments`?

## Git

Branch `brydyan/sc-194/backend-nestjs-modules`, 6 new commits this batch (not pushed):
1. `5f92ecc` — T2.0 Geofencing reconciliation
2. `ee60bc2` — T2.1 Incidents module
3. `0f00f1b` — T2.2 Comments module
4. `239c724` — T2.3 Users module
5. `096f3cb` — T2.4 Assignments module
6. `4dbbae4` — T2.5 WebSocket gateway

## Status (Phase 2)

6/6 Phase-2 tasks complete. Build green, 144/144 tests passing (up from 49 at end of Phase 1). **Ready for `sdd-verify`**, or continue to Phase 3 (`T3.1-T3.10`) apply batch.
