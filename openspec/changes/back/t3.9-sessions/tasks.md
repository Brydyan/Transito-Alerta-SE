# Tasks: T3.9 Sessions — Rotation, Reuse Detection, Revocation

Baseline to preserve: unit 505/505, e2e 104/104. Strict TDD — red test first on every item below.
Run the full suite once before Phase 1 and once after Phase 6 (design §11).

## Phase 0: Pinned Constants

- [x] 0.1 Add `SESSION_REQUIRED`, `SESSION_REVOKED`, `SESSION_REUSE_DETECTED`,
      `SESSION_USER_MISMATCH`, `SESSION_RETRY_UNAVAILABLE` string literals to a new
      `backend/src/modules/sessions/session-errors.ts` (design §6 table); import everywhere below
      instead of re-typing strings.

## Phase 1: Infrastructure

- [x] 1.1a Write `database/migrations/0016_sessions_revocation.sql` (design §5, verbatim SQL):
      8 nullable columns, `expires_at` backfill, 2 partial indexes, permission catalog rows,
      role-matrix `UPDATE roles` append. Includes the `admin_sistema` guard-rail `DO $$` block.
- [x] 1.1b Write `database/rollback/0016_sessions_revocation.DOWN.sql` mirroring 1.1a exactly
      (drop only what 0016 added; never `DROP TABLE user_sessions` / `idx_user_sessions_user`).
- [x] 1.1c Apply 0016 to local dev Postgres twice in a row (idempotence) and confirm existing
      `user_sessions` rows survive with `expires_at = created_at`, `refresh_token_hash IS NULL`.
- [x] 1.1d Register 0016 in `database/MIGRATION_LOG.md` (status: Applied, once run against Supabase).
      Verify `docs/tasks/1-BACKEND-MIGRATIONS.md`'s 0016/0017 renumbering note is already correct
      (it is, as of 2026-08-17) — no edit needed unless it drifts.
- [x] 1.2 Create `backend/src/modules/sessions/sessions.module.ts` — leaf module skeleton
      (`@InjectDataSource`, `SESSION_REDIS_CLIENT` only; no feature-module imports), empty
      providers array for now.
