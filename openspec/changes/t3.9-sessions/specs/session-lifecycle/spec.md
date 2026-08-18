# Session Lifecycle, Revocation, and Audit Specification

## Purpose

Make `user_sessions` security-bearing — a `sid`-carrying, hash-verified, immediately revocable record of the one currently-valid refresh token per login — replacing today's signature-only refresh check that cannot be stopped once a token leaks.

## Scope Summary

**In scope**
- `session-lifecycle` (new): session row minted per login, rotation on every refresh, single-generation reuse-detection grace window (D3/D4/D4b)
- `session-revocation` (new): per-request denylist check, immediate invalidation of both token types, no TTL lag (D1/D1b/D6)
- `session-audit` (new): self and scope+rank-gated cross-user listing of active sessions (D9)
- `auth` (modified): `POST /api/auth/refresh` response shape changes to include `refresh_token`; `POST /api/auth/logout` becomes stateful; tokens without `sid` are rejected (D7)
- `users` (modified): loses `recordSession`/`handleAuthLogin` fan-out (D2); gains `GET /users/me/sessions`, `GET /users/:id/sessions`
- Migration `0016`: additive `ALTER TABLE user_sessions` (eight columns), two indexes, legacy-row backfill, `sessions` permission catalog + role-matrix append

**Out of scope**
- Password/credential auth (identity stays device-UUID)
- 90-day cleanup cron; revoked rows are inert, not deleted
- Bulk `DELETE /api/users/:id/sessions` (revoke-all-for-user)
- Per-request `last_used_at` writes (updated on refresh only)
- Binding a session to IP/user-agent (stored for audit, never enforced)
- Anonymous-device session tracking; any frontend work (see Legacy Rows below for the one frontend-adjacent requirement that must still be *recorded*)

**Not additive — read before verifying**: unlike prior Fase 3 changes, this change intentionally breaks `refresh()`'s existing contract (D3) and deletes three pre-existing unit tests together with the fan-out logic they exercised (`users.service.spec.ts` x2, `auth.service.spec.ts` x1, per D2). This is a designed replacement, not a regression. Baseline to preserve otherwise: unit 505/505, e2e 104/104, unaffected by this change.

## Requirements

### Session Record

The system MUST create one `user_sessions` row per successful login, whose `id` column IS the `sid` claim (no separate column).

The row MUST carry: `id, user_id, device_uuid, created_at` (existing) plus `refresh_token_hash, previous_refresh_token_hash, rotated_at, ip_address, user_agent, revoked_at, last_used_at, expires_at` (added by migration 0016).

`sid` MUST be present in the JWT payload of both the access token and the refresh token minted for a non-anonymous login.

Session validity MUST be defined by exactly one predicate, used everywhere a session is checked: `revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL`.

### Rotation

Every call to `refresh()` MUST validate the presented token, then rotate, then return a new token pair (`access_token` AND `refresh_token`) — never only an access token.

Validation order MUST be: verify signature → require `typ === 'refresh'` and `sid` present → load session by `sid` → session `isValid()` → `session.user_id === payload.sub` → `timingSafeEqual(sha256(token), stored_hash)`.

The rotating write MUST be one atomic, conditional statement that shifts current→previous and installs the new hash together — `UPDATE ... SET previous_refresh_token_hash = refresh_token_hash, refresh_token_hash = $new, rotated_at = now(), expires_at = ..., last_used_at = ..., ip_address = ..., user_agent = ... WHERE id = $sid AND refresh_token_hash = $old AND revoked_at IS NULL`. Splitting the shift from the compare into two statements MUST NOT be done — it opens a window where a concurrent retry is misread as reuse.

`rotated_at` MUST be written only when this atomic rotation actually executes (a matched row) — never on a grace-path hit.

`expires_at` MUST be re-extended on every successful rotation (sliding expiry).

### Reuse Detection

