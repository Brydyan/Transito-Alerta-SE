# Invitations & Password Identity Lifecycle Specification

## Purpose

Give every invited user a durable, multi-device identity — email + password, bootstrapped by a single-use 48h invitation link and recoverable via a single-use 24h reset token — replacing `device_uuid` as the sole account identity while leaving the existing anonymous device-login path unchanged.

## Scope Summary

**In scope**
- Migration `0017_users_password_identity.sql` — `users.password_hash CHAR(60) NULL`, `device_uuid` relaxed to nullable (+ `.DOWN.sql`).
- Migration `0018_invitations.sql` — `invitations`, `password_reset_tokens`, `invitations` permission catalog rows + role-matrix append (+ `.DOWN.sql`).
- New capability `invitations`: `InvitationsRepository`, `InvitationsService`, `InvitationsController` — create, preview, list-pending, delete, redeem.
- New capability `password-identity`: `PasswordResetService`, `PasswordResetTokenRepository`, bcrypt verification inside `AuthService.login`.
- Modified capability `session-lifecycle` (T3.9): adds `SessionsRepository.revokeAllForUser()` and the `DELETE /api/users/:id/sessions`-shaped bulk-revocation trigger, deliberately deferred by T3.9.
- Auth endpoints: `POST /api/auth/accept-invitation`, `POST /api/auth/password-reset`, `POST /api/auth/password-reset/confirm`, `PUT /api/auth/password`.
- Admin endpoints: `POST /api/admin/users/invite`, `GET /api/invitations/pending`, `GET /api/invitations/preview` (unauthenticated), `DELETE /api/invitations/:id`.
- Mail templates `invitation` and `password-reset` (T3.5 outbox), covering the invite-send and forgot-password-request flows; redemption and reset-confirm complete synchronously with no further email.
- `bcrypt` (cost 12) for password hashing; SHA-256 + `timingSafeEqual` for both token families, reusing `common/crypto/session-hash`.

**Out of scope**
- MFA/TOTP, OAuth/Firebase, device-bind re-registration flow, password policy beyond a length floor, login rate-limiting/lockout, removing the device-UUID login path, any frontend work.

**Not additive — read before verifying**: `AuthService.login()`'s signature changes to a two-branch credential-type dispatcher and `LoginDto` becomes a union (`DeviceLoginDto | CredentialLoginDto`). The `{device_uuid}` branch's behavior, validation, error codes, and return shape MUST remain byte-identical to pre-T3.6 — this identity is the regression gate, not a target of this change. Everything else in this spec (tables, services, endpoints, permission rows, bulk revocation) is purely additive. Baseline before T3.6 (T3.9 archived): **unit 614/614, e2e 122/122**, both MUST pass unmodified. Expected after T3.6: unit ≈700 (+≈86 new-service/password-logic tests), e2e ≈150 (+≈28 auth+invitation-flow tests) — this delta is net-new coverage, not edited pre-existing tests.

## Requirements

### Invitation Record

The system MUST persist one `invitations` row per invite: `id, email, role_id, organization_id, token_hash, expires_at, accepted_at, invited_by_user_id, created_at`. `token_hash` MUST be a SHA-256 hex digest — the only representation of the token ever stored; the plaintext token MUST be emailed exactly once and MUST NOT be persisted anywhere.

`expires_at` MUST be computed at creation as `created_at + 48 hours` and MUST NOT be adjustable per-invite. `accepted_at` MUST be `NULL` until redemption and MUST be the single source of "used" state — no separate boolean column.

`password_reset_tokens` MUST follow the same shape: `id, user_id, token_hash (SHA-256), expires_at (created_at + 24h), used_at (NULL until confirmed)`.

### Invitation Lifecycle

`POST /api/admin/users/invite` MUST persist an invitation row and queue the `invitation` mail template via the existing outbox. A request targeting an email already present with a non-NULL `users.email` (already claimed) MUST reject `409` at creation time — before any token is generated.

`GET /api/invitations/preview?token=` MUST be reachable without authentication, MUST NOT consume the token, and MUST return org/inviter/role/expiry for a live token, `404` for an unknown token hash, and `410` for an expired or already-accepted one — never a fake-active payload for a dead token.

