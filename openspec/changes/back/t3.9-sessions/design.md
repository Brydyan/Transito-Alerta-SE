# Design: T3.9 Sessions — Rotation, Reuse Detection, Revocation

Source: `proposal.md` (D1-D13), `specs/session-lifecycle/spec.md`. Artifact store: hybrid.
Proposal decisions are settled and are **not** reopened here. Six points the proposal left
underspecified are resolved below and marked **[R1]**-**[R6]**.

## Architecture Overview

```
POST /auth/login {device_uuid}
  │  anonymous? ──yes──► sign access+refresh WITHOUT sid ─────────────► tokens (no session row)
  │  no
  ├─ sid = randomUUID()
  ├─ sign access{sub,typ,jti,pv,sid} + refresh{...,sid}          [sid known BEFORE signing]
  ├─ hash = sha256hex(refreshToken)                              (D5)
  └─ SessionsRepository.create({id: sid, hash, ip, ua, expires_at})   ← synchronous, throws = login fails (D2)

POST /auth/refresh {refresh_token}
  verify sig → typ==='refresh' → sid present → findActiveById(sid) → user_id===sub
       │
       ├─ hash === current ──► rotate() CAS ──1 row──► new pair + buffer old→new (grace)
       │                            └────0 rows──► re-read ──┐
       └─ hash !== current ─────────────────────────────────►┤
                                                              ├─ prev match AND in window ─► GRACE: replay buffered pair
                                                              └─ else ────────────────────► revoke + denylist + 401

Every authenticated request
  JwtStrategy.validate(payload)
     └─► AuthService.getAuthContextByUserId(sub)      [Redis perm:v3:uid: — unchanged cost]
            │ isAnonymous ──yes──► skip session check entirely (D8)
            │ no
            ├─ payload.sid missing ──► 401 SESSION_REQUIRED            (D7)
            └─ RevocationCache.isRevoked(sid) ──► 401 SESSION_REVOKED  (D1/D6, one Redis GET)
     req.user: AuthContext { …, sessionId, isAnonymous }
```

The DB row is the **authority** on session state; Redis holds two derived, self-expiring
projections (denylist, grace buffer). Neither projection can extend a session's life beyond what
the row says — both are ANDed with a DB read on any path that mints a token.

## 1. The rotation statement (design-phase pin)

`SessionsRepository.rotate()` — **one** statement. Verbatim:

```sql
UPDATE user_sessions
   SET previous_refresh_token_hash = refresh_token_hash,
       refresh_token_hash          = $2,
       rotated_at                  = now(),
       last_used_at                = now(),
       expires_at                  = now() + make_interval(secs => $3::int),
       ip_address                  = $4,
       user_agent                  = $5
 WHERE id                 = $1
   AND refresh_token_hash = $6
   AND revoked_at IS NULL
   AND expires_at > now()
RETURNING id, user_id, device_uuid, refresh_token_hash, previous_refresh_token_hash,
          rotated_at, last_used_at, expires_at, revoked_at, ip_address, user_agent, created_at;
```

**Index it relies on**: `user_sessions_pkey` (the 0006 primary key on `id`) — and nothing else.
The three extra `WHERE` terms are residual filters evaluated on the single row the PK already
located. Neither new index in 0016 serves rotation; they serve the listing and the boot warm.
Stated explicitly so verify does not look for a rotation index that should not exist.

**Why the compare must be inside the UPDATE.** `AND refresh_token_hash = $6` is not the security
comparison — that is `timingSafeEqual` in Node on the row from `findActiveById` **[R1]**. This
predicate is a **compare-and-swap**. Its job is that the current→previous shift and the test of
what "current" was happen under the same row lock.

Read-then-write cannot substitute:

- `SELECT` then unconditional `UPDATE`: two concurrent refreshes both read hash `H`, both decide
  "rotate", both write. Last writer wins, so the row ends at `prev = A, cur = B` while request 1's
  client was handed `A`. Two live chains were minted from one token, and the loser's client is one
  rotation ahead of the bookkeeping.
- Shifting in two statements (`UPDATE … SET previous = refresh_token_hash` then
  `UPDATE … SET refresh_token_hash = $new`): between them the row's `previous` is momentarily the
  generation *before* the one being retired. A concurrent retry landing in that instant matches
  neither current nor previous and is **misread as theft** — the mitigation becomes the outage.