On a hash miss (the presented token does not match the session's current `refresh_token_hash`), the system MUST branch exactly two ways:

1. **Benign retry**: the presented token's hash matches `previous_refresh_token_hash` AND `now() - rotated_at <= sessionRefreshGraceSeconds` → return `200` with the **current** token pair unchanged. This path MUST NOT rotate anything, MUST NOT revoke anything, and MUST NOT advance `rotated_at`.
2. **Reuse**: anything else — an older-than-previous hash, garbage, or the previous hash presented *after* `rotated_at + sessionRefreshGraceSeconds` — MUST revoke the session, write a denylist entry, and return `401 SESSION_REUSE_DETECTED`.

Exactly one token generation MAY be forgiven. A token two or more rotations old MUST revoke even when presented inside the grace window of the *current* rotation — the grace check only ever compares against `previous_refresh_token_hash`, never a chain.

A grace-path hit MUST NOT reset or extend `rotated_at`; replaying the previous token repeatedly on a timer MUST NOT hold the window open — the property required is that grace is bounded to `sessionRefreshGraceSeconds` after the one real rotation that produced `previous_refresh_token_hash`, independent of how many times it is replayed inside that bound.

`SESSION_REFRESH_GRACE_SECONDS=0` MUST reproduce unmitigated revoke-on-replay exactly: with a zero-second window, any replay of a non-current hash — including the immediately-previous one — MUST revoke, because no real-time gap can satisfy `now() - rotated_at <= 0`.

When two rotation attempts race on one session, the atomic conditional UPDATE MUST guarantee exactly one succeeds; the losing request's token, now equal to `previous_refresh_token_hash` within the grace window, MUST resolve through the **benign-retry** path above, never through revocation.

### Revocation

The system MUST check a per-`sid` denylist (`sess:revoked:{sid}`) on every authenticated request for a non-anonymous identity; absence of an entry means the session is not denylisted (D1).

The denylist MUST be warmed at process boot from all sessions where `revoked_at IS NOT NULL AND expires_at > now()`.

If the denylist is unavailable (fail-open, D1b), an access token belonging to a revoked session MAY remain valid for at most the remaining `JWT_ACCESS_EXPIRES_IN`, and MUST NOT be renewable — `refresh()` MUST consult the database unconditionally regardless of denylist state.

Revocation MUST take effect on the immediately next request against that session — for both the access token (via the denylist check) and the refresh token (via the DB `isValid()` check) — never merely at TTL expiry (D6).

Revoking a session MUST set `revoked_at` and write the corresponding denylist entry with TTL equal to the session's remaining refresh lifetime.

### Ownership of Writes

`AuthService`, via `SessionsRepository`, MUST be the sole writer of `user_sessions` rows: `issueSession()` on login, the rotation/reuse-detection UPDATE on refresh, and revocation on logout/`DELETE /sessions/:id`.

The `auth.login` → `UsersService.recordSession` event fan-out MUST be removed; `UsersService` MUST NOT write `user_sessions`.

`AuthModule` MUST depend only on `SessionsRepository` (not `SessionsService`), preserving the existing constraint that `AuthModule` does not import `UsersModule`; `UsersModule` MAY depend on `SessionsRepository` for the listing endpoints only.

### Authorization

An actor acting on their own session (`session.user_id === actor.id`) MUST always be permitted to list or revoke it, regardless of the actor's `sessions` permissions or rank.

An actor acting on another user's session MUST hold `@RequirePermission('READ'|'DELETE', 'sessions')` for the corresponding action, AND MUST pass `assertCanManage(actor, targetUser)`.

If the target user is not visible under the actor's `SubjectScope`, the response MUST be `404`.

If the target user is visible but not strictly outranked by the actor (`rank(actor) < rank(target)` fails, including equal rank), the response MUST be `403 INSUFFICIENT_ROLE_RANK`.

### Anonymous Identities

A login for the shared anonymous device identity MUST NOT create a `user_sessions` row and its issued token MUST NOT carry a `sid`.

`JwtStrategy` MUST skip the session/denylist check entirely when `AuthContext.isAnonymous` is true.

Anonymous tokens MUST remain unrevokable and MUST continue to authorize exactly the anonymous permission ceiling, unchanged by this feature.

### Legacy Rows

A token presented without a `sid` claim (minted before migration 0016) MUST be rejected `401` with an error code distinguishable from other 401 causes. No grace period and no legacy-token bypass MAY be implemented — this applies at deploy, unconditionally.

The client-side recovery path — re-`POST /api/auth/login` with the stored `device_uuid` on receiving this 401, requiring no credentials — MUST be documented as a requirement of this change even though the client implementation is out of scope.

Pre-0016 `user_sessions` rows MUST be preserved (not deleted) by the migration, and MUST fail the validity predicate on two independent clauses: `refresh_token_hash IS NULL` and `expires_at` backfilled to `created_at` (already past). They MUST be excluded from every session listing.

The eight new columns MUST remain nullable; the migration MUST NOT write a synthetic/placeholder hash into legacy rows.

## Scenarios

#### Scenario: Login creates a session with a shared `sid`

- GIVEN an unauthenticated device with a valid `device_uuid`
- WHEN it calls `POST /api/auth/login`
- THEN a `user_sessions` row is created
- AND the returned access token and refresh token both carry the same `sid`, equal to that row's `id`

#### Scenario: Refresh rotates and the old token dies outside the grace window

- GIVEN an active session whose current refresh token is T1
- WHEN the client calls `POST /api/auth/refresh` with T1, receives T2, and later presents T1 again after the grace window has elapsed
- THEN the first refresh returns `200` with a new pair (T2 differs from T1)
- AND the later replay of T1 is rejected `401`

#### Scenario: In-window replay of the previous token returns the current pair without rotating

- GIVEN a session that just rotated from T1 to T2, with `now() - rotated_at <= sessionRefreshGraceSeconds`
- WHEN the client presents T1 (the immediately-previous token)
- THEN the response is `200` with the **current** pair based on T2
- AND `refresh_token_hash` and `previous_refresh_token_hash` are unchanged
- AND `rotated_at` is not advanced

#### Scenario: Repeated timer replay does not hold the grace window open

- GIVEN a session that rotated from T1 to T2 at time `rotated_at = t0`
- WHEN T1 is replayed twice, once at `t0 + grace/2` (in-window) and again at `t0 + grace + 1s` (out-of-window)
- THEN the first replay returns `200` with the current pair and does not change `rotated_at`
- AND the second replay is rejected `401 SESSION_REUSE_DETECTED` — proving the first replay did not slide the window forward

#### Scenario: A token two generations old revokes even inside the window

- GIVEN a session that has rotated twice (T1 → T2 → T3), so `previous_refresh_token_hash` matches T2 and `now() - rotated_at <= grace`
- WHEN the client presents T1 (two generations behind current)
- THEN the response is `401 SESSION_REUSE_DETECTED`
- AND the session is revoked, including its current token T3

#### Scenario: Reuse outside the window revokes the whole session

- GIVEN a session that rotated from T1 to T2 more than `sessionRefreshGraceSeconds` ago
- WHEN T1 is presented again
- THEN the response is `401 SESSION_REUSE_DETECTED`
- AND T2 (the newest issued token) also stops authorizing further refreshes for that session

#### Scenario: Revoking a session kills its access token immediately

- GIVEN a session with a still-unexpired access token
- WHEN the session is revoked (e.g. via logout)
- THEN the very next request using that access token is rejected
- AND the rejection happens before the token's TTL would otherwise expire

#### Scenario: A user revokes their own session with zero permissions

- GIVEN an authenticated user holding no `sessions` permissions
- WHEN they call `DELETE /api/sessions/:id` for their own session id
- THEN the request succeeds
- AND no `@RequirePermission` or rank check blocks it

#### Scenario: Cross-user revoke — invisible target is 404, out-ranked-visible is 403

- GIVEN an actor whose `SubjectScope` cannot see User X, and a second actor of equal rank who CAN see User Y
- WHEN the first actor calls `DELETE /api/sessions/:id` for a session belonging to User X
- THEN the response is `404`
- WHEN the second actor calls `DELETE /api/sessions/:id` for a session belonging to User Y
- THEN the response is `403 INSUFFICIENT_ROLE_RANK`

#### Scenario: Anonymous device login creates no session row

- GIVEN the shared anonymous device identity
- WHEN it calls `POST /api/auth/login`
- THEN no new `user_sessions` row is created
- AND the returned token carries no `sid`
- AND the token still authorizes the unchanged anonymous permission ceiling

#### Scenario: Concurrent double-refresh from one device resolves through grace, not revoke

- GIVEN a session whose current token T1 is presented by two concurrent refresh requests
- WHEN both requests execute the rotating UPDATE at nearly the same time
- THEN exactly one request's UPDATE matches and rotates to T2
- AND the losing request's attempt to rotate T1 (now `previous_refresh_token_hash`) resolves via the benign-retry (grace) path, returning the current pair — it does NOT trigger `SESSION_REUSE_DETECTED`

#### Scenario: A pre-0016 legacy row is treated as invalid

- GIVEN a `user_sessions` row created before migration 0016, with `refresh_token_hash IS NULL`
- WHEN migration 0016 runs and backfills `expires_at = created_at`
- THEN the row fails the validity predicate on both the NULL-hash clause and the expired clause
- AND the row does not appear in any session listing
- AND no live token can reference it (D7 rejects every pre-0016 token at the gate)

## Acceptance Criteria

- [ ] Login on device A and device B, then `DELETE /api/sessions/{A}`: A's access token 401s on the very next request (no TTL wait), A's refresh token 401s, and B's access and refresh tokens both keep working.
- [ ] `POST /api/auth/refresh` returns a new `refresh_token`, and the previous one 401s outside the grace window.
- [ ] Replaying the immediately-previous refresh token inside the grace window returns `200` with the current pair, rotates nothing, revokes nothing, and does not advance `rotated_at`.
- [ ] The same replay after the grace window returns `401 SESSION_REUSE_DETECTED` and revokes the session, including the newest issued token.
- [ ] A refresh token two rotations old is rejected and revokes the session even inside the window.
- [ ] Replaying the previous token repeatedly on a timer does not hold the window open — an attempt after `rotated_at + grace` revokes, proving grace hits never slide `rotated_at`.
- [ ] With `SESSION_REFRESH_GRACE_SECONDS=0`, behaviour is exactly unmitigated reuse detection (any replay revokes).
- [ ] A refresh token whose `sid` belongs to another user is rejected even though its signature is valid.
- [ ] `POST /api/auth/logout` revokes the caller's own session; the token used to call it is dead on the next request.
- [ ] `GET /api/users/me/sessions` lists only the caller's sessions, excludes revoked/expired/legacy rows, and never returns a hash.
- [ ] A user revokes their own session while holding zero `sessions` permissions.
- [ ] `DELETE /api/sessions/:id` for a user in another organization returns 404; for a same-org user of equal-or-higher rank, 403 `INSUFFICIENT_ROLE_RANK`.
- [ ] A token minted before 0016 (no `sid`) is rejected 401 with a distinguishable error code.
- [ ] An anonymous-device login creates no `user_sessions` row and its token still authorizes the anonymous ceiling unchanged.
- [ ] After 0016, pre-existing `user_sessions` rows still exist, have `expires_at = created_at`, and appear in no listing.
- [ ] Every pre-existing test passes unmodified except the 3 fan-out specs deleted with their subject and the `refresh()` specs whose contract intentionally changed; e2e stays at baseline (104/104) plus the new suite.
</content>
