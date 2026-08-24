# Proposal: T3.9 Sessions — Refresh-Token Revocation and Rotation

Source: Engram `sdd/fase3-remaining/codegraph-analysis` (#447). Artifact store: hybrid.
Next free migration: **0016** (see Deviations — T3.6 `invitations` slides to 0017).
Port reference: `GeoReporta/backend/app/Domains/{Auth/Shared/Services/AuthService.php,Sessions/**}`.

## Intent

`AuthService.refresh()` (`backend/src/modules/auth/auth.service.ts:95-111`) verifies a refresh
token's **signature and nothing else**. It consults no session record, does not rotate the token,
and there is no revocation path anywhere in the system. A refresh token that leaks — from a
device backup, a shared phone, a proxy log, a stolen handset — mints access tokens for the full
`JWT_REFRESH_EXPIRES_IN` (**7 days**, `auth.config.ts:28`) and **nothing can stop it**.
`POST /api/auth/logout` returns `{success: true}` and does nothing
(`auth.controller.ts:56-60`). This is live in production today.

`user_sessions` already exists (0006) but is telemetry: `id, user_id, device_uuid, created_at`.
It is written by a passive `auth.login` fan-out and read by nobody. Its own header comment says
"full revocation/audit semantics land in the Sessions module (R15, T3.9)".

T3.9 makes the session row **security-bearing**: the JWT carries a `sid`, the session row holds a
hash of the currently-valid refresh token, every refresh rotates that hash, and revocation is a
real kill switch that takes effect on the next request — not on the next TTL boundary.

The bar is not "logout returns 200". It is: **after revoking a session, no token derived from it
authorizes anything, and every other session of the same user keeps working.**

## Scope

### In Scope

- Migration `0016_sessions_revocation.sql` + `database/rollback/0016_sessions_revocation.DOWN.sql`
  — additive `ALTER TABLE user_sessions` (six columns, D7), partial index, legacy-row backfill,
  `sessions` permission catalog rows, role-matrix append.
- New module `backend/src/modules/sessions/` — `SessionsRepository`, `SessionsService`,
  `SessionsController`, `SessionsModule`, DTOs. Mirrors the `organizations` module shape.
- `backend/src/entities/user-session.entity.ts` — the six new columns + an `isValid()` predicate.
- `JwtPayload` gains `sid: string` on **both** token types (`jwt-payload.interface.ts`).
- `AuthService`: `issueSession()` (mint `sid`, persist hash) called from `login()`;
  `refresh()` rewritten to validate → rotate → return a **new refresh token**; `revokeSession()`.
- **Rotation grace window (D4)** — `previous_refresh_token_hash` + `rotated_at` columns, a
  configurable `sessionRefreshGraceSeconds` (default 30) in `auth.config.ts`, and the benign-retry
  path that replays the current token pair instead of rotating.
- `RevocationCache` (D1) — Redis denylist keyed by `sid`, written on revoke, warmed at boot.
- `JwtStrategy.validate` — per-request denylist check; `AuthContext` gains `sessionId` and
  `isAnonymous`.
- Removal of the `auth.login` → `UsersService.recordSession` fan-out (D2), including
  `UsersService.recordSession`/`handleAuthLogin` and the `UserSessionEntity` injection there.
- Endpoints: `POST /api/auth/logout` (real), `GET /api/users/me/sessions`,
  `GET /api/users/:id/sessions`, `DELETE /api/sessions/:id`.
- Unit specs for repository/service/reuse-detection/hashing + `backend/test/e2e/sessions.e2e-spec.ts`
  (the doc's device-A/device-B acceptance scenario, rotation, reuse detection, cross-user rank/scope).

### Out of Scope

- **Password or credential auth of any kind.** Identity stays device-UUID (`login(deviceUuid)`).
  T3.6's problem, not this one.
- **The 90-day cleanup cron.** `@nestjs/schedule` is not a dependency and adding a scheduler is its
  own decision (leader election on multi-instance). Revoked rows are inert; denylist entries expire
  by TTL. Deferred, noted in Deviations.
- **Revoke-all-sessions-for-a-user** (`DELETE /api/users/:id/sessions`). The per-session route plus
  the listing covers the admin need; a bulk route is one method away once the listing proves the
  shape. Deferred deliberately, not forgotten.
- **Per-request `last_used_at` writes.** Updated on refresh only (D7) — a write per authenticated
  request is not acceptable against Supabase's pooler.
- **Binding a session to an IP or user-agent** (rejecting a refresh when they change). Mobile
  clients roam between cellular and Wi-Fi constantly; this would log people out for moving.
  Stored for audit, never enforced.
- **`permission_version` / JWT `pv` semantics.** Untouched (T3.2 D7 still stands).
- Anonymous-device session tracking (D6). Any frontend work.

## Capabilities

### New Capabilities

- `session-lifecycle`: a session row minted per login, carrying the hash of the one currently-valid
  refresh token plus its immediate predecessor; rotation on every refresh; reuse detection with a
  bounded single-generation retry grace (D4/D4b).
- `session-revocation`: immediate, no-TTL-lag invalidation of a session across both token types.
- `session-audit`: self and (scope + rank gated) cross-user listing of active sessions with device,
  IP, and last-refresh metadata.

### Modified Capabilities

- `auth` — `POST /api/auth/refresh` **response shape changes** (now returns `refresh_token`
  alongside `access_token`); `POST /api/auth/logout` becomes stateful; tokens without `sid` are
  rejected (D4).
- `users` — loses `recordSession`/`handleAuthLogin` (D2); gains `GET /users/me/sessions` and
  `GET /users/:id/sessions`.

## Locked Design Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| D1 | Per-request revocation check | A **Redis denylist**: `sess:revoked:{sid}`, written on revoke with TTL = remaining refresh lifetime, checked in `JwtStrategy.validate`. **Warmed at boot** from `SELECT id FROM user_sessions WHERE revoked_at IS NOT NULL AND expires_at > now()`. Absence = valid. | (a) An unconditional DB read per request; (b) folding session state into the `perm:v2:` AuthContext cache | (b) is **wrong-shaped and unsafe**: `perm:v2:uid:{userId}` is keyed by *user*, session state is per *sid*, so revoking one device would either blow away every device's cached org/permissions or require the value to become a sid→state map with N invalidation points. Worse, its rebuild query (`auth.service.ts:201-207`) knows nothing about sessions — a cache miss would **silently resurrect a revoked session**. (a) is correct but turns every authenticated request into a Postgres round-trip; today a warm cache costs zero. The denylist is one Redis `GET` on a set that is small and self-expiring, and it satisfies "revocación inmediata" literally. |
| D1b | Denylist failure mode | **Fail-open, bounded**, and stated as a security property: if Redis loses data mid-process, revoked sessions regain *access-token* validity for at most `JWT_ACCESS_EXPIRES_IN` (**15 min**) and can **never be renewed**, because `refresh()` reads the DB unconditionally (D3). Boot-warm closes the restart case. | Fail-closed (deny all when Redis is down) | Fail-closed converts a cache outage into a total auth outage for every user — a self-inflicted DoS in exchange for closing a 15-minute window that requires an *attacker-uncorrelated* Redis flush to open. The DB stays authoritative exactly where permanence matters: no rotation, no new refresh token, session dead within 15 minutes. **This is a deliberate trade, not an oversight.** |
| D2 | Owner of `user_sessions` writes | **`AuthService`, synchronously, via `SessionsRepository`.** The `auth.login` → `UsersService.recordSession` fan-out is **deleted**. | Keeping the event fan-out; having `SessionsService` listen instead | The row is no longer telemetry — it is the record without which the refresh token we *just handed the client* is unusable. `EventEmitter2.emit` is fire-and-forget and swallows listener failures: under the fan-out, a failed insert means a 200 login whose token 401s on first refresh, with no error anywhere. `sid` and `refresh_token_hash` are also **derived from the tokens minted inside `login()`** — they cannot be reconstructed by a listener. The original constraint (AuthModule must not import UsersModule) is satisfied unchanged: AuthModule depends on **`SessionsRepository`**, a leaf with no service dependencies — the same repository-not-service resolution T3.2's Dependencies section prescribed. New DAG edge: `Auth -> Sessions`; `Users -> Sessions` for the listing. No cycle. |
| D3 | Refresh validation + rotation | Rotate on **every** refresh. Order: verify signature → require `typ === 'refresh'` and `sid` → `findById(sid)` → `isValid()` → assert `session.user_id === payload.sub` → `timingSafeEqual(sha256(token), stored_hash)` → mint a new pair → `UPDATE` hash/`expires_at`/`last_used_at`/ip/ua. Returns **both** tokens. | Issuing only a new access token (today's behaviour); rotating only near expiry | Without rotation the stored hash is a constant for 7 days, so a stolen token stays valid until expiry — the entire point of the change. The `session.user_id === sub` assertion is not redundant with the signature: it stops a valid token for session X being replayed against a `sid` belonging to another user. `expires_at` is re-extended on rotation, giving a sliding window: active devices stay logged in, abandoned ones die. |
| D4 | Reuse of an already-rotated token | **Theft ⇒ revoke the entire session — with one narrow, explicit exception.** The session stores `previous_refresh_token_hash` + `rotated_at` alongside the current hash. On a hash miss: (a) matches `previous_refresh_token_hash` **and** `now() - rotated_at <= sessionRefreshGraceSeconds` (default **30 s**, configurable) → **benign retry**: replay the **current** token pair, rotate nothing, revoke nothing; (b) anything else — an older hash, garbage, or the previous hash **after** the window — → `revoke(sid)` + denylist write + `401 SESSION_REUSE_DETECTED`. | (i) Plain rejection (GeoReporta: `Hash::check` fails → 401, session survives); (ii) unmitigated revoke-on-replay (this proposal's first draft — no grace window, mitigation deferred until logs showed a rate); (iii) a longer window (5-15 min) | (i) leaves the attacker holding the *newer* token: the victim's refresh fails, they re-login, and the thief's chain continues untouched. Revoke-the-chain inverts that — whoever refreshes second kills the session, and the legitimate user recovers trivially because **our login needs no credentials, just the stored device UUID** (RFC 9700 §4.14.2). (ii) is right in principle and **wrong for this product**: this is a citizen incident-reporting PWA used in the field on mobile over intermittent connectivity. A client that refreshes, loses the response to a timeout, and retries with the token it still holds is **routine here, not an edge case** — and unmitigated it ejects that user mid-report while the offline queue still holds unsent data, surfacing through support rather than logs. One nullable column and one comparison against "wait and see" is not a real trade when the predicted rate is high and the failure mode is user-hostile. (iii) widens the replay hole below for no additional ergonomic gain: 30 s covers a mobile request timeout with margin; a legitimate client that has not stored its new token after 30 s has lost it. |
| D4b | What the grace window does **not** excuse | A token **two or more rotations old** → revoke. The previous token presented **after** `rotated_at + grace` → revoke. A previous token presented against a session already revoked/expired → 401, no resurrection. `rotated_at` is written **only on a real rotation**, never on a grace-path hit. | Sliding the window on every grace hit; matching against a chain of N previous hashes | Exactly one token generation is forgiven, for exactly one bounded interval. If a grace hit refreshed `rotated_at`, an attacker replaying the previous token on a timer would hold the window open indefinitely — the mitigation would become the vulnerability. A chain of N hashes turns a retry allowance into a general replay allowance. **Security property, stated plainly rather than left implicit: the previous refresh token remains usable for ~30 s after each rotation, so a token stolen and replayed inside that window is served the current valid pair and reuse detection does not fire.** That is the price paid for not ejecting field users, and it is the reason the window is short and configurable rather than generous. |
| D5 | Refresh-token hashing | **SHA-256** (`node:crypto`, hex, `char(64)`) compared with `timingSafeEqual`. | bcrypt/argon2 (GeoReporta uses `Hash::make`) | A refresh token is a **signed JWT with ≥256 bits of unforgeable entropy**, not a user-chosen password. A slow KDF exists to make *offline brute force of low-entropy secrets* expensive; there is nothing to brute-force here, and it would add ~100 ms of CPU to every refresh on a mobile-heavy workload. bcrypt would also be the project's first native-build dependency (Docker toolchain cost). Determinism is a bonus, not the reason — lookup is by `sid`, never by hash (that is why GeoReporta's non-deterministic hash was fine). |
| D6 | Access-token revocation latency | **Honoured literally.** `sid` goes into the **access** token too and `JwtStrategy.validate` checks the denylist per request, so revocation kills in-flight access tokens on the next request. | Refresh-only revocation (accept up to 15 min of lag) | The doc's acceptance criterion says "revocación inmediata (sin lag de TTL)" and its e2e scenario asserts the device-A *access* token stops working. Refresh-only revocation would fail that test as written. D1's denylist makes the guarantee affordable — this is the payoff for choosing a session-keyed cache over the user-keyed one. |
| D7 | Tokens minted before 0016 (no `sid`) | **Rejected, 401.** No grace period, no legacy bypass. Sessions terminate at deploy. | Accepting sid-less tokens as "legacy, unrevokable" for a 7-day transition | Accepting them means the exact vulnerability being fixed stays wide open for a week, on the one class of token an attacker already holds. Rejecting is normally a brutal call — but **our identity model makes it free**: the client re-authenticates with `POST /api/auth/login {device_uuid}`, a value it already has on disk. No password prompt, no email, no user-visible event, provided the client retries login on 401. See Risks. |
| D8 | Anonymous devices | **No session row, no `sid`.** `JwtStrategy` skips the session check when `AuthContext.isAnonymous`. Anonymous tokens stay unrevokable. | Session rows for anonymous logins; a sentinel `sid: 'anonymous'` | `device_uuid = 'anonymous'` is **one shared user row for every anonymous device** (0001 seed). Session rows would grow unbounded, "revoke session X" would be meaningless, and a listing would expose every anonymous device's IP to any holder of the anonymous token. The ceiling itself is the mitigation: `auth.config.ts:33-38` grants READ/CREATE on incidents and comments only — no UPDATE, no DELETE, nothing to revoke that matters. `isAnonymous` is derived server-side from `sub`, so it cannot be claimed by a forged token. |
| D9 | Session-management authorization | Reuse T3.2's axes verbatim. **Own session → always allowed**, no permission and no rank check, on both list and revoke (precedent: `GET /users/me`). Someone else's → `@RequirePermission('READ'\|'DELETE', 'sessions')` **+** `assertCanManage(actor, targetUser)` (scope visibility, then rank). Target not visible → **404**; visible but not out-ranked → **403 `INSUFFICIENT_ROLE_RANK`**. | A new `sessions.owner_id`-style axis; a `SELF` pseudo-permission; rank-gating reads | T3.2 D10/D11 already settled this shape and `assert-can-manage.ts` already implements 404-when-invisible / 403-when-outranked. Inventing a parallel axis is precisely what T3.2's Deviations table rejected for `READ cross-org incidents`. Self-always-allowed is non-negotiable: a user locking their own stolen phone out must never depend on a permission grant. Rank gates **writes** only — an org admin who can already see a user in `GET /users` learns nothing new from their session list. |
| D10 | Route shape | `POST /api/auth/logout`, `GET /api/users/me/sessions`, `GET /api/users/:id/sessions`, `DELETE /api/sessions/:id` | The doc's `GET /api/me/sessions` + `DELETE /api/me/sessions/{id}` | There is no `me` controller; `users.controller.ts:32` already owns `GET users/me`, so `users/me/sessions` costs nothing and `/me/*` would be a second identity namespace. `DELETE /me/sessions/:id` **structurally cannot express cross-user revocation**, which D9 and R15 require — hence the top-level `/api/sessions/:id`. `GET /users/:id/sessions` is added beyond the brief because without it a cross-user `DELETE /sessions/:id` has **no discovery path**: an admin would have to guess a uuid. |
| D11 | Session validity predicate | One expression, defined once in the entity and mirrored in SQL: `revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL` | Scattered per-call-site checks; a `status` enum column | Three independent reasons a session is dead (revoked, expired, legacy stub) must collapse into one predicate or a call site will check two of three. An enum would need a writer for the expiry transition — a cron to say what `now()` already says. |
| D12 | Legacy `user_sessions` rows | **Kept, invalid, and excluded from every listing.** `refresh_token_hash IS NULL` fails D11; `expires_at` is backfilled to `created_at` (already past) so they fail on two clauses. Columns stay **nullable** — no NOT NULL, no synthetic hash. | `DELETE FROM user_sessions` in the migration; backfilling a placeholder hash | Deleting destroys the only record of which devices ever logged in — the exact audit trail these rows were created for. A placeholder hash would make a dead row look alive to any future code that checks only `revoked_at`. `NOT NULL` is unachievable without one of those two. Consistency check: D7 rejects sid-less tokens, so **no live token references a legacy row** — inertness is guaranteed from both ends. |
| D13 | Device metadata storage | Typed columns: `ip_address varchar(45)`, `user_agent varchar(512)` | The doc's `device_info` JSON blob; PostgreSQL `inet` | We know the fields; JSON invites silent schema drift and is not indexable. `inet` **raises on malformed input**, which would turn a login behind a misconfigured proxy (`X-Forwarded-For: a, b, c`) into a 500 — a header an attacker controls must never be able to fail a write. `varchar(45)` holds a full IPv6 address; the app takes the first hop and truncates. |

## Migration 0016 — shape

```sql
BEGIN;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash          char(64),    -- sha256 hex (D5); NULL = legacy (D12)
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash char(64),    -- D4 grace window; NULL before first rotation
  ADD COLUMN IF NOT EXISTS rotated_at                  timestamptz, -- D4b: written ONLY on a real rotation
  ADD COLUMN IF NOT EXISTS ip_address                  varchar(45), -- D13
  ADD COLUMN IF NOT EXISTS user_agent                  varchar(512),
  ADD COLUMN IF NOT EXISTS revoked_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at                timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at                  timestamptz;

-- D12: legacy rows fail the D11 predicate on expiry as well as on the NULL hash.
UPDATE user_sessions SET expires_at = created_at WHERE expires_at IS NULL;

-- Listing: active sessions of one user, newest first.
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions (user_id, created_at DESC) WHERE revoked_at IS NULL;

-- D1 boot-warm query.
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked
  ON user_sessions (revoked_at) WHERE revoked_at IS NOT NULL;

INSERT INTO permissions (resource, action) VALUES
  ('sessions', 'READ'), ('sessions', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
```

`id` is the `sid` — no new column (matches GeoReporta). The rollback file
`database/rollback/0016_sessions_revocation.DOWN.sql` **drops the eight columns and two indexes
only**; it must **not** `DROP TABLE user_sessions`, which belongs to 0006.

`previous_refresh_token_hash` needs no index — it is only ever read on a row already fetched by
`sid`, never searched. `rotated_at` stays NULL until a session's first rotation, so the D4 grace
path is unreachable for a session that has never refreshed (correct: there is no previous token
to forgive).

### Role-matrix append (T3.2 cross-task contract)

0016 owns the `sessions` catalog rows, so it appends its own strings to the four roles seeded by
0015. The row is copied from `users`/`roles` deliberately:

| Resource | `admin_sistema` | `operador_sistema` | `admin_organizacion` | `operador_organizacion` | `reporter` |
|---|---|---|---|---|---|
| sessions | R D | — | R D | — | — |

`operador_sistema` gets nothing for the same reason T3.2 gave it nothing on `users`/`roles`: it is
the read-only system account, and session listings are staff PII (IP, device). `reporter` needs no
grant — own sessions are always permitted (D9).

## Deviations from `docs/tasks/1-BACKEND-MIGRATIONS.md`

| Doc says (T3.9, lines 195-208; table line 244) | We ship | Why |
|---|---|---|
| A **new `sessions` table** at migration **0017** | **Additive `ALTER TABLE user_sessions`** at **0016** | The table has existed since 0006 and `user-session.entity.ts:6-9` states verbatim that T3.9 is where its revocation semantics land. A second table would leave two session concepts and orphan live rows. T3.9 is being executed **before** T3.6, so it takes the next free number, 0016. |
| `invitations` = 0016, `sessions` = 0017 | `sessions` = **0016**; **T3.6 `invitations` must move to 0017** | Execution order. No functional dependency in either direction — see Dependencies. |
| `jti` unique, "FK auth.jti" | The session **`id` is the `sid`** claim, in both tokens. `jti` stays a per-token nonce. | `jti` is per-*token* and changes on every rotation; a session outlives many `jti`s, so a `jti` column would need rewriting on each refresh and could never be a stable FK ("FK auth.jti" has no referent — `jti` is not stored anywhere). `sid` is the session identity, stable across rotations. Direct GeoReporta precedent. |
| `device_info` JSON (browser/OS/IP) | Typed `ip_address` + `user_agent` columns | D13. |
| `last_activity_at`, updated on refresh | `last_used_at`, updated on refresh — and **labelled "last refresh"** in the API | Same write point, honest name. It is not activity: a device making requests for 14 minutes without refreshing does not move it. |
| `GET /api/me/sessions`, `DELETE /api/me/sessions/{id}` | `GET /api/users/me/sessions`, `GET /api/users/:id/sessions`, `DELETE /api/sessions/:id` | D10. |
| 90-day cleanup cron | **Deferred** | No scheduler dependency exists; adding one needs a multi-instance leader-election decision. Revoked rows are inert (D11) and denylist entries self-expire. Cost of deferral is disk. |
| — (silent) | Reuse detection revokes the chain, with a ~30 s single-generation grace window | D4/D4b. The doc assumes rotation is only about freshness; it contemplates neither theft nor the mobile-retry path that theft detection creates. |
| — (silent) | `POST /api/auth/refresh` now returns a **new `refresh_token`** | Unavoidable consequence of rotation. **This is a breaking API-response change** — the first in Fase 3. |
| — (silent) | All pre-0016 tokens are rejected at deploy | D7. |
| "Depende de: T1.4 (Auth)" | Also depends on **T3.2** (scope + rank for cross-user management) | T3.2 did not exist when the doc was written. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `database/migrations/0016_sessions_revocation.sql` (+ `.DOWN.sql`) | New | Eight columns, two indexes, backfill, catalog, role append |
| `backend/src/entities/user-session.entity.ts` | Modified | Eight columns + `isValid()` (D11) + `isWithinRotationGrace()` (D4b) |
| `backend/src/config/auth.config.ts` | Modified | `sessionRefreshGraceSeconds` (env `SESSION_REFRESH_GRACE_SECONDS`, default 30) |
| `backend/src/modules/sessions/**` | New | Repository, service, controller, module, DTOs |
| `backend/src/modules/sessions/revocation-cache.ts` | New | Denylist + boot warm (D1) |
| `backend/src/modules/auth/auth.service.ts` | Modified | `issueSession`, rewritten `refresh` (rotation + reuse detection), `revokeSession` |
| `backend/src/modules/auth/auth.controller.ts` | Modified | Real `logout`; `refresh` response gains `refresh_token` |
| `backend/src/modules/auth/interfaces/jwt-payload.interface.ts` | Modified | `sid` on both token types |
| `backend/src/modules/auth/jwt.strategy.ts` | Modified | Per-request denylist check (D6) |
| `backend/src/common/authz/subject-scope.ts` | Modified | `AuthContext` gains `sessionId`, `isAnonymous` |
| `backend/src/modules/users/{users.service,users.controller,users.module}.ts` | Modified | Fan-out removed (D2); `GET me/sessions`, `GET :id/sessions` |
| `backend/src/modules/auth/auth.module.ts` | Modified | Imports `SessionsModule` |
| `backend/test/support/test-environment.ts` | Modified | Login helper surfaces `sid`; a revoke helper |
| `backend/test/e2e/sessions.e2e-spec.ts` | New | Device A/B, rotation, reuse, cross-user scope + rank |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **D7 logs everyone out at deploy and the client does not retry login** | **High** | High | The client MUST treat 401 as "re-`POST /api/auth/login` with the stored `device_uuid`, once, then retry". Frontend is out of scope, so this is a **release-coordination item, not a code item** — flagged in Dependencies and it must be in the release notes. Contract test: a sid-less token returns 401 with a distinguishable `code`, so the client can branch on it. |
| **D4 false positive**: a field client that refreshes, loses the response to a timeout, and retries with the token it still holds | **High** (mobile PWA, intermittent connectivity — this is the normal case, not an edge case) | High (user ejected mid-report with unsent offline-queue data) | **Mitigated in v1, not deferred**: D4's grace window turns the retry into a benign replay of the current pair. The service must still log every `SESSION_REUSE_DETECTED` **and** every grace-path hit with `sid`+ip, so the two rates are separable and the window can be tuned from evidence rather than guessed again. |
| **D4's grace window is itself a replay hole**: a refresh token stolen and replayed within ~30 s of a legitimate rotation is served the current valid pair and does not trip detection | Low | Med | Accepted and stated, not hidden. Bounded three ways: exactly **one** generation is forgiven (D4b), the window is **~30 s** and configurable down to 0 to disable it entirely, and `rotated_at` is written only on real rotations so the window cannot be held open by replaying on a timer. An attacker must already hold a valid refresh token *and* win a 30-second race against the legitimate client. |
| Redis flush resurrects revoked sessions for up to 15 min (D1b) | Low | Med | Bounded by design and stated as a property, not hidden: boot-warm covers restarts, `refresh()` always hits the DB so nothing can be renewed, and the ceiling is `JWT_ACCESS_EXPIRES_IN`. |
| Removing the fan-out (D2) deletes 3 pre-existing unit tests | **Certain** | Med | **This is the one place T3.9 is not additive, and it is stated rather than discovered.** `users.service.spec.ts:167-183` (2 tests) and `auth.service.spec.ts:79` assert the fan-out design itself; they are deleted **with their subject**, which is not the same as editing a test to accommodate a regression. `refresh()` specs change because its contract changes (D3). **Every other pre-existing unit and e2e test must pass unmodified** — 102/102 e2e in particular, since no e2e asserts refresh behaviour today (only `health.e2e-spec.ts:37`, which checks login returns a `refresh_token`). Run the full suite before writing new tests. |
| One row per login (no more device dedupe) grows `user_sessions` | Med | Low | Intended — two logins from one device are two revocable sessions. Bounded by `expires_at`; the deferred cleanup cron is the eventual answer. Same-device re-login does **not** revoke the earlier session (users legitimately hold two tokens mid-rotation). |
| Denylist check adds a Redis round-trip to every authenticated request | Med | Low | It replaces nothing but adds ~0.2 ms on a hit, versus the DB read the alternative required. Skipped entirely for anonymous identities (D8). |
| `sid` in the access token leaks a session identifier to anyone reading the JWT | Low | Low | JWT payloads are not secret. `sid` is an opaque uuid; possession without the signing key grants nothing, and revocation by `sid` requires D9 authorization. |
| A future endpoint reads sessions without the D11 predicate | Med | High | The predicate lives in exactly one place and the repository exposes **no** unfiltered finder — `findActiveById` and `findActiveByUser` only. Verify phase greps for direct `user_sessions` queries outside `SessionsRepository`. |
| Rotation under a concurrent double-refresh from one device | Med | Med | **Design-phase pin (D4b):** the rotating `UPDATE` must be a **single conditional statement that shifts current→previous atomically** — `UPDATE user_sessions SET previous_refresh_token_hash = refresh_token_hash, refresh_token_hash = $new, rotated_at = now(), ... WHERE id = $1 AND refresh_token_hash = $old AND revoked_at IS NULL RETURNING *`. Zero rows affected means another request rotated first; the loser then re-reads and resolves through the **grace path**, not the revoke path — which is only true if the shift is atomic with the compare. Splitting it into two statements reintroduces a window where the previous hash is missing and a concurrent retry is misread as theft. |

## Effort Estimate (~12.5h)

| Slice | Est. |
|---|---|
| Migration 0016 + rollback + catalog + role append | 1h |
| Entity + `SessionsRepository` + D11 predicate + hashing util + unit specs | 1.5h |
| `AuthService`: `issueSession`, rotation, reuse detection, `revokeSession` + unit specs | 3h |
| D4/D4b grace window: config, atomic current→previous shift, benign-retry path, boundary unit specs (in-window / out-of-window / two-generations-old / grace-hit-does-not-slide) | 1.5h |
| `RevocationCache` (denylist, boot warm) + `JwtStrategy` check + `AuthContext` fields | 1.5h |
| Endpoints (logout, 2 listings, delete) + DTOs + D9 scope/rank wiring + unit specs | 1.5h |
| Fan-out removal (D2) + `UsersModule`/`AuthModule` DAG rewiring | 0.5h |
| `sessions.e2e-spec.ts` + harness changes (incl. the benign-retry scenario) | 2h |

## Dependencies

- **Migration ordering**: T3.9 takes **0016**; **T3.6 `invitations` must move to 0017** and
  `docs/tasks/1-BACKEND-MIGRATIONS.md:243-244` + `database/MIGRATION_LOG.md` must be corrected.
  No functional dependency either way — 0016 touches only `user_sessions`, `permissions`, `roles`.
- Migrations 0001-0015 applied to Supabase and local dev (confirmed 2026-08-17).
- **T3.2 shipped** — `SubjectScope`, `ROLE_RANK`, `assertCanManage`, and the four seeded roles are
  hard prerequisites for D9.
- T1.4 (Auth), T2.3 (Users) shipped.
- Redis/`CACHE_MANAGER` is already wired (`auth.service.ts`); D1 adds keys, not infrastructure.
- **Release coordination (non-code)**: D7 terminates every live session on deploy. The mobile client
  must re-login on 401 before this ships, or users see a logout. Must be in the release notes.
- Strict TDD is active: `npm test` from `backend/`, Testcontainers-backed E2E.
- No new npm dependency (D5 uses `node:crypto`).

## Success Criteria

- [ ] **The doc's scenario**: login on device A and device B → `DELETE /api/sessions/{A}` → A's
      **access** token 401s on the very next request (no TTL wait, D6), A's refresh token 401s, and
      B's access **and** refresh tokens both still work.
- [ ] `POST /api/auth/refresh` returns a **new** `refresh_token`, and the previous one 401s.
- [ ] Replaying the immediately-previous refresh token **inside** the grace window returns **200**
      with the **current** token pair, rotates nothing, revokes nothing, and does **not** advance
      `rotated_at` (D4a, D4b) — the client that lost its response recovers transparently.
- [ ] The same replay **after** the grace window returns **401 `SESSION_REUSE_DETECTED`** and the
      session is revoked — the *newest* token issued for that session also stops working (D4b).
- [ ] A refresh token **two rotations old** is rejected and revokes the session even **inside** the
      window (only one generation is forgiven, D4b).
- [ ] Replaying the previous token repeatedly on a timer does **not** hold the window open — the
      second attempt after `rotated_at + grace` revokes, proving grace hits never slide `rotated_at`.
- [ ] With `SESSION_REFRESH_GRACE_SECONDS=0` the behaviour is exactly unmitigated D4 (any replay
      revokes) — the window is provably a bounded relaxation, not a rewrite of the rule.
- [ ] A refresh token whose `sid` belongs to another user is rejected even though its signature is
      valid (D3's `user_id === sub` assertion, asserted by name).
- [ ] `POST /api/auth/logout` revokes the caller's own session; the token used to call it is dead
      on the next request.
- [ ] `GET /api/users/me/sessions` lists only the caller's sessions, excludes revoked, expired, and
      legacy (`refresh_token_hash IS NULL`) rows, and never returns a hash (D11, D12).
- [ ] A user revokes their **own** session while holding **zero** `sessions` permissions (D9).
- [ ] `DELETE /api/sessions/:id` for a user in another organization returns **404**; for a
      same-org user of equal-or-higher rank, **403 `INSUFFICIENT_ROLE_RANK`** (D9, T3.2 D11).
- [ ] A token minted before 0016 (no `sid`) is rejected 401 with a distinguishable error code (D7).
- [ ] An anonymous-device login creates **no** `user_sessions` row and its token still authorizes
      the anonymous ceiling unchanged (D8).
- [ ] After 0016, pre-existing `user_sessions` rows still exist, have `expires_at = created_at`,
      and appear in no listing (D12).
- [ ] **Every pre-existing test passes unmodified except** the 3 fan-out specs deleted with their
      subject and the `refresh()` specs whose contract changed. E2E stays 102/102 + the new suite.