With the CAS, the loser's `UPDATE` blocks on the winner's row lock, then re-evaluates the predicate
against the winner's committed tuple (Postgres READ COMMITTED / EvalPlanQual), matches nothing, and
returns **0 rows**. Zero rows therefore *guarantees* the winner has committed, so the loser's
re-read sees `prev = H` and lands deterministically on the **grace** path. **Do not wrap `refresh()`
in a REPEATABLE READ or SERIALIZABLE transaction** — under those levels the same statement raises a
serialization failure instead of returning 0 rows, and the grace path becomes a 500.

## 2. Redis denylist (D1) and grace buffer [R2]

| | denylist | grace buffer |
|---|---|---|
| key | `sess:revoked:{sid}` | `sess:grace:{sid}:{sha256(previousToken)}` |
| value | `'1'` | JSON `{access_token, refresh_token}` |
| TTL | `ceil(expires_at − now)` seconds, from the revoked row's own `RETURNING expires_at` | `sessionRefreshGraceSeconds` (30) |
| written | on revoke (logout, reuse detection, admin delete) | on a **successful CAS**, together with `DEL` of the predecessor's key |
| read | `JwtStrategy.validate`, per request | grace path of `refresh()` only |

Both live on a new `SESSION_REDIS_CLIENT` (see §4), i.e. **DB 0 alongside Streams — not the
cache-manager database**. `core.module.ts:104-107` already states the reason verbatim: the
cache-manager store is isolated "so a cache flush can never wipe Streams or session state".

**Boot warm** (`OnApplicationBootstrap`, precedent `common/authz/role-rank.audit.ts`):
`SELECT id, expires_at FROM user_sessions WHERE revoked_at IS NOT NULL AND expires_at > now()`
(uses `idx_user_sessions_revoked`) → one ioredis pipeline of `SET key 1 EX ttl`. Failure logs an
error and does **not** abort boot (D1b is fail-open; refusing to start is fail-closed by another
name).

**Cache miss** = valid. Absence is the normal state; the set only ever holds revoked, unexpired
sessions.

**Redis unreachable**: `isRevoked()` catches and returns `false`. The client is configured
`enableOfflineQueue: false` and `commandTimeout: 50` so a disconnected or hung Redis **rejects
immediately** instead of queueing — without this, an outage would hang every authenticated request
until reconnect rather than failing open. Grace-buffer miss is **not** fail-open: it returns 401
`SESSION_RETRY_UNAVAILABLE` and revokes nothing **[R3]**.

**The security property, plainly.** If Redis loses the denylist while the process keeps running, a
session revoked before the loss is honoured again for its already-issued access token, for at most
`JWT_ACCESS_EXPIRES_IN` (**15 minutes**) — and it can never be renewed, because `refresh()` reads
Postgres unconditionally and the row still says `revoked_at IS NOT NULL`. A process restart closes
the window immediately via boot warm. We accept a bounded 15-minute authorization staleness rather
than convert a cache outage into a total auth outage.

## 3. Where the per-request check lives

**`JwtStrategy.validate`.** Not a guard, not middleware.

- Middleware runs before Passport, so it would have to verify the JWT a **third** time. The cost of
  that is already visible in `common/guards/rate-limiter.guard.ts:47-50`, which injects `JwtService`
  purely because guards run before `req.user` exists.
- A global guard runs after `validate`, so it would still need `sessionId` plumbed onto
  `AuthContext` — the same change — plus a `@Public()`-style opt-out for unauthenticated routes.
- `validate` is the single funnel for every Bearer-authenticated HTTP request and already holds the
  decoded payload.

**Ordering against the `perm:v2:` path.** `getAuthContextByUserId` runs **first**, because
`isAnonymous` is derived server-side from `device_uuid` (D8) and is only known after that call.
Only then: require `sid`, then the denylist GET. WebSocket handshakes go through
`EventsGateway.handleConnection` → same `getAuthContextByUserId`; the identical two-line check is
applied there so a revoked session cannot hold an open socket.

**Added latency**: exactly **one Redis `GET`** on the authenticated path (~0.2–0.5 ms), **zero**
Postgres round-trips, **zero** for anonymous identities. The rejected alternative (unconditional DB
read) costs one Supabase pooler round-trip per request.

