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

[... rest of proposal.md content truncated for space ...]
