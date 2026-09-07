# Tasks: T3.6 Invitations — Email + Password Identity (Variante B)

Source: `proposal.md` (#463), `specs/invitations-lifecycle/spec.md` (#465), `design.md` (#466).
Baseline to preserve: unit 614/614, e2e 122/122 (T3.9 archived). Strict TDD — red test first on
every behavioral item below. Run the full suite once before Phase 1 and once after Phase 9.

## Corrections to the Task Brief (verified against current code, 2026-08-18)

| Brief said | Reality in this repo | Correction |
|---|---|---|
| `MAIL_APP_BASE_URL` new env var | `.env.example` already has `FRONTEND_BASE_URL` for exactly this purpose | reuse `FRONTEND_BASE_URL`; add `appBaseUrl` to `MailConfig`, no duplicate var |
| `POST /invitations`, `GET /invitations/:token`, `GET /admin/invitations/pending` | `spec.md` locks `POST /api/admin/users/invite`, `GET /api/invitations/preview?token=`, `GET /api/invitations/pending`, `DELETE /api/invitations/:id` | spec.md routes win — task brief's paths were a paraphrase |
| `@RequirePermission('invitations', 'CREATE')` | decorator signature is `RequirePermission(action, resource?)` (`require-permission.decorator.ts:17`) — every existing caller passes action first | `@RequirePermission('CREATE', 'invitations')` |
| `SessionsRepository.revokeAllForUser` "queries denylist ... writes to denylist" | `SessionsRepository` never touches Redis (T3.9 §8 — repo is DB-only, `RevocationCache` fan-out lives in `AuthService`) | repo method returns ALL revoked rows via SQL only; `AuthService.revokeAllForUser` does the `RevocationCache.revoke()` fan-out (D6) |
| implicit "reuse `firstUpdatedRow`" for bulk revoke | `firstUpdatedRow` returns `rows[0]` only — silently drops rows 2..N of a multi-row `UPDATE ... RETURNING` | new `updatedRows<T>()` helper returning the full array, `firstUpdatedRow` unchanged for single-row callers |

## Phase 0: Config & Constants

- [x] 0.1 `backend/src/config/mail.config.ts`: add `appBaseUrl: string` sourced from
      `process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000'` to `MailConfig` (no new env var —
      see Corrections table).
- [x] 0.2 `backend/src/config/auth.config.ts`: add `bcryptCost: number` from env `BCRYPT_COST`
      (default `12`); add `passwordMinLength: number` default `12` (spec: "a length floor",
      recommendation ≥12, no composition rules). Add `BCRYPT_COST=12` to `.env.example` under
      `# ---- Auth ----`.
- [x] 0.3 Add `bcrypt` + `@types/bcrypt` to `backend/package.json`.
- [x] 0.4 Create `backend/src/modules/auth/auth-errors.ts` (mirrors `session-errors.ts` pattern):
      `INVALID_CREDENTIALS`, `INVALID_CREDENTIAL_SHAPE`, `INVALID_TOKEN`, `EMAIL_ALREADY_CLAIMED`.
- [x] 0.5 Create `backend/src/modules/invitations/invitation-errors.ts`: `INVITATION_NOT_FOUND`,
      `INVITATION_ALREADY_USED`, `INVITATION_EXPIRED`, `RESET_TOKEN_CONSUMED`, `RESET_TOKEN_EXPIRED`
      (reuse `INSUFFICIENT_ROLE_RANK` from `assert-can-manage.ts`, add `OUT_OF_SCOPE_ORGANIZATION`).

## Phase 1: Migrations

- [x] 1.1 Create `database/migrations/0017_users_password_identity.sql` — verbatim per design:
      `ADD COLUMN IF NOT EXISTS password_hash char(60)`; `ALTER COLUMN device_uuid DROP NOT NULL`
      on `users` AND `user_sessions` (0006:29 was `NOT NULL` — without this every password login
      500s on the session INSERT); `users_device_uuid_key` KEPT (D7 — UNIQUE tolerates many NULLs);
      guarded by a `0010 applied` precondition.
- [x] 1.2 Create `database/rollback/0017_users_password_identity.DOWN.sql` — drop `password_hash`;
      restore both `SET NOT NULL`, failing loudly (not inventing a UUID) if any `device_uuid IS
      NULL` row exists on either table.
- [x] 1.3 Create `database/migrations/0018_invitations.sql` — `invitations` + `password_reset_tokens`
      tables exactly per design SQL (2-column `permissions` INSERT, no `description`; `accepted_at`/
      `invited_by_user_id` naming, not `used_at`/`created_by_user_id`); 3 permission rows
      (`invitations` × CREATE/READ/DELETE — no UPDATE, no `password-reset` row since that endpoint
      is unauthenticated by definition); role-matrix append to `admin_sistema`/`admin_organizacion`;
      guarded by `admin_sistema` role existing (0015).
- [x] 1.4 Create `database/rollback/0018_invitations.DOWN.sql` — drop `password_reset_tokens` before
      `invitations` (FK order), remove the 3 permission rows and the role-matrix append.
- [x] 1.5 Apply 0017 + 0018 to local dev Postgres twice each (idempotence); confirm existing
      `users`/`user_sessions` rows survive unchanged, `password_hash IS NULL` everywhere.
- [x] 1.6 Register 0017/0018 in `database/MIGRATION_LOG.md` (status Pending until applied to
      Supabase).

## Phase 2: Entity & Repository Infrastructure

- [x] 2.1 `backend/src/entities/user.entity.ts`: `deviceUuid!: string | null` (drop the implicit
      non-null), add `@Column({ name: 'password_hash', type: 'char', length: 60, nullable: true })
      passwordHash!: string | null;`.
- [x] 2.2 `backend/src/entities/user-session.entity.ts`: `deviceUuid` becomes `string | null` to
      match 0017's `ALTER TABLE user_sessions`.
- [x] 2.3 Create `backend/src/entities/invitation.entity.ts` mapping all 0018 `invitations` columns.
- [x] 2.4 Create `backend/src/entities/password-reset-token.entity.ts` mapping all 0018
      `password_reset_tokens` columns.
- [x] 2.5 Create `backend/src/modules/invitations/invitations.repository.ts` (raw SQL via
      `@InjectDataSource`, house convention — precedent `SessionsRepository`): `insertPending`,
      `findPreviewByHash` (join `roles`/`organizations`/`users` for inviter name), `redeemCas` (D3
      CAS `UPDATE ... WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at > now() RETURNING
      ...`), `findDiagnosisByHash` (404-vs-410 SELECT when CAS returns 0 rows), `findByClaimedEmail`
      (409 pre-check), `deleteIfPending`.
- [x] 2.6 Create `backend/src/modules/auth/password-reset.repository.ts`: `insert`, `casConsume`
      (same CAS shape on `used_at`), `findDiagnosisByHash`.
- [x] 2.7 `backend/src/modules/sessions/sessions.repository.ts`: add `updatedRows<T>()` helper
      (returns the full `[rows]` array, unlike `firstUpdatedRow`'s `rows[0]`) and
      `revokeAllForUser(userId): Promise<Array<{ id: string; expires_at: Date | null }>>` —
      `UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND
      expires_at > now() RETURNING id, expires_at`. DB-only — no Redis here (see Corrections table).

## Phase 3: Core Services

- [x] 3.1 Create `backend/src/modules/auth/token-codec.ts`: `generateToken()` (32 random bytes →
      base64url for the email link), `decodeTokenOrThrow(token)` (base64url decode + length check,
      `400 INVALID_TOKEN` on malformed). Reuses `sha256Hex`/`timingSafeEqualHex` from
      `common/crypto/session-hash.ts` verbatim — D4, no new hash primitives.
- [x] 3.2 Create `backend/src/modules/auth/password-hasher.ts` (`PasswordHasher`, injectable): cost
      from `authConfig.bcryptCost` (config-driven — tests override to 4, prod default 12, never a
      hardcoded literal), `hash(password)`, `verify(password, hash)`, exported `DUMMY_HASH` (a real
      bcrypt hash of a fixed constant string, computed once at cost-config time) for D9 timing
      equalization on unknown-email / null-`password_hash` logins.
- [x] 3.3 Create `backend/src/modules/auth/credential-dispatch.ts`: `resolveCredential(dto):
      Credential` — pure, table-tested (D1/D2), throws `400 INVALID_CREDENTIAL_SHAPE` on zero or
      two of `{device_uuid}` / `{email,password}` present.
- [x] 3.4 Create `backend/src/common/authz/assert-can-invite.ts`: `assertCanInvite(actor,
      organizationId, invitedRoleName)` — org-scope check that throws `403
      OUT_OF_SCOPE_ORGANIZATION` (NOT 404 — D10: the actor supplied the org id itself, so hiding it
      would only confuse) mirroring `isVisibleUnderScope`'s org/org_assigned/global cases, then
      `assertCanGrantRole(actor, invitedRoleName)` for the rank check.
- [x] 3.5 Create `backend/src/modules/invitations/invitations.service.ts`: `createInvitation` (409
      `EMAIL_ALREADY_CLAIMED` pre-check on `users.email`, role/org existence checks, `assertCanInvite`,
      `insertPending`, `token-codec.generateToken`, `MailService.enqueue('invitation', ...)` — D11,
      returns 201 on enqueue, never on delivery), `previewInvitation` (hash lookup, 404/410
      diagnosis, no consumption), `redeem` (D3: CAS-first-diagnose-second inside
      `dataSource.transaction`, `INSERT users (email, password_hash, role_id, organization_id,
      permissions, is_active)` copying `role.permissions` — mirrors `RolesService.assignRole`'s copy
      pattern — catch SQLSTATE `23505` on the email unique index → `409 EMAIL_ALREADY_CLAIMED`, tx
      rolls back so `accepted_at` is released and the token stays usable; `issueSession` called
      OUTSIDE the tx, after commit), `listPending`, `deletePending`.
- [x] 3.6 Create `backend/src/modules/auth/password-reset.service.ts`: `requestReset(email)` (silent
      miss per D9 — always resolves, no exception, 32-byte token + hash INSERT + `enqueue` only on a
      hit), `confirmReset(token, newPassword)` (CAS on `used_at` inside one transaction with the
      `password_hash` UPDATE, then `AuthService.revokeAllForUser(userId)` AFTER commit).

## Phase 4: Auth Service Refactor

- [x] 4.1 `backend/src/modules/auth/auth.service.ts`: extract `private issueSession(user, deviceUuid:
      string | null, meta)` — lift the `sid`/sign/hash/`SessionsRepository.create` block (current
      lines ~127-144) verbatim; `login()`'s tail calls it. RED gate: run the EXISTING
      `auth.service.spec.ts` `login` describe block unmodified first — it must still pass byte-for-
      byte before any new code is written (regression gate, D1).
- [x] 4.2 Add `AuthService.loginWithPassword({ email, password, deviceUuid }, meta)`: `SELECT ...
      WHERE email = $1`, `bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)` — ALWAYS
      compared, never short-circuited on a missing user (D9 timing equalization) — `401
      INVALID_CREDENTIALS` on mismatch, missing user, or `isActive === false`; else
      `issueSession(user, deviceUuid ?? null, meta)`. Never anonymous.
- [x] 4.3 Add `AuthService.revokeAllForUser(userId)`: `sessionsRepository.revokeAllForUser(userId)`
      → `revocationCache.revoke(id, ttl)` per returned row, TTL computed exactly as
      `revokeSession` does. D5: spares nobody, including the caller's own `sid` — one code path, one
      invariant (`findActiveByUser(userId)` returns `[]` after any password write).
- [x] 4.4 D8 null guards: `getPermissions(deviceUuid: string | null)` returns `[]` immediately when
      `null` (password-only users resolve permissions via `getAuthContextByUserId(userId)` only —
      never the device-keyed cache key, preventing the `perm:v3:null` cross-user collision named in
      the proposal); `getMe(userId)` return type widens to `{ deviceUuid: string | null,
      permissions }`; `invalidatePermissionCache(userId, deviceUuid: string | null)` skips the
      device-keyed `cache.del` when `deviceUuid` is `null`. `getAuthContextByUserId` needs no change
      (already `null !== 'anonymous'`, per design).
- [x] 4.5 Add `AuthService.changePassword(userId, currentPassword, newPassword)`: load user, `401
      INVALID_CREDENTIALS` if `bcrypt.compare(currentPassword, user.password_hash ?? DUMMY_HASH)`
      fails, else update `password_hash` then `revokeAllForUser(userId)` (D5 — spares nobody,
      including the calling session; UI must say "you will be signed out everywhere").

## Phase 5: Auth Controller, DTOs, Routes

- [x] 5.1 Rewrite `backend/src/modules/auth/dto/login.dto.ts`: one class, 3 optional fields
      (`device_uuid`, `email`, `password`) + a class-level `@ExactlyOneCredential()` custom
      validator → `400 INVALID_CREDENTIAL_SHAPE` on none/both (D2 — `forbidNonWhitelisted: true` at
      `main.ts:30` means `{email,password}` 400s today unless the DTO widens). `{device_uuid}` alone
      MUST remain valid — every one of the 122 e2e tests sends exactly that shape.
- [x] 5.2 Create `backend/src/modules/auth/dto/accept-invitation.dto.ts`: `{ token: string, password:
      string }` with `@MinLength(authConfig.passwordMinLength)` (12).
- [x] 5.3 Create `backend/src/modules/auth/dto/password-reset-request.dto.ts`: `{ email: string
      (@IsEmail()) }`.
- [x] 5.4 Create `backend/src/modules/auth/dto/password-reset-confirm.dto.ts`: `{ token: string,
      password: string (@MinLength(12)) }`.
- [x] 5.5 Create `backend/src/modules/auth/dto/change-password.dto.ts`: `{ current_password: string,
      new_password: string (@MinLength(12)) }`.
- [x] 5.6 `auth.controller.ts` `login()`: call `resolveCredential(dto)`, dispatch to
      `authService.login(deviceUuid, meta)` or `authService.loginWithPassword(...)`. Device branch
      diff must be exactly "the tail moved into a private method" — no other change.
- [x] 5.7 Add `POST /api/auth/accept-invitation` → `InvitationsService.redeem(token, password)`,
      `201`, returns `AuthTokens`.
- [x] 5.8 Add `POST /api/auth/password-reset` → `PasswordResetService.requestReset(email)`,
      `@HttpCode(202)` always, regardless of whether the email matches (D9 — corrects the brief's
      "404 if not found", itself an enumeration oracle).
- [x] 5.9 Add `POST /api/auth/password-reset/confirm` → `PasswordResetService.confirmReset(token,
      password)`, `200`.
- [x] 5.10 Add `PUT /api/auth/password` (`@UseGuards(JwtAuthGuard)`, no `PermissionGuard` — SELF-only
      per spec, mirrors T3.9's self-session-revoke bypass) → `AuthService.changePassword(userId,
      current_password, new_password)`.
- [x] 5.11 `GET /api/auth/me` return type widens to `{ user_id, device_uuid: string | null,
      permissions }` — public response-contract change, non-breaking (no existing e2e asserts a
      non-null value for a not-yet-possible password-only user).
- [x] 5.12 `auth.module.ts`: `imports: [..., InvitationsModule, MailModule]` (`PasswordResetService`
      lives in `auth/` per design — its only consumer is `AuthController`, but it needs
      `MailService`).

## Phase 6: Invitations Controller & Routes

- [x] 6.1 Create `backend/src/modules/invitations/dto/create-invitation.dto.ts`: `{ email
      (@IsEmail()), role_id (@IsUUID()), organization_id (@IsUUID(), optional) }`.
- [x] 6.2 Create `backend/src/modules/invitations/invitations.controller.ts` (`@Controller()`, no
      class-level prefix — routes span two path families per spec.md, see Corrections table):
      `@Post('admin/users/invite')` (`@UseGuards(JwtAuthGuard, PermissionGuard)`,
      `@RequirePermission('CREATE', 'invitations')`); `@Get('invitations/pending')`
      (`@RequirePermission('READ', 'invitations')`); `@Delete('invitations/:id')`
      (`@RequirePermission('DELETE', 'invitations')`); `@Get('invitations/preview')` — NO guards,
      public by design. Declare `invitations/pending` and `invitations/preview` BEFORE
      `invitations/:id` (same static-vs-dynamic route-order gotcha as `geo-zones` `GET /tree`) so
      the literal segments are never swallowed by the `:id` param.
- [x] 6.3 Create `backend/src/modules/invitations/invitations.module.ts`: providers
      `InvitationsRepository`, `InvitationsService`, `InvitationsController`; `imports: [MailModule]`;
      `exports: [InvitationsService]`. Leaf-ish edge: does NOT import `AuthModule` (avoids a cycle
      with 5.12's `AuthModule → InvitationsModule` edge).
- [x] 6.4 `backend/src/app.module.ts`: register `InvitationsModule`.
- [x] 6.5 `backend/src/modules/users/users.service.ts`: audit every `deviceUuid` read for the D8
      null-tolerance contract (this task implements the fix; 9.x re-verifies via grep).

## Phase 7: Mail & Templates

- [x] 7.1 `backend/src/modules/mail/templates/mail-templates.ts`: extend `TemplateName` with
      `'invitation'` | `'password-reset'`; both bodies built from `field()`-escaped data only,
      linking to `${appBaseUrl}/accept-invitation?token=...` (48h expiry message) and
      `${appBaseUrl}/reset-password?token=...` (24h expiry, no password hint) — the token string
      itself must be escaped via `field()` like every other interpolated value.
- [x] 7.2 `InvitationsService.createInvitation` / `PasswordResetService.requestReset`: build the
      subject line inline (precedent: `IncidentMailListener.subjectFor`) and call
      `MailService.enqueue({ to, subject, template, data })`.
- [x] 7.3 Unit test `renderMailTemplate('invitation', ...)` / `('password-reset', ...)` render
      escaped HTML with no unescaped token/email injection.

## Phase 8: Testing

- [x] 8.0 Run full existing suite (`npm test`, `npm run test:e2e` from `backend/`); record baseline
      614/614 unit, 122/122 e2e before writing a single new test.
- [x] 8.1 Unit: `resolveCredential` — device / password / neither / both (table-driven, pure).
- [x] 8.2 Unit: `PasswordHasher` — round-trip, `DUMMY_HASH` verifies false against any real password,
      cost is read from config (assert cost 4 is honored under a test override, never a hardcoded
      12).
- [x] 8.3 Unit: `AuthService.loginWithPassword` — unknown email, null `password_hash`, inactive user,
      success; assert `bcrypt.compare` is invoked on every branch (the timing-equalization assertion,
      not a comment).
- [x] 8.4 Unit: `AuthService.login` device path — run the EXISTING spec unmodified (see 4.1); this is
      the regression gate for the `issueSession` extraction, not a new test.
- [x] 8.5 Unit: `InvitationsService` — 404-vs-410 diagnosis, `assertCanInvite` rank/scope matrix,
      claimed-email 409 pre-check. Mocked repository.
- [x] 8.6 Unit: `PasswordResetService` — silent-miss request, confirm CAS, token reuse → 410, bulk
      revoke delegated to `AuthService.revokeAllForUser`. Mocked repository.
- [x] 8.7 Unit: `token-codec` (`generateToken`/`decodeTokenOrThrow`) — pure.
- [x] 8.8 Integration (Testcontainers Postgres): `SessionsRepository.revokeAllForUser` — N active + 1
      already-revoked + 1 expired row → returns exactly the N active ones, unwrapped via
      `updatedRows`, never `firstUpdatedRow`.
- [x] 8.9 Integration (Testcontainers Postgres, real concurrency): `InvitationsService.redeem` CAS —
      `Promise.all` of two `redeem()` calls on one token → exactly one `201` + one `users` row, one
      `410 INVITATION_ALREADY_USED`.
- [x] 8.10 Integration (Testcontainers Redis): `MailService.enqueue` puts `invitation` /
      `password-reset` on `mail:outbox` with a rendered, escaped body.
- [x] 8.11 E2E (`backend/test/e2e/invitations.e2e-spec.ts`): full flow — invite → preview → accept
      with password → login device A → login device B (2 live `user_sessions` rows) → password reset
      from device B → device A's next request `401 SESSION_REVOKED` → device A re-login.
- [x] 8.12 E2E: expiry via SQL `UPDATE` in test setup only (`expires_at`/`accepted_at`/`used_at`
      backdated directly — never `sleep`/clock injection, house rule); expired invite → `410` at
      preview and at `accept-invitation`.
- [x] 8.13 E2E: concurrent redemption (`Promise.all`, two requests, same token) → one `201`, one `410
      INVITATION_ALREADY_USED`, never `409`.
- [x] 8.14 E2E: invalid tokens — unknown → `404` at preview, malformed base64url → `400
      INVALID_TOKEN`, reused → `410`.
- [x] 8.15 E2E: duplicate invitation to an already-claimed email → `409` at creation, no row created.
- [x] 8.16 E2E: unauthorized/malformed invite creation → `403` (no `invitations:CREATE`) and `422`
      (malformed email) — no `invitations` row in either case.
- [x] 8.17 E2E: `PUT /auth/password` — wrong `current_password` → `401`; success revokes every
      session including the caller's own (D5 — next request on the SAME token also `401`).
- [x] 8.18 Add `test-environment.ts` helpers: `provisionPasswordUser(email, password)`,
      `backdateInvitation(id, secondsAgo)` / `backdateResetToken(id, secondsAgo)` via SQL `UPDATE`.
- [x] 8.19 Regression: run the FULL suite once more; confirm all 122 pre-existing e2e tests pass
      unmodified (device path untouched) — any pre-existing test needing an edit is a design bug,
      not a task to "fix".

## Phase 9: Verification Obligations

- [x] 9.1 `grep -rn "password_hash" backend/src` — confirm no plaintext password is ever logged,
      returned in a DTO, or compared with `===`.
- [x] 9.2 `grep -rn "user_sessions" backend/src` — confirm the only writers remain
      `sessions/sessions.repository.ts` and `entities/user-session.entity.ts` (T3.9 invariant,
      unchanged by this capability).
- [x] 9.3 Confirm every `password_hash` write (`redeem`, `confirmReset`, `changePassword`) is
      immediately followed by a `revokeAllForUser` call in the same service method.
- [x] 9.4 `grep -rn "setTimeout\|sleep(" backend/test/e2e/invitations.e2e-spec.ts` — zero matches;
      all expiry cases use SQL `UPDATE`.
- [x] 9.5 `grep -rn "bcrypt.compare\|bcrypt.hash" backend/src` — confirm every password comparison
      goes through `PasswordHasher`/`bcrypt.compare`, never a raw `===` on `password_hash`.
- [x] 9.6 `grep -rn "\.deviceUuid" backend/src/modules/{auth,users,realtime}` — confirm every read
      site (`getPermissions`, `getMe`, `invalidatePermissionCache`, `events.gateway.ts`) tolerates
      `null` per D8; no stringly-typed `perm:v3:null` key is reachable.

## Implementation Order

Sequential, each phase gates the next: 0 (config) → 1 (migrations) → 2 (entities/repos) → 3 (core
services) → 4 (AuthService refactor, gated on 4.1's regression check) → 5 + 6 (controllers, can run
in parallel with each other once 3-4 land — both only depend on services, not on each other) → 7
(mail templates, depends on 3.5/3.6's `enqueue` calls existing) → 8 (testing, strictly last) → 9
(grep verification, closes the loop). Total 75 tasks.