- [x] 1.3 Add `SESSION_REDIS_CLIENT` provider + export to `backend/src/core/core.module.ts`,
      following the existing `REDIS_BLOCKING_CLIENT` factory pattern but with
      `enableOfflineQueue: false, commandTimeout: 50` (design §2) on `cacheConf.streamsUrl`
      (DB 0 — same database as `REDIS_CLIENT`, per design's explicit "not cache-manager's" note).
- [x] 1.4 Update `backend/src/modules/auth/interfaces/jwt-payload.interface.ts`: add `sid?: string`
      with the design's comment on why it's optional-in-type/required-at-runtime.
- [x] 1.5 Add `sessionRefreshGraceSeconds` (env `SESSION_REFRESH_GRACE_SECONDS`, default 30) and
      `sessionRefreshTtlSeconds` to `backend/src/config/auth.config.ts`'s `AuthConfig` interface
      and factory.
- [x] 1.6 Write `parseDurationSeconds(s: string): number` in `backend/src/config/auth.config.ts`
      (or a co-located helper file) — pure function, table-driven unit test (RED then GREEN):
      `'7d'` -> 604800, `'15m'` -> 900, `'30s'` -> 30, invalid input throws. Wire
      `sessionRefreshTtlSeconds = parseDurationSeconds(jwtRefreshExpiresIn)` in the factory.

## Phase 2: Entity & Repository

- [x] 2.1a Add the 8 new columns to `backend/src/entities/user-session.entity.ts` (nullable,
      matching migration types: `char(64)` hashes as `string | null`, `timestamptz` as `Date | null`,
      `varchar` ip/user_agent as `string | null`).
- [x] 2.1b Add `isValid(now: Date): boolean` to `UserSessionEntity`, mirroring
      `ACTIVE_SESSION_SQL` exactly (design §4) — RED unit test table-driving all 3 clauses
      independently before implementing.
- [x] 2.1c Add `isWithinRotationGrace(rotatedAt: Date | null, now: Date, graceSeconds: number): boolean`
      as a pure exported function (co-locate with the entity or in
      `backend/src/modules/sessions/session-validity.ts`) — RED unit test first: null `rotated_at`,
      exact boundary (`now - rotatedAt === grace`), `grace === 0`, negative skew.
- [x] 2.2 Create `backend/src/modules/sessions/session-validity.ts` exporting the single
      `ACTIVE_SESSION_SQL` string constant (design §4) and re-export `isWithinRotationGrace`.
- [x] 2.3a Create `backend/src/modules/sessions/sessions.repository.ts` with `SessionRow` interface
      (12 raw snake_case columns) and `create()`, `findActiveById()`, `findActiveByUser()` —
      raw SQL via `@InjectDataSource` (house convention), each using `ACTIVE_SESSION_SQL` where
      applicable.
- [x] 2.3b Add `rotate()` to `SessionsRepository` — the exact CAS statement from design §1,
      verbatim. Returns `SessionRow | null` (null = lost the CAS, 0 rows).
- [x] 2.3c Add `revoke()` (sets `revoked_at`, `RETURNING expires_at`), `existsRevoked()`
      (returns `boolean`, never a row), `findRevokedUnexpired()` (boot-warm query using
      `idx_user_sessions_revoked`) to `SessionsRepository`.
- [x] 2.3d Add `findManageableTarget(userId): Promise<ManageableTarget | null>` to
      `SessionsRepository` — raw `users LEFT JOIN roles` (precedent: `RoomAuthorizer`), used only
      by the D9 authorization check, keeping `SessionsModule` a leaf.
- [x] 2.4 Create `backend/src/modules/sessions/dto/session-response.dto.ts`:
      `{id, device_uuid, ip_address, user_agent, created_at, last_refresh_at, expires_at, current}`
      — never a hash field.

## Phase 3: Redis (Denylist + Grace Buffer)

- [x] 3.1a Create `backend/src/modules/sessions/revocation-cache.ts` (`RevocationCache` class):
      `isRevoked(sid)` (GET `sess:revoked:{sid}`, catch-all returns `false` on any Redis error),
      `revoke(sid, ttlSeconds)` (SETEX). Injects `SESSION_REDIS_CLIENT`.
- [x] 3.1b Unit test `RevocationCache`: key shape, TTL arithmetic, and the fail-open contract
      (mocked ioredis client that rejects -> `isRevoked` resolves `false`, never throws).
- [x] 3.2a Create `backend/src/modules/sessions/grace-buffer.ts` (`GraceBuffer` class):
      `set(sid, retiringTokenHash, pair, ttlSeconds)` (SETEX JSON), `get(sid, presentedTokenHash)`
      (GET + JSON.parse or null), `clear(sid, oldPreviousTokenHash)` (DEL) — key shape
      `sess:grace:{sid}:{sha256(token)}` per design §2.
- [x] 3.2b Unit test `GraceBuffer`: set/get round-trip, miss returns null, `grace === 0` means
      callers must skip the write entirely (test this contract at the call site in Phase 4, not
      here — this test only covers the class's own get/set/clear mechanics).
- [x] 3.3 Implement `OnApplicationBootstrap` boot-warm hook in `SessionsModule` (or a dedicated
      `sessions-boot-warm.service.ts`, precedent `role-rank.audit.ts`): calls
      `findRevokedUnexpired()`, pipelines `SET sess:revoked:{id} 1 EX {ttl}` for each row via
      ioredis pipeline; failure logs `error` and does not rethrow/abort boot (D1b).

## Phase 4: Core Auth Flow

- [x] 4.1 Create `backend/src/common/crypto/session-hash.ts`: `sha256Hex(token: string): string`
      and `timingSafeEqualHex(a: string | null, b: string | null): boolean` (length-mismatch-safe,
      never throws). RED unit tests first, no mocks.
- [x] 4.2 Add `sessionId: string | null` and `isAnonymous: boolean` (both required, non-optional)
      to `AuthContext` in `backend/src/common/authz/subject-scope.ts`.
- [x] 4.3 Bump `PERMISSION_CACHE_PREFIX` from `'perm:v2:'` to `'perm:v3:'` in
      `backend/src/modules/auth/auth.service.ts` (design §3 [R4]); update `CachedAuthContext` to
      include `isAnonymous`; update `getAuthContextByUserId` to compute and cache `isAnonymous`
      and populate `sessionId` (looked up via `SessionsRepository.findActiveById` scoped by user —
      see 4.6 for where `sessionId` is actually threaded through, since it comes from the JWT
      payload's `sid`, not from a DB lookup keyed by userId alone; this task is cache-shape only).
- [x] 4.4 Promote `isVisibleUnderScope` to an exported `assertVisible(actor, target): void` (throws
      `NotFoundException`) in `backend/src/common/authz/assert-can-manage.ts`; refactor
      `assertCanManage` to call it. Zero behavior change — add a regression unit test asserting
      existing `assertCanManage` test suite still passes unmodified.
- [x] 4.5 Rewrite `AuthService.login()` in `backend/src/modules/auth/auth.service.ts`:
      generate `sid = randomUUID()` before signing, sign access+refresh with `sid` (skip for
      anonymous device_uuid — D8), hash the refresh token, call
      `SessionsRepository.create()` synchronously (throws = login fails, D2). Remove
      `eventEmitter.emit('auth.login', ...)` and the `EventEmitter2` constructor injection.
      RED: rewrite `auth.service.spec.ts` `login` describe block first for the new session-row
      + sid-in-both-tokens behavior, then implement.
- [x] 4.6 Rewrite `AuthService.refresh()` — full branch matrix from design (verify sig -> require
      `typ==='refresh'` + `sid` present -> `findActiveById` -> `user_id===sub` check
      (`SESSION_USER_MISMATCH`, reject-don't-revoke, R6) -> `timingSafeEqualHex` vs current ->
      on hit: `rotate()` CAS, buffer new pair, return new `AuthTokens` -> on miss: check
      `previous_refresh_token_hash` + `isWithinRotationGrace`; if both true, read `GraceBuffer`;
      hit -> return buffered pair verbatim (no DB write); miss -> `401 SESSION_RETRY_UNAVAILABLE`
      (reject, don't revoke, R3); else -> `revoke()` + `RevocationCache.revoke()` +
      `401 SESSION_REUSE_DETECTED`. Signature changes to `Promise<AuthTokens>`.
      RED: this is the largest task — write the full branch-matrix unit test file section first
      (see 6.3), then implement branch by branch.
- [x] 4.7 Add `revokeSession(sessionId): Promise<void>` to `AuthService` (or `SessionsService`,
      see 4.9) for logout/explicit revoke: `SessionsRepository.revoke()` +
      `RevocationCache.revoke(id, ttl-from-RETURNING-expires_at)`.
- [x] 4.8 Update `backend/src/modules/auth/jwt.strategy.ts` `validate()`: after
      `getAuthContextByUserId`, if `!isAnonymous`: require `payload.sid` present (else
      `401 SESSION_REQUIRED`), then `RevocationCache.isRevoked(sid)` (else `401 SESSION_REVOKED`);
      attach `sessionId`/`isAnonymous` onto the returned `AuthContext`. Anonymous skips both checks
      entirely (D8).
- [x] 4.9 Create `backend/src/modules/sessions/sessions.service.ts` (`SessionsService`):
      `validateSession()` wrapper if needed by controller, plus the D9 authorization methods
      `listForSelf(userId)`, `listForTarget(actor, targetUserId)` (calls `assertVisible`/
      `assertCanManage` as appropriate), `revokeForActor(actor, sessionId)` (self bypass — see D9
      spec: self is always allowed regardless of permissions/rank).
- [x] 4.10 Wire `SessionsModule` providers: `SessionsRepository`, `SessionsService`,
      `RevocationCache`, `GraceBuffer`, boot-warm service. Export `SessionsRepository` and
      `RevocationCache` (not `SessionsService` — design §8, `AuthModule` depends only on the repo).
- [x] 4.11 Update `backend/src/modules/auth/auth.module.ts`: `imports: [SessionsModule]`; remove
      any now-unused `EventEmitterModule`-related wiring specific to this module (EventEmitter2
      remains globally available via CoreModule, only the injection into `AuthService` is removed).
- [x] 4.12 Update `backend/src/modules/auth/auth.controller.ts`: `refresh()` return type becomes
      `AuthTokens`; pass `ip`/`user_agent` (from `@Req()`) through to `authService.refresh`;
      implement real `logout()` (extract `sid` from `req.user`, call `revokeSession`) replacing the
      no-op.
- [x] 4.13 Update `backend/src/modules/realtime/events.gateway.ts` `handleConnection`: apply the
      same `isAnonymous` / `sid` / `RevocationCache.isRevoked` check used in `JwtStrategy.validate`
      so a revoked session cannot hold an open socket (design §3).

## Phase 5: Users Module — Remove Fan-out, Add Listing

- [x] 5.1 Remove `UsersService.recordSession`, `handleAuthLogin` (`@OnEvent('auth.login')`), the
      `UserSessionEntity` repository injection, from `backend/src/modules/users/users.service.ts`.
- [x] 5.2 Remove `UserSessionEntity` from `TypeOrmModule.forFeature([...])` in
      `backend/src/modules/users/users.module.ts`; add `SessionsModule` to `imports` (for
      `SessionsRepository` injection into `UsersService`, per design §8's "one new export, no new
      axis").
- [x] 5.3 Add `getSessionsForSelf`/`getSessionsForUser` thin delegation to `SessionsService` in
      `UsersService` (or call `SessionsService` directly from a new controller route — pick
      whichever keeps `UsersService` from depending on `SessionsService` if that creates a cycle;
      per design, prefer injecting `SessionsRepository`/`SessionsService` since `Users -> Sessions`
      is not a cycle-creating edge).
- [x] 5.4 Add `GET /users/me/sessions` and `GET /users/:id/sessions` to
      `backend/src/modules/users/users.controller.ts` with `@RequirePermission('READ', 'sessions')`
      on the `:id` route (self route needs no permission decorator — D9 self-bypass).

## Phase 6: Sessions Controller

- [x] 6.1 Create `backend/src/modules/sessions/sessions.controller.ts`:
      `DELETE /sessions/:id` (self bypass OR `@RequirePermission('DELETE', 'sessions')` +
      `assertCanManage` for cross-user) returning `204`/`{success:true}` per existing convention.
      Confirm during implementation whether a bulk `DELETE /sessions/:id/all` route belongs here —
      **out of scope per spec** ("Bulk DELETE /api/users/:id/sessions (revoke-all-for-user)" is
      explicitly excluded); do not build it.
- [x] 6.2 Register `SessionsController` in `SessionsModule`.
- [x] 6.3 Register `SessionsModule` in `backend/src/app.module.ts`.

## Phase 7: Testing

- [x] 7.0 Run full existing suite (`npm test`, `npm run test:e2e` from `backend/`) and record the
      exact baseline (505/505 unit, 104/104 e2e) before writing any new test — design §11 mandate.
- [x] 7.1 Delete 3 obsolete unit tests (see list below) together with the fan-out code they exercise
      (D2) — deletion, not editing.
- [x] 7.2 Rewrite `auth.service.spec.ts` `login` describe block: assert `sid` present and identical
      across access+refresh tokens, `SessionsRepository.create` called once, anonymous login skips
      session creation and mints no `sid`.
- [x] 7.3 Rewrite `auth.service.spec.ts` `refresh` describe block as the full branch matrix (design
      §10): no `sid` -> `SESSION_REQUIRED`; wrong `typ`; session null -> `SESSION_REVOKED`;
      `user_id` mismatch -> `SESSION_USER_MISMATCH` (assert NOT revoked); current-hash hit -> CAS
      called, new pair returned; CAS returns null (lost race) -> grace path; grace path in-window ->
      buffer hit returns verbatim pair, zero DB writes asserted; grace out-of-window or buffer miss
      -> `401`, revoke + denylist write asserted; two-generations-old hash -> revoke even if
      timestamp is in-window. Mock `SessionsRepository` + `RevocationCache` + `GraceBuffer`; `now`
      injected, never real timers.
- [x] 7.4 Unit tests for `UserSessionEntity.isValid` and `isWithinRotationGrace` (if not already
      done as RED in 2.1b/2.1c — this task closes out any remaining table-driven cases).
- [x] 7.5 Unit tests for `sha256Hex`/`timingSafeEqualHex`/`parseDurationSeconds` (if not already
      closed out in 1.6/4.1).
- [x] 7.6 Unit tests for `SessionsService` D9 matrix: self always allowed (zero permissions),
      cross-user invisible -> 404, visible-not-outranked (including equal rank) -> 403
      `INSUFFICIENT_ROLE_RANK`. Mock `SessionsRepository`, use real `assertCanManage`.
- [x] 7.7 Integration test (Testcontainers, real Postgres) for the CAS itself: fire two concurrent
      `rotate()` calls against one session — assert exactly one returns a row;
      `findActiveByUser` excludes revoked/expired/legacy rows; apply migration 0016 twice
      (idempotence) and assert the legacy-row backfill.
- [x] 7.8 Add `test-environment.ts` helpers: expose `sid` from the login helper's response, a
      `revokeSession(id)` helper, and a `backdateRotation(sessionId, secondsAgo)` helper
      (`UPDATE user_sessions SET rotated_at = now() - interval '$1 seconds'` + `DEL sess:grace:*`
      for that sid) — no `setTimeout` anywhere (design §10).
- [x] 7.9 Create `backend/test/e2e/sessions.e2e-spec.ts` covering: login on device A/B then revoke
      A -> A's access+refresh 401 next request, B unaffected; refresh rotates and old token 401s
      outside grace; in-window grace replay returns identical pair; out-of-window replay revokes;
      two-generations-old token revokes inside window; `sid`-less (pre-0016) token ->
      `401 SESSION_REQUIRED`; anonymous login creates no session row and no `sid`; cross-user
      revoke: invisible target -> 404, visible-not-outranked -> 403 `INSUFFICIENT_ROLE_RANK`;
      concurrent double-refresh via `Promise.all` -> byte-identical responses, one `rotated_at`
      advance, zero revocations.
- [x] 7.10 Add `SESSION_REFRESH_GRACE_SECONDS=0` config-override e2e case (separate app instance,
      not env mutation mid-suite): any replay of a non-current hash revokes, reproducing
      unmitigated reuse detection exactly.
- [x] 7.11 Run full suite again; confirm final counts match design §11 expectations (505 - 3 = 502
      pre-existing unit tests carried forward, unmodified, plus all new tests from 7.2-7.10; e2e
      104 baseline plus the new `sessions.e2e-spec.ts` suite).

## Phase 8: Cleanup / Verification Aids

- [x] 8.1 Run `grep -rn "user_sessions" backend/src` and confirm the only matches are
      `sessions/sessions.repository.ts` and `entities/user-session.entity.ts` (design §4
      verify-phase obligation).
- [x] 8.2 Confirm no `forwardRef` was introduced on any `Sessions`-adjacent edge; if one appears,
      resolve by injecting `SessionsRepository` instead (design §8).