**Cache-shape change [R4].** `AuthContext` gains `isAnonymous`, which is **not** derivable from the
cached `{permissions, organizationId, roleName}` triple (a real user may legitimately have both
null). It must be added to the cached value — which is precisely the situation T3.2 D6 warned
about: on a warm Redis, `cached.isAnonymous === undefined` reads falsy, so every anonymous device
would be required to present a `sid` and 401 for a full 3600 s TTL. Remedy is T3.2's own:
**`PERMISSION_CACHE_PREFIX` becomes `perm:v3:`**; `perm:v2:` keys are abandoned, not migrated.

## 4. `SessionsRepository` and the D11 predicate

The predicate exists **once**, as an exported string interpolated into every SQL site:

```ts
// sessions/session-validity.ts
export const ACTIVE_SESSION_SQL =
  `revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL`;
```

mirrored — not re-derived — by `UserSessionEntity.isValid(now: Date): boolean`.

```ts
export interface SessionRow { /* the 12 columns, snake_case, raw */ }

class SessionsRepository {                       // @InjectDataSource, raw SQL (house convention)
  create(i: { id; userId; deviceUuid; refreshTokenHash; ipAddress; userAgent; ttlSeconds }): Promise<SessionRow>;
  findActiveById(id: string): Promise<SessionRow | null>;              // ACTIVE_SESSION_SQL
  findActiveByUser(userId: string): Promise<SessionRow[]>;             // ACTIVE_SESSION_SQL + created_at DESC
  rotate(i: { id; newHash; expectedHash; ttlSeconds; ipAddress; userAgent }): Promise<SessionRow | null>; // null = lost the CAS
  revoke(id: string): Promise<SessionRow | null>;                      // sets revoked_at, RETURNING expires_at for the TTL
  existsRevoked(id: string): Promise<boolean>;                         // logging only — returns a boolean, never a row
  findRevokedUnexpired(): Promise<{ id: string; expires_at: Date }[]>; // boot warm
  findManageableTarget(userId: string): Promise<ManageableTarget | null>; // users LEFT JOIN roles
}
```

There is **no unfiltered finder**. `findActiveById`/`findActiveByUser` are the only methods that
return a `SessionRow` for a live session, and both carry the full predicate. `existsRevoked` returns
a `boolean` so it cannot be mistaken for a usable session.

**Verify-phase obligation**: `grep -rn "user_sessions" backend/src` must match only
`sessions/sessions.repository.ts` and `entities/user-session.entity.ts` (`@Entity('user_sessions')`).
After D2 removes `UsersService.recordSession`, any other hit is a design violation.

**`findManageableTarget` is why `SessionsModule` stays a leaf** — it issues its own indexed join
against `users`/`roles` rather than injecting `UsersService`. Direct precedent: `RoomAuthorizer`
(T3.2 design, `realtime/room-authorizer.service.ts`).

## 5. Migration 0016 — full SQL

Collision check: **0014** touches `status_history` + `permissions('status-history','READ')`;
**0015** touches `organizations`, `incidents`, `permissions`, `roles`. Both applied to Supabase and
local dev on 2026-08-17. 0016's only shared objects are `permissions` (disjoint `resource` value,
`ON CONFLICT DO NOTHING`) and `roles` (0015 **inserts** the four rows, 0016 **updates** two of
them). Index names `idx_user_sessions_active` / `idx_user_sessions_revoked` do not collide with
0006's `idx_user_sessions_user`. 0016 **requires** 0015 — hence the loud assertion.