`POST /api/auth/accept-invitation {token, password}` MUST redeem atomically via a single compare-and-swap write — `UPDATE invitations SET accepted_at = now() WHERE token_hash = $hash AND accepted_at IS NULL AND expires_at > now()` — in the same transaction that creates/updates the `users` row (`email`, `password_hash`, `role_id`, `organization_id`) and mints a session through `issueSession()`. When two requests race on one token, exactly one CAS MUST match; the losing request MUST receive `410 INVITATION_ALREADY_USED`, never `409`.

`DELETE /api/invitations/:id` MUST revoke a pending (unaccepted) invitation before redemption.

### Password Identity

`password_hash` MUST be bcrypt cost **12**, `CHAR(60)`, `NULL` for device-only accounts.

`AuthService.login()` MUST dispatch on request shape: `{device_uuid}` → the pre-existing find-or-create path, untouched; `{email, password}` → bcrypt-compare against `password_hash`, converging on the same `issueSession()` call used by every other login path. An unknown email and a known email with a wrong password MUST produce an identical response (status + body) — no user enumeration.

`POST /api/auth/password-reset {email}` MUST always respond `202` regardless of whether the email matches an account, and MUST email a single-use 24h token only when it does.

`POST /api/auth/password-reset/confirm {token, password}` MUST redeem via CAS (`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $hash AND used_at IS NULL AND expires_at > now()`), set the new `password_hash`, and unconditionally invoke bulk session revocation for that user.

`PUT /api/auth/password` (authenticated) MUST require the caller's current password before accepting a new one.

### Multi-device Sessions

A user MAY hold N concurrent `user_sessions` rows, one per device/login, per T3.9's existing session model — unchanged by this capability.

The system MUST implement `SessionsRepository.revokeAllForUser(userId)`: in one operation, sets `revoked_at` and writes a denylist entry for every currently-valid session belonging to that user.

`revokeAllForUser` MUST be invoked unconditionally on every `password-reset/confirm`. It MAY be invoked from `PUT /api/auth/password`, optionally sparing the calling session's `sid` (left to design).

After bulk revocation, every other live session's next authenticated request MUST fail immediately — access token via the denylist check, refresh token via the DB validity check — never merely at TTL expiry, mirroring T3.9's single-session revocation guarantee.

### Authorization

`POST /api/admin/users/invite` MUST require `invitations:CREATE` AND `assertCanManage(actor, targetOrgScope)` — an out-of-scope target org MUST 404, a visible-but-not-outranked target MUST 403 `INSUFFICIENT_ROLE_RANK`, identical to T3.2/T3.9's existing scope+rank machinery.

`GET /api/invitations/pending` and `DELETE /api/invitations/:id` MUST require `invitations:READ` / `invitations:DELETE` respectively, scoped identically.

Password reset and authenticated password change MUST be **SELF-only** — no permission and no rank check gates a user acting on their own credential, mirroring T3.9's self-session-revoke rule.

`GET /api/invitations/preview` MUST require no authentication and no permission — it is the pre-account bootstrap step and MUST remain public by design.

### Email Verification

The system MUST NOT implement a separate email-verification step. Reaching `POST /api/auth/accept-invitation` with a live token IS the verification — no `email_verified_at` column or endpoint MAY be introduced by this change.

### Error Handling

An unknown invitation or reset token (no row matches its hash) MUST `404`. An expired or already-consumed token presented at redemption/confirm MUST `410` (`INVITATION_ALREADY_USED` / `RESET_TOKEN_ALREADY_USED`) — distinct from the unauthenticated-preview `404`.

A duplicate invitation to an already-claimed email at creation time MUST `409`. Malformed payloads (invalid email, missing password, password under the length floor) MUST `400`.

Every token comparison at redemption/confirm MUST use `timingSafeEqual` on the SHA-256 hash (reusing `common/crypto/session-hash`) — never a raw DB equality comparison exposed to timing.

## Scenarios

#### Scenario: Admin invites, user previews, accepts, and logs in

- GIVEN an admin holding `invitations:CREATE` in scope
- WHEN they call `POST /api/admin/users/invite` for a new email, the invitation email is delivered, and the recipient calls `GET /api/invitations/preview?token=` then `POST /api/auth/accept-invitation {token, password}`
- THEN the response contains a live access/refresh pair
- AND `users.email` and `users.password_hash` are set, `invitations.accepted_at` is non-NULL

#### Scenario: Password reset from a different device forces re-login everywhere else

- GIVEN a user logged in on device A with an active session, and no session yet on device B
- WHEN they request a reset on device B, confirm it with a new password, and device A makes its next authenticated request
- THEN device B's confirm returns `200` with the new password active
- AND device A's next request is rejected `401`

