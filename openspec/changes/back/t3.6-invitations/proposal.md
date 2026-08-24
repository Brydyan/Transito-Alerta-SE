# Proposal: T3.6 Invitations — Email + Password Identity (Variante B)

Source: Engram `sdd/t3.6-invitations/explore` (#449). Artifact store: hybrid.
Next free migrations: **0017**, **0018** (0016 taken by T3.9 Sessions).
Port reference (conceptual, not 1:1): `GeoReporta/backend/app/Domains/Auth/**` — CAS redemption,
SHA-256 token hashing, public preview endpoint. Implemented as NestJS services, not ported PHP.

## Intent

`device_uuid` is the only identity column in `users` (`unique`, `not null`) and
`AuthService.login(deviceUuid)` is a find-or-create keyed on it. That makes the device **the
account**: a staff member who loses, wipes, or replaces a phone is locked out with no recovery
path — none is defined anywhere in the codebase. It also makes multi-device impossible by
construction, while T3.9's `user_sessions` is already `user_id`-keyed and supports N concurrent
sessions per user today.

T3.6 introduces the credential that makes those sessions reachable: **email + password**,
bootstrapped by an invitation an admin sends. A staff member receives a link, previews who invited
them and to what org/role, sets a password, and from then on logs in from any device. Device loss
becomes a password reset, not a support ticket.

The bar is not "an invitation row exists". It is: **an invited user can sign in from a second
device, and can recover access from a third after losing the first two.**

## Scope

### In Scope

- Migration `0017_users_password_identity.sql` — `users.password_hash CHAR(60) NULL`,
  `device_uuid` relaxed to `NULL` (identity moves to `email`, which already carries a unique
  partial index from 0010). `+ .DOWN.sql`.
- Migration `0018_invitations.sql` — `invitations` (email, role_id, organization_id,
  `token_hash` SHA-256, `expires_at` **48h**, `accepted_at`, `invited_by_user_id`),
  `password_reset_tokens` (user_id, `token_hash`, `expires_at` 24h, `used_at`),
  `permissions` catalog rows for `invitations` × `CREATE/READ/DELETE`, role-matrix append.
  `+ .DOWN.sql`.
- Entities: `InvitationEntity`, `PasswordResetTokenEntity`; `UserEntity` gains `passwordHash`,
  `deviceUuid` becomes nullable.
- Module `backend/src/modules/invitations/` — repository, service, controller
  (`POST /api/admin/users/invite`, `GET /api/invitations/pending`,
  `GET /api/invitations/preview?token=` **unauthenticated**, `DELETE /api/invitations/:id`).
- `PasswordResetService` + `PasswordResetTokenRepository`; endpoints `POST /api/auth/password-reset`,
  `POST /api/auth/password-reset/confirm`, `PUT /api/auth/password` (authenticated change).
- `POST /api/auth/accept-invitation {token, password}` — atomic CAS
  (`UPDATE ... WHERE accepted_at IS NULL`), sets email + `password_hash` + role + org, returns tokens.
- `AuthService.login` gains a **credential-type dispatch**: `{device_uuid}` → existing path
  untouched; `{email, password}` → bcrypt verify → identical `issueSession()` path.
- `bcrypt` dependency, cost **12**. Token hashing SHA-256 in DB, `timingSafeEqual` in memory
  (reuse `common/crypto/session-hash`).
- **Revoke-all-sessions-for-user**, invoked on every password change/reset.
- Mail templates `invitation` and `password-reset` in `mail/templates/mail-templates.ts` (T3.5).
- Unit specs per service + `backend/test/e2e/invitations.e2e-spec.ts` (invite → preview → accept →
  login device A → login device B → reset → all sessions dead → re-login).

### Out of Scope

- **MFA / TOTP** — open per org policy, not scoped.
- **OAuth / Firebase** — explicitly rejected by `docs/tasks/4-AUTH-INTEGRATION.md`.
- **Device-bind fallback** — `device_uuid` is made nullable *for* it, but no re-bind flow ships here.
- **Password policy beyond a length floor** (breach lists, rotation, history) and rate limiting /
  lockout on failed logins — a hardening task of its own.
- **Removing the device-UUID login path.** Anonymous reporting stays exactly as-is.
- Any frontend work.

## Capabilities

### New Capabilities
- `invitations`: invite creation (permission-gated, scope + rank checked), public preview,
  single-use atomic redemption, expiry, listing, revocation.
- `password-identity`: email+password credential storage, login dispatch, authenticated password
  change, forgot-password reset via single-use emailed token.

### Modified Capabilities
- `session-lifecycle` (T3.9): adds a **bulk revocation** requirement — a password change or reset
  revokes every session of that user. T3.9 deliberately deferred `DELETE /api/users/:id/sessions`;
  this change needs it and pulls it in.

## Approach

Identity moves from "the device is the account" to "the email is the account", with the device
demoted to a nullable audit attribute. `AuthService.login` becomes a two-branch dispatcher — the
branch check is trivial and both branches converge on T3.9's existing `issueSession()`, so the
rotation/reuse-detection machinery stabilized in T3.9 is **reused, not modified**. Invitation
redemption is the only place a `password_hash` is born from nothing; it uses the same
compare-and-swap shape as `SessionsRepository.rotate` (single `UPDATE ... WHERE` predicate, never
read-then-write) so concurrent redemptions of one token cannot both win.

Password reset and invitation share one token shape: random 32 bytes, plaintext emailed once,
SHA-256 stored, constant-time compared. Reset additionally revokes all sessions — a compromised
password must not leave a live refresh chain behind it.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/migrations/0017,0018` | New | password column, nullable device_uuid, 2 tables, permissions |
| `backend/src/entities/user.entity.ts` | Modified | `passwordHash`, nullable `deviceUuid` |
| `backend/src/entities/invitation.entity.ts`, `password-reset-token.entity.ts` | New | — |
| `backend/src/modules/invitations/**` | New | repo + service + controller + DTOs |
| `backend/src/modules/auth/auth.service.ts` | Modified | login dispatch, password verify, `revokeAllForUser` call |
| `backend/src/modules/auth/auth.controller.ts` + `dto/login.dto.ts` | Modified | accept-invitation, reset endpoints, union login DTO |
| `backend/src/modules/sessions/sessions.repository.ts` | Modified | `revokeAllForUser` + denylist fan-out |
| `backend/src/modules/mail/templates/mail-templates.ts` | Modified | 2 templates |
| `backend/src/modules/users/users.service.ts` | Modified | tolerate `deviceUuid === null` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **T3.9 regression.** `AuthService` was just hardened; reopening `login()` touches that surface. | Med | Dispatch is additive — device branch byte-identical, both converge on `issueSession()`. Strict TDD; all 122 existing e2e tests must pass **unmodified** as the gate. |
| **Blast radius of revoke-all.** Changing a password on device B kills device A mid-use. | High (by design) | Intentional and defensive. Design phase decides whether the *authenticated* `PUT /auth/password` spares the calling `sid` (reset-by-token never does). UI must say "you'll be signed out everywhere". |
| **Email collision on redemption.** `users.email` has a unique partial index (0010). Existing device-only rows have `email IS NULL`, so they don't collide — but a second invitation to an already-claimed address 500s at the index if unguarded. | Med | Invite creation rejects an already-claimed email up front with a clear 409; redemption re-checks inside the CAS transaction and maps the unique violation to 409, never a 500. |
| **`device_uuid` NOT NULL → NULL** breaks any code assuming a string. | Med | Grep-audit every `deviceUuid` read (`getPermissions`, `getMe`, `invalidatePermissionCache`, listeners) as an explicit task; permission cache key must not become `perm:v3:null`. |
| bcrypt cost 12 ≈ 100ms/hash under load. | Low | Login is infrequent vs. refresh; measured, not assumed, in the e2e phase. |

## Rollback Plan

1. Revert application code (module is self-contained; `AuthService` dispatch is one guarded branch).
2. Apply `database/rollback/0018_invitations.DOWN.sql` — drops both tables and the permission rows.
3. Apply `database/rollback/0017_users_password_identity.DOWN.sql` — drops `password_hash` and
   restores `device_uuid NOT NULL`. **Blocking precondition**: any row with `device_uuid IS NULL`
   (a password-only user created post-deploy) must be backfilled or deleted first; the DOWN script
   fails loudly rather than inventing UUIDs.
4. Device-UUID login is untouched throughout, so step 1 alone restores full pre-T3.6 behavior.

## Dependencies

- T3.5 Mail (done) — SMTP + Redis Streams outbox delivers both new templates.
- T3.9 Sessions (done, archived) — `issueSession`, `SessionsRepository`, `RevocationCache`.
- T3.1 Roles / T3.2 Organizations (done) — `assertCanManage` for scope + rank checks on invite.
- New npm dependency: `bcrypt` + `@types/bcrypt`.

## Success Criteria

- [ ] Admin with `invitations:CREATE` sends an invite; a non-privileged or out-of-scope caller gets 403 via `assertCanManage`.
- [ ] Invitation email delivers a link containing a single-use token; only the SHA-256 hash is in the DB.
- [ ] `GET /api/invitations/preview` returns org, inviter, role, expiry **without auth**; 404 unknown token, 410 expired/consumed — never a fake-active payload.
- [ ] `POST /api/auth/accept-invitation` atomically creates/updates the user with email + `password_hash` + invited role, marks `accepted_at`, returns a live session. Concurrent redemption of one token: exactly one wins.
- [ ] Expired (>48h) and already-accepted tokens are rejected.
- [ ] Same credentials log in from a second device; both sessions live simultaneously in `user_sessions`.
- [ ] Password reset: emailed single-use token (24h), sets a new password, and **every** session of that user is revoked — old refresh tokens 401 on the next request, not at TTL.
- [ ] Reset token is single-use and rejected after `used_at` is set.
- [ ] Wrong password and unknown email are indistinguishable to the caller (no user enumeration).
- [ ] Anonymous device login and existing device-UUID login behave exactly as before.
- [ ] `npm test && npm run test:e2e` green, including all 122 pre-existing e2e tests **unmodified**.
- [ ] `npm run lint && npm run typecheck && npm run build` clean.

## Deviations from the Original Task Brief

`docs/tasks/1-BACKEND-MIGRATIONS.md:129-142` sized T3.6 at **2-3h / ~200 LOC / 4 tests** for a
device-bind-shaped invitation (Variante A: redemption mints a `device_uuid`). This proposal is
**Variante B** and is deliberately ~10x that: 2 migrations, 5 services/repositories, 4 entities,
7 endpoints, 2 mail templates, ~40-50 tasks, **25-40 hours**. The trade is explicit — a slower ship
(3-4 weeks vs. 1-2 days) in exchange for day-one multi-device support and a device-loss recovery
path, neither of which Variante A can provide without a re-bind flow that is specced nowhere.