```sql
-- 0016_sessions_revocation.sql
-- Transito Alerta SE — session revocation, rotation, reuse detection (T3.9)
-- MANUAL EXECUTION ONLY. Requires 0006 (user_sessions), 0009 (permissions
-- catalog) and 0015 (the four staff roles). Additive ALTER — the table has
-- existed since 0006 (proposal "Deviations": no second sessions table).
-- Rollback: database/rollback/0016_sessions_revocation.DOWN.sql

BEGIN;

-- 0. Abort loudly rather than silently no-op the role append (T3.2 precedent).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin_sistema') THEN
    RAISE EXCEPTION '0016 requires 0015 (staff roles) to have been applied first';
  END IF;
END $$;

-- 1. Eight additive columns. All NULLABLE (D12): no NOT NULL is achievable
--    without either deleting legacy rows or inventing a synthetic hash.
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash          char(64),    -- sha256 hex (D5); NULL = legacy (D12)
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash char(64),    -- D4 grace window
  ADD COLUMN IF NOT EXISTS rotated_at                  timestamptz, -- D4b: written ONLY on a real rotation
  ADD COLUMN IF NOT EXISTS ip_address                  varchar(45), -- D13: varchar, never inet
  ADD COLUMN IF NOT EXISTS user_agent                  varchar(512),
  ADD COLUMN IF NOT EXISTS revoked_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at                timestamptz, -- "last refresh", not activity
  ADD COLUMN IF NOT EXISTS expires_at                  timestamptz;

-- 2. D12: legacy rows fail the D11 predicate on expiry as well as on the NULL
--    hash, so they are dead on two independent clauses. Idempotent.
UPDATE user_sessions SET expires_at = created_at WHERE expires_at IS NULL;

-- 3. Listing (findActiveByUser). now() is STABLE, not IMMUTABLE, so the other
--    two D11 clauses CANNOT be part of a partial index predicate — they are
--    residual filters on a small per-user set. Deliberate, not an omission.
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions (user_id, created_at DESC) WHERE revoked_at IS NULL;

-- 4. D1 boot-warm query.
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked
  ON user_sessions (revoked_at) WHERE revoked_at IS NOT NULL;

-- 5. Permission catalog.
INSERT INTO permissions (resource, action) VALUES
  ('sessions', 'READ'), ('sessions', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- 6. Role-matrix append. roles.permissions is a jsonb string array (0015);
--    the @> guard makes the append idempotent. operador_sistema and
--    operador_organizacion get nothing (session listings are staff PII);
--    reporter needs nothing (own sessions are always permitted, D9).
UPDATE roles
   SET permissions = permissions || '["READ sessions", "DELETE sessions"]'::jsonb
 WHERE name IN ('admin_sistema', 'admin_organizacion')
   AND NOT permissions @> '["READ sessions"]'::jsonb;

COMMIT;
```

```sql
-- database/rollback/0016_sessions_revocation.DOWN.sql
-- Drops ONLY what 0016 added. It must NEVER DROP TABLE user_sessions (0006)
-- nor DROP INDEX idx_user_sessions_user (0006).
-- The expires_at backfill is not separately reversible: the column goes away.

BEGIN;

UPDATE roles
   SET permissions = permissions - 'READ sessions' - 'DELETE sessions'
 WHERE name IN ('admin_sistema', 'admin_organizacion');

DELETE FROM permissions WHERE resource = 'sessions';

DROP INDEX IF EXISTS idx_user_sessions_revoked;
DROP INDEX IF EXISTS idx_user_sessions_active;

ALTER TABLE user_sessions
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS last_used_at,
  DROP COLUMN IF EXISTS revoked_at,
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS rotated_at,
  DROP COLUMN IF EXISTS previous_refresh_token_hash,
  DROP COLUMN IF EXISTS refresh_token_hash;

COMMIT;
```

Also required (proposal Dependencies): move T3.6 `invitations` to **0017** in
`docs/tasks/1-BACKEND-MIGRATIONS.md:243-244` and register 0016 in `database/MIGRATION_LOG.md`.

## 6. Token, claim and config changes

```ts
export interface JwtPayload {
  sub: string; typ: 'access' | 'refresh'; jti: string; pv: number;
  sid?: string;   // OPTIONAL in the type, REQUIRED at runtime for non-anonymous identities
}
```

`sid` is optional in the type because anonymous tokens carry none (D8); making it required would
force `sid: ''` at the anonymous mint site — a lie the compiler would then stop questioning.
Enforcement is runtime, at exactly two places: `JwtStrategy.validate` and `AuthService.refresh`.

```ts
export interface AuthContext {          // common/authz/subject-scope.ts
  userId; permissions; organizationId; roleName; scope;
  sessionId: string | null;             // NEW — required field, not optional
  isAnonymous: boolean;                 // NEW — required field, not optional
}

refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokens>;   // was Promise<{access_token: string}>
```

Both new `AuthContext` fields are **required**, so every construction site fails `tsc` rather than
silently defaulting — the T3.2 "enforcement is a parameter" rule.