#### Scenario: Concurrent redemption of one invitation token — exactly one wins

- GIVEN a single valid, unaccepted invitation token
- WHEN two `POST /api/auth/accept-invitation` requests race with the same token
- THEN exactly one receives a live session and `accepted_at` set
- AND the other receives `410 INVITATION_ALREADY_USED`

#### Scenario: Invalid or expired tokens are rejected without leaking state

- GIVEN a token that does not exist, and a second token that expired 49 hours ago
- WHEN each is presented to `GET /api/invitations/preview`
- THEN the unknown token returns `404`
- AND the expired token returns `410`
- WHEN the expired token is presented to `POST /api/auth/accept-invitation`
- THEN the response is `410`

#### Scenario: Same user, two devices, two live sessions, selective revoke

- GIVEN one user with credentials
- WHEN they log in from device A and device B
- THEN `user_sessions` has two rows for that user, both valid
- WHEN device A's session is revoked via `DELETE /api/sessions/:id`
- THEN device A's next request is `401` and device B continues to work

#### Scenario: Password change revokes every other session immediately

- GIVEN a user with active sessions on devices A and B
- WHEN device A confirms a password reset
- THEN `revokeAllForUser` executes for that user
- AND device B's very next authenticated request is rejected `401 SESSION_REVOKED`, not at TTL expiry

#### Scenario: Invalid invite creation is rejected before any token exists

- GIVEN an actor lacking `invitations:CREATE`, and separately a valid actor submitting a malformed email
- WHEN each calls `POST /api/admin/users/invite`
- THEN the unauthorized actor receives `403`
- AND the malformed-email request receives `400`
- AND no `invitations` row is created in either case

#### Scenario: Token reuse is rejected after first use

- GIVEN an invitation already accepted once (`accepted_at` non-NULL)
- WHEN `POST /api/auth/accept-invitation` is called again with the same token
- THEN the response is `410 INVITATION_ALREADY_USED`
- AND no second user row or session is created

#### Scenario: Cross-device password reset kills the other device on its next call

- GIVEN a user authenticated on device B and issuing a reset request from device A
- WHEN device A completes `password-reset/confirm`
- THEN device B's next call to any authenticated endpoint receives `401`
- AND device B's stored refresh token also fails validity on its next refresh attempt

#### Scenario: Second invitation to an already-claimed email is rejected at creation

- GIVEN a user whose `users.email` is already set from a prior accepted invitation
- WHEN an admin calls `POST /api/admin/users/invite` for that same email
- THEN the response is `409`
- AND no new `invitations` row is created

## Acceptance Criteria

- [ ] Invitation email delivers a link containing a single-use token within 48h validity; only the SHA-256 hash is persisted.
- [ ] `GET /api/invitations/preview` works without authentication; `404` unknown token, `410` expired/consumed.
- [ ] `POST /api/auth/accept-invitation` is atomic — single transaction creates the account, sets the password, marks `accepted_at`, and returns a live session.
- [ ] Same credentials authenticate successfully from a second device; both sessions coexist in `user_sessions`.
- [ ] Password reset delivers a single-use 24h token; confirming it sets a new password and revokes every session belonging to that user.
- [ ] A password change on one device invalidates another device's session on its very next request — never merely at TTL.
- [ ] `POST /api/admin/users/invite` is gated by `invitations:CREATE` + `assertCanManage` scope/rank, identical to T3.2/T3.9's model.
- [ ] All tokens (invitation + reset) are SHA-256-hashed at rest and compared via `timingSafeEqual`.
- [ ] All 122 pre-existing T3.9 e2e tests pass **unmodified** — proof the device-only login path is untouched.
- [ ] `users.email` remains the unique identity column; device-only users retain `email IS NULL`; no `device_uuid` uniqueness constraint remains.
- [ ] Concurrent double-redemption of one invitation token: the losing request receives `410 INVITATION_ALREADY_USED`, never `409`.
- [ ] Unknown email and wrong password produce an identical response at login (no user enumeration).
- [ ] Duplicate invitation to an already-claimed email is rejected `409` at creation, not discovered later at redemption.
- [ ] `npm test && npm run test:e2e` green at the expected post-T3.6 baseline (unit ≈700, e2e ≈150), with the T3.9 614/122 baseline subset passing unmodified.
- [ ] `npm run lint && npm run typecheck && npm run build` clean.