`auth.config.ts` gains `sessionRefreshGraceSeconds` (env `SESSION_REFRESH_GRACE_SECONDS`, default
30) and `sessionRefreshTtlSeconds` **[R5]** — the rotation statement and `create` need the refresh
lifetime as an **integer**, but `jwtRefreshExpiresIn` is the string `'7d'`. A pure
`parseDurationSeconds(s: string): number` helper derives it (unit-tested, table-driven); no new
dependency.

Error codes, all HTTP 401 with a `{ code, message }` body (precedent: `assertCanGrantRole`):

| code | when |
|---|---|
| `SESSION_REQUIRED` | non-anonymous token with no `sid` — the D7 legacy-token branch the client branches on |
| `SESSION_REVOKED` | denylist hit, or `findActiveById` returned null on refresh |
| `SESSION_REUSE_DETECTED` | D4b revoke path — session killed |
| `SESSION_USER_MISMATCH` | `session.user_id !== payload.sub` — **rejects, does NOT revoke [R6]** |
| `SESSION_RETRY_UNAVAILABLE` | DB says grace, buffer missing — rejects, does **not** revoke |

**[R6]**: D3 pins the `user_id === sub` assertion but not its consequence. It must **not** revoke:
`sid` is readable by anyone who can read a JWT payload (the proposal's own risk table says so), so
revoke-on-mismatch would hand anyone who observes another user's token a session-kill primitive.
Reject and log at `error`; the condition is otherwise unreachable without signing-key compromise.

**Breaks caused by the response-shape change**: `auth.controller.ts:39` return type;
`auth.service.spec.ts` `refresh()` tests (contract change, D3); `test/support/test-environment.ts`
if it wraps refresh. `health.e2e-spec.ts:37` only asserts *login* returns a `refresh_token` and is
unaffected. `RefreshDto` is unchanged.

## 7. The grace path [R3] — the proposal's one real gap

D4 says a grace hit "replays the **current** token pair". **That is not implementable as written**:
D5 stores a SHA-256 of the current refresh token, and SHA-256 is one-way — the current pair cannot
be reconstructed from the row. Every alternative that mints something new breaks one of the
success criteria (minting-and-shifting orphans a concurrent winner's token; minting-without-
shifting revokes on a second retry). Resolution:

> On a successful CAS, buffer the **newly issued pair** in Redis under the **retiring** token's
> hash for `sessionRefreshGraceSeconds`, and `DEL` the predecessor's buffer key in the same
> pipeline. A grace hit reads that buffer and returns the current pair **verbatim**, writing
> nothing to Postgres.

This makes every pinned criterion literally true: the current pair is returned; nothing rotates;
`rotated_at` is untouched; repeated retries with the same token are **idempotent** (same key, same
answer); the concurrent loser receives byte-identical tokens to the winner; exactly **one**
generation is replayable (the `DEL`); the window cannot be held open (fixed TTL from the rotation,
never renewed); and `SESSION_REFRESH_GRACE_SECONDS=0` skips the buffer write entirely, so every
replay misses and revokes — unmitigated D4 exactly.

The DB `previous_refresh_token_hash` + `rotated_at` columns remain the **authority**: the grace
branch requires `timingSafeEqual(presented, previous)` **AND**
`isWithinRotationGrace(rotated_at, now, grace)` **AND** a buffer hit. A Redis key surviving past its
TTL therefore still cannot extend the window past `rotated_at + grace`.

Accepted cost: plaintext refresh tokens sit in Redis (DB 0, same trust boundary as the denylist) for
≤30 s, deleted on the next rotation, and not at all when the window is 0.

## 8. Module boundaries (D2)

```
SessionsModule  ── leaf: DataSource + SESSION_REDIS_CLIENT only, imports no feature module
      ▲   ▲
      │   └──────── UsersModule ──► AuthModule   (edge already exists, T3.2 D12)
      └── AuthModule
```

`AuthModule` gains `imports: [SessionsModule]` and depends on `SessionsRepository` +
`RevocationCache` — **not** on `UsersModule`. It never could: `UsersModule` already imports
`AuthModule` (`users.module.ts:19`), so an `Auth → Users` edge is a hard cycle. The three things
that would otherwise force one, and how each is avoided:

| need | resolution | precedent |
|---|---|---|
| write the session row inside `login()` | `SessionsRepository` — a leaf with no service dependencies | proposal D2 |
| `assertCanManage` / rank / scope | pure functions in `common/authz/` — not a module | T3.2 |
| target user's `{id, organizationId, roleName}` | `SessionsRepository.findManageableTarget` (raw join) | `RoomAuthorizer` |
| `SessionsController` guards | `JwtAuthGuard` (passport, globally registered) + `PermissionGuard` (injects only `Reflector`) | `OrganizationsModule` imports nothing |

`SessionsModule` out-degree into feature modules is **zero**. No cycle exists, and therefore no
`forwardRef` — if one ever appears on the `Users → Sessions` edge, resolve it by injecting
`SessionsRepository` instead of `SessionsService`, never `forwardRef`.

**Deleted by D2**: `auth.service.ts:82` (`eventEmitter.emit('auth.login', …)`), the now-unused
`EventEmitter2` constructor injection in `AuthService`, `UsersService.handleAuthLogin`,
`UsersService.recordSession`, the `UserSessionEntity` injection in `UsersService`, and
`UserSessionEntity` from `UsersModule`'s `forFeature`.

**Authorization wiring (D9)**, reusing T3.2's axes with **one new export, no new axis**: `GET
/users/:id/sessions` is a read, and D9 rank-gates writes only — so it needs visibility without rank.
`assert-can-manage.ts`'s private `isVisibleUnderScope` is promoted to an exported
`assertVisible(actor, target): void` that throws 404, and `assertCanManage` is refactored to call
it. Zero behaviour change; the `actor.roleName === null` D2 short-circuit is preserved in both
(harmless here: 0016 grants `READ sessions` only through the two seeded admin roles).

## 9. Sequence walkthroughs

**Normal refresh.** verify → `typ`/`sid` ok → `findActiveById` → `user_id === sub` →
`timingSafeEqual(presented, current)` ✓ → mint pair → CAS **1 row** → pipeline
`DEL sess:grace:{sid}:{oldPrev}` + `SETEX sess:grace:{sid}:{presented} 30 {pair}` → 200 with the new
pair. `expires_at` slides forward; `last_used_at` and `rotated_at` = `now()`.

**In-window grace hit.** Client refreshed, lost the response to a timeout, retries with the token it
still holds. `timingSafeEqual` vs current ✗ → vs `previous` ✓ → `isWithinRotationGrace` ✓ → buffer
hit → 200 with the **same** pair the lost response carried. **No SQL write at all**: `rotated_at`
unchanged, so the window still closes 30 s after the real rotation. Retrying again 5 s later hits
the identical key and gets the identical answer.

**Reuse outside the window.** Same replay at `rotated_at + 31 s`: previous matches but
`isWithinRotationGrace` ✗ (and the buffer has expired) → `revoke(sid)` → `SET sess:revoked:{sid}` →
`log.warn('SESSION_REUSE_DETECTED', {sid, ip})` → 401. The **newest** token issued for that session
now 401s too — the whole chain dies, per D4b.

**Revoke → next request rejected.** `DELETE /api/sessions/{A}` (or `POST /auth/logout`) → D9 check →
`revoke` → denylist `SET` with TTL = remaining refresh lifetime. Device A's *access* token is
already minted and still signature-valid; on its very next request `JwtStrategy.validate` resolves
the context, sees `isAnonymous === false`, GETs `sess:revoked:{A}`, hits, and throws 401
`SESSION_REVOKED` — **no TTL wait** (D6). Device B is untouched: different `sid`, no key.

**Concurrent double refresh.** Two in-flight requests, same token `H`. Winner's CAS returns 1 row
(`prev=H, cur=A, rotated_at=T0`) and buffers `key(H) → pairA`. Loser's `UPDATE` blocks on the row
lock, re-evaluates against the committed tuple, returns **0 rows** — which proves the winner
committed — re-reads, matches `H` against `previous`, is in window, reads `key(H)`, and returns
**byte-identical** `pairA`. One chain, two identical responses, zero revocations, one `rotated_at`.

## 10. Testing strategy

Strict TDD is active (`npm test` from `backend/`, Testcontainers E2E). Red test first, always.

| Layer | What | Approach |
|---|---|---|
| Unit (pure) | `isWithinRotationGrace(rotatedAt, now, graceSeconds)` — null `rotated_at`, exact boundary, `grace === 0`, negative skew | fixed `Date` values passed in; **zero timers** |
| Unit (pure) | `UserSessionEntity.isValid(now)` — all 3 D11 clauses independently, and that it agrees with `ACTIVE_SESSION_SQL` | table-driven |
| Unit (pure) | `sha256Hex`, `timingSafeEqualHex` (length mismatch must not throw), `parseDurationSeconds` | no mocks |
| Unit | `AuthService.refresh` branch matrix: no `sid`, wrong `typ`, session null, `user_id` mismatch, current hit, CAS-loss→grace, grace out-of-window→revoke, buffer miss→401-no-revoke | mocked `SessionsRepository` + `RevocationCache`; `now` injected |
| Unit | `RevocationCache` — key shape, TTL arithmetic, **Redis throwing ⇒ `isRevoked` resolves `false`** | mocked ioredis that rejects |
| Unit | `SessionsService` D9 matrix: self always allowed (zero permissions), cross-user invisible → 404, visible-not-outranked → 403 `INSUFFICIENT_ROLE_RANK` | mocked repo, real `assertCanManage` |
| Integration (Testcontainers) | the CAS itself: two concurrent `rotate()` calls on one connection pool — exactly one returns a row; `findActiveByUser` excludes revoked/expired/legacy; migration 0016 applied twice (idempotence) and the legacy-row backfill | real Postgres; the only place the SQL is exercised |
| E2E | device A/B revocation (access **and** refresh), rotation invalidates the old token, grace hit, reuse-after-window, two-generations-old, `sid`-less token → `SESSION_REQUIRED`, anonymous login writes no row, cross-user 404/403 | `test/e2e/sessions.e2e-spec.ts` |
| Regression | **full suite run before any new test is written** | see §11 |

**Time is injected, never slept.** Two distinct clocks:

1. **Application clock** — `isWithinRotationGrace` takes `now: Date` as a parameter. Pure, instant,
   exact at the boundary.
2. **Database clock** — `now()` inside the CAS and `ACTIVE_SESSION_SQL` cannot be injected from
   Node. Boundary e2e tests **backdate the row** instead of waiting:
   `UPDATE user_sessions SET rotated_at = now() - interval '31 seconds' WHERE id = $1` (plus a
   `DEL sess:grace:*` for that sid, since the buffer must expire with it), exposed as a
   `test-environment.ts` helper.

The `SESSION_REFRESH_GRACE_SECONDS=0` criterion is covered by a config override on a separate app
instance, not by a sleep. **No `setTimeout`, no fixed sleep, anywhere in this suite**: the T3.4
verify already flagged fixed sleeps as a flake source, and Engram #443 is an unidentified e2e flake
— adding timing dependence now would make any new failure unattributable.

The concurrent-double-refresh e2e is `Promise.all([refresh(H), refresh(H)])` with **no** sleeps,
asserting both responses carry identical tokens, `revoked_at IS NULL`, and exactly one `rotated_at`
advance.

## 11. What T3.9 intentionally replaces (NOT additive)

Unlike T3.2, this change is **not** additive. Each item below is a deliberate replacement; verify
must not read any of them as a regression. Baseline: **unit 505/505, e2e 104/104**. (The proposal's
Risks table says 102 e2e — the current baseline is 104; the count moved after T3.4/T3.8.)

| # | Replaced | Consequence |
|---|---|---|
| 1 | `POST /auth/refresh` returns `{access_token}` | now returns the full `AuthTokens`; **breaking API change**, the first in Fase 3 |
| 2 | a refresh token is reusable for 7 days | every refresh invalidates its predecessor (D3) |
| 3 | `POST /auth/logout` is a no-op | now revokes; response shape unchanged, behaviour replaced |
| 4 | tokens minted before 0016 authorize | all 401 `SESSION_REQUIRED` at deploy (D7); **release-notes item**, the client must re-login on 401 |
| 5 | `auth.login` fan-out → `UsersService.recordSession` | deleted with its subject (D2): `users.service.spec.ts:167-183` (2 tests) and `auth.service.spec.ts:79` (1 test) are **removed**, not edited — 505 → 502 pre-existing unit tests |
| 6 | `EventEmitter2` injected into `AuthService` | removed (last use was line 82) — `auth.service.spec.ts` provider list changes |
| 7 | `perm:v2:` | becomes `perm:v3:` (**[R4]** cache-shape change); key assertions in `auth.service.spec.ts` change |
| 8 | one `user_sessions` row per user+device (deduped) | one row **per login**; same-device re-login does not revoke the earlier session |
| 9 | `AuthContext` has 5 fields | gains 2 **required** fields; every construction site in specs and `test-environment.ts` must supply them (a compile error, by design) |

Everything else must pass unmodified. **Run the full suite before writing a single new test.**

## File Changes

| File | Action | Description |
|---|---|---|
| `database/migrations/0016_sessions_revocation.sql` | Create | §5 |
| `database/rollback/0016_sessions_revocation.DOWN.sql` | Create | §5 |
| `database/MIGRATION_LOG.md`, `docs/tasks/1-BACKEND-MIGRATIONS.md` | Modify | register 0016; move `invitations` to 0017 |
| `backend/src/modules/sessions/{sessions.module,sessions.controller,sessions.service,sessions.repository,session-validity,revocation-cache,grace-buffer}.ts` | Create | leaf module, D11 predicate, D1 denylist + boot warm, **[R3]** buffer |
| `backend/src/modules/sessions/dto/session-response.dto.ts` | Create | `{id, device_uuid, ip_address, user_agent, created_at, last_refresh_at, expires_at, current}` — **never** a hash |
| `backend/src/entities/user-session.entity.ts` | Modify | 8 columns + `isValid()` (D11) + `isWithinRotationGrace()` (D4b) |
| `backend/src/config/auth.config.ts` | Modify | `sessionRefreshGraceSeconds`, `sessionRefreshTtlSeconds`, `parseDurationSeconds` |
| `backend/src/core/core.module.ts` | Modify | `SESSION_REDIS_CLIENT` (`enableOfflineQueue: false`, `commandTimeout: 50`) |
| `backend/src/modules/auth/auth.service.ts` | Modify | `issueSession`, rewritten `refresh`, `revokeSession`; `perm:v3:`; `EventEmitter2` + fan-out removed |
| `backend/src/modules/auth/auth.controller.ts` | Modify | real `logout`; `refresh` returns `AuthTokens`; passes ip/ua |
| `backend/src/modules/auth/jwt.strategy.ts` | Modify | `sid` requirement + denylist check (§3) |
| `backend/src/modules/auth/interfaces/jwt-payload.interface.ts` | Modify | `sid?: string` |
| `backend/src/modules/auth/auth.module.ts` | Modify | `imports: [SessionsModule]` |
| `backend/src/common/authz/subject-scope.ts` | Modify | `AuthContext.sessionId`, `.isAnonymous` |
| `backend/src/common/authz/assert-can-manage.ts` | Modify | export `assertVisible`; `assertCanManage` delegates to it |
| `backend/src/modules/users/{users.service,users.controller,users.module}.ts` | Modify | fan-out removed; `GET me/sessions`, `GET :id/sessions` |
| `backend/src/modules/realtime/events.gateway.ts` | Modify | same denylist check on handshake |
| `backend/src/app.module.ts` | Modify | register `SessionsModule` |
| `backend/test/support/test-environment.ts` | Modify | login helper surfaces `sid`; revoke helper; **backdate-row** helper (§10) |
| `backend/test/e2e/sessions.e2e-spec.ts` | Create | §10 |

## Open Questions

- [ ] None blocking. Six proposal gaps were resolved rather than deferred, all recorded above:
      **[R1]** the CAS predicate is a lost-update guard, not the security compare;
      **[R2]** the denylist lives on a dedicated `SESSION_REDIS_CLIENT` on Streams' DB, not the
      cache-manager DB; **[R3]** "replay the current pair" is unimplementable against a one-way
      hash — a Redis grace buffer supplies the payload while the DB columns keep the authority;
      **[R4]** `isAnonymous` forces a `perm:v3:` prefix bump; **[R5]** the refresh lifetime must be
      parsed to integer seconds for SQL; **[R6]** `SESSION_USER_MISMATCH` must reject without
      revoking, or `sid` visibility becomes a session-kill primitive.
