# Design: T3.6 Invitations — Email + Password Identity (Variante B)

Source: `proposal.md` (Engram `sdd/t3.6-invitations/proposal` #463). Artifact store: hybrid.
Baseline: T3.9 Sessions (archived) — `AuthService.login/refresh`, `SessionsRepository`,
`RevocationCache`, `GraceBuffer`. Migrations **0017** + **0018**.

## Architecture Overview

```
POST /api/auth/login  {device_uuid} | {email,password}
   │
AuthController.login ──► resolveCredential(dto)      [pure, table-testable]
   │                        │
   │            ┌───────────┴────────────┐
   │      kind:'device'              kind:'password'
   │            │                        │
   │  AuthService.login(uuid)   AuthService.loginWithPassword(email,pw,deviceLabel?)
   │            │                        │ users WHERE email=$1 (unique partial idx, 0010)
   │            │                        │ bcrypt.compare(pw, password_hash ?? DUMMY_HASH)
   │            └───────────┬────────────┘
   │                        ▼
   │        AuthService.issueSession(user, deviceUuid|null, meta)   ← T3.9 machinery, UNCHANGED
   │                 sid=randomUUID → sign(access,sid) + sign(refresh,sid)
   │                 → sha256Hex → SessionsRepository.create(...)
   │                        ▼
   │              { access_token, refresh_token, permissions }      ← envelope UNCHANGED

POST /api/auth/accept-invitation ──► InvitationsService.redeem  ─┐
POST /api/auth/password-reset/confirm ──► PasswordResetService  ─┤
PUT  /api/auth/password ─────────────────────────────────────────┘
                                    │
                        SessionsRepository.revokeAllForUser(userId)
                        → RevocationCache.revoke(sid, ttl) per row
```

Everything downstream of `issueSession` is T3.9 code executed byte-identically. `refresh()`,
`JwtStrategy.validate`, `revokeSession`, `GraceBuffer`, rotation and reuse detection are **not
touched**.

## Architecture Decisions

| # | Decision | Why not the alternative |
|---|---|---|
| **D1** | **Dispatch lives in the controller** via a pure `resolveCredential(dto)`; `AuthService` keeps `login(deviceUuid, meta)` with its exact current signature and gains a sibling `loginWithPassword(...)`. Both call the extracted private `issueSession()`. | Turning `login()`'s first parameter into a discriminated union rewrites every existing caller and ~15 `auth.service.spec.ts` cases — churn on the exact surface the proposal names as risk #1. Two named entry points + one pure dispatcher keep the device path's diff to "the tail moved into a private method", which a passing test suite proves. |
| **D2** | `LoginDto` becomes one class with three optional fields plus a class-level `@ExactlyOneCredential()` constraint (400 `INVALID_CREDENTIAL_SHAPE` on none/both). | `forbidNonWhitelisted: true` is global (`main.ts:30`) — `{email,password}` against today's DTO 400s before reaching any code, so the DTO **must** widen. Nest has no native union body validation; a class-level validator is the house-compatible way and keeps `{device_uuid}` alone valid, which every one of the 122 e2e tests sends. |
| **D3** | Redemption is a **CAS-first, diagnose-second** `UPDATE … WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at > now() RETURNING …` inside one `dataSource.transaction`. 0 rows → a second read-only SELECT decides 404 vs 410. | Same shape as `SessionsRepository.rotate` (design §1: never read-then-write). `SELECT … FOR UPDATE` holds a row lock across the bcrypt hash + user INSERT (~100ms at cost 12), serialising an attacker-triggerable path; the CAS holds no lock and still guarantees exactly one winner. |
| **D4** | Token = 32 random bytes → `base64url` in the email link; **SHA-256 hex (char(64)) in the DB**; lookup by hash equality on the UNIQUE index, then `timingSafeEqualHex` re-compare before acting. | Reuses `common/crypto/session-hash` verbatim (proposal). The index lookup is not constant-time, but the probe value is a 256-bit-entropy-derived digest — nothing is learnable by timing it; the in-memory re-compare is the defence-in-depth the proposal asks for and costs one call. |
| **D5** | **Revoke-all spares nobody**, including the caller's own `sid` on the authenticated `PUT /auth/password`. | Resolves the proposal's open risk. One rule, one code path, one testable invariant: *after any password write, `findActiveByUser(userId)` returns `[]`*. Sparing requires excluding a sid from **both** the SQL predicate and the Redis fan-out; a mistake there is silent and only observable as a surviving session. Cost is one re-login, paid by the actor who just chose the new password. UI must say "you will be signed out everywhere". |
| **D6** | `revokeAllForUser` is an **additive method on `SessionsRepository`** (+ `revokeAllForUser` orchestration in `AuthService`), not a new module. | The proposal's "Modified Capabilities" pulls in the bulk revocation T3.9 deferred. `SessionsModule` stays a leaf and keeps exporting only the repository/caches (T3.9 §8) — `AuthModule` already imports it, so **zero new module edges**. The T3.9 *behaviour* is unchanged; only the surface grows. |
| **D7** | `users.device_uuid` becomes NULL-able but **keeps `users_device_uuid_key`**; `user_sessions.device_uuid` is relaxed to NULL too. | Postgres UNIQUE permits unlimited NULLs, so password-only users never collide — dropping the constraint (as the brief proposed) would let two devices share a uuid and break `login()`'s find-or-create. `user_sessions.device_uuid` is `NOT NULL` (0006:29): without relaxing it, **every password login 500s on the session INSERT**. Password login accepts an optional `device_uuid` as a session *label*, never as identity. |
| **D8** | `getPermissions(deviceUuid)` gains a `null` guard; `getMe` and `invalidatePermissionCache` route to the uid-keyed path when `deviceUuid === null`. | Prevents the proposal's named hazard `perm:v3:null` — one cache key shared by every password-only user, i.e. cross-user permission bleed. `getAuthContextByUserId` is already safe (`null !== 'anonymous'`). |
| **D9** | `POST /auth/password-reset` **always returns 202**, whatever the email. | Corrects the brief's "404 if not found", which is itself the enumeration oracle it tries to avoid, and contradicts the proposal's success criterion "wrong password and unknown email are indistinguishable". Login mirrors this: unknown email runs `bcrypt.compare` against a constant `DUMMY_HASH` so the 401 costs the same wall-clock as a wrong password. |
| **D10** | Invite authorization = `PermissionGuard('CREATE','invitations')` → org check → existing `assertCanGrantRole(actor, invitedRoleName)`. Org mismatch is **403**, not 404. | `assertCanManage` needs an existing user row; an invitation has none. `assertCanGrantRole` already answers the right question (rank of the role being *granted*, including its `actor.roleName === null` D2 additivity). 404 exists to hide rows the actor could not know about — here the actor supplied the org id itself, so a 404 would only confuse. |
| **D11** | Mail goes through `MailService.enqueue` (Redis Streams outbox), never `deliver`. | T3.5 D9: producers must not trigger synchronous SMTP. Consequence, called out for the spec: the invitation endpoint returns 201 on *enqueue*, not on delivery. |
| **D12** | Redemption **creates** a user; it never adopts an existing device-only row. | Device re-bind is explicitly out of scope (proposal). Adoption would need an ownership proof the invitation cannot provide. An already-claimed email is a 409 at both invite creation and redemption. |

## Component Design

### `auth/credential-dispatch.ts` (D1/D2)

```ts
export type Credential =
  | { kind: 'device'; deviceUuid: string }
  | { kind: 'password'; email: string; password: string; deviceUuid: string | null };

export function resolveCredential(dto: LoginDto): Credential; // throws BadRequest on 0 or 2 credentials
```

### `AuthService` (modified)

- `login(deviceUuid, meta)` — **unchanged signature and behaviour**; body ends in `issueSession`.
- `private issueSession(user, deviceUuid, meta)` — the anonymous short-circuit + sid/sign/hash/
  `SessionsRepository.create` block lifted verbatim out of today's `login()`.
- `loginWithPassword({ email, password, deviceUuid }, meta)` — `SELECT … WHERE email = $1`,
  `bcrypt.compare(password, user.password_hash ?? DUMMY_HASH)`, `isActive` check, then
  `issueSession(user, deviceUuid, meta)`. Never anonymous.
- `revokeAllForUser(userId)` — `SessionsRepository.revokeAllForUser` → `RevocationCache.revoke(id,
  remainingTtl)` per returned row, computed exactly as `revokeSession` does.

### `SessionsRepository.revokeAllForUser(userId)` (D6)

```sql
UPDATE user_sessions SET revoked_at = now()
 WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
RETURNING id, expires_at
```
**Gotcha (T3.9 §4, carried forward):** `UPDATE … RETURNING` through `DataSource.query` returns a
`[rows, count]` tuple — must go through `firstUpdatedRow`'s destructuring, here `const [rows] =`.

### `InvitationsService.redeem(token, password)` (D3)

```
dataSource.transaction(em =>
  1. hash = sha256Hex(base64urlDecodeCheck(token))            // 400 INVALID_TOKEN on decode failure
  2. CAS: UPDATE invitations SET accepted_at = now()
          WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
          RETURNING id, email, role_id, organization_id, token_hash
  3. 0 rows → SELECT accepted_at, expires_at WHERE token_hash = $1
             → no row: 404 INVITATION_NOT_FOUND | else 410 INVITATION_ALREADY_USED / _EXPIRED
  4. timingSafeEqualHex(hash, row.token_hash)                  // defence in depth
  5. INSERT INTO users (email, password_hash, role_id, organization_id, permissions, is_active)
     … permissions copied from the role row, mirroring RolesService.assignRole
     → SQLSTATE 23505 on users_email_unique_idx ⇒ 409 EMAIL_ALREADY_CLAIMED (tx rolls back,
       accepted_at is released — the invitation stays usable)
) → issueSession(user, null, meta)                             // outside the tx
```

### `PasswordResetService`

`request(email)` → find user (silently return on miss, D9) → 32-byte token → INSERT hash → 
`MailService.enqueue('password-reset')` → **202**.
`confirm(token, newPassword)` → same CAS shape on `password_reset_tokens.used_at` → 
`UPDATE users SET password_hash = $bcrypt` → `AuthService.revokeAllForUser(userId)` — in that order,
inside one transaction for the token+password write, with the revoke fan-out after commit.

## Sequence Flows

**Invitation (happy path).** admin `POST /admin/users/invite {email, role_id, organization_id}` →
guard `CREATE invitations` → 409 if the email is already claimed → org check + `assertCanGrantRole`
→ INSERT (hash only) → `enqueue` → **201** `{id, expires_at}` (no token in the response body — the
mail is the only channel). Invitee opens the link → `GET /invitations/preview?token=` (no auth,
rate-limited by the global `RateLimiterGuard`) → `{organization_name, inviter_name, role_name,
expires_at}` → `POST /auth/accept-invitation {token, password}` → D3 → **201 + live session**.

**Concurrent redemption.** Two requests, same token. Both compute the same hash; both issue the CAS.
Postgres serialises the two `UPDATE`s on the row: the first commits 1 row, the second re-reads under
the same predicate and matches 0 (`accepted_at` now set) → step 3 → **410**. Exactly one user row is
ever created because the INSERT is inside the winning transaction.

**Password reset.** `POST /auth/password-reset {email}` → **202 always** → mail with 24h link →
`POST /auth/password-reset/confirm {token, new_password}` → token CAS → new `password_hash` →
`revokeAllForUser`. Device A's next `POST /auth/refresh` hits `findActiveById` → `revoked_at IS NOT
NULL` → **401 `SESSION_REVOKED`** (the existing T3.9 code, unmodified). Device A's next *access*-token
request 401s from `JwtStrategy` via the denylist, within the access-token TTL, not at refresh TTL.

**Multi-device.** `POST /auth/login {email,password}` from A, then from B → two `user_sessions` rows,
distinct `sid`, both active — no code enforces one-session-per-user, so this works by construction.

## Migrations

### `database/migrations/0017_users_password_identity.sql`

```sql
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'users' AND column_name = 'email') THEN
    RAISE EXCEPTION '0017 requires 0010 (users.email) to have been applied first';
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash char(60);          -- bcrypt $2b$12$… ; NULL = device-only

-- Identity moves to email. users_device_uuid_key is KEPT: UNIQUE permits many NULLs,
-- so password-only users coexist while two real devices still cannot share a uuid.
ALTER TABLE users        ALTER COLUMN device_uuid DROP NOT NULL;
ALTER TABLE user_sessions ALTER COLUMN device_uuid DROP NOT NULL;  -- 0006:29 was NOT NULL

COMMIT;
```

`database/rollback/0017_….DOWN.sql`: drop `password_hash`; restore both `SET NOT NULL` — the users
one **fails loudly** if any `device_uuid IS NULL` row exists (proposal rollback step 3; never invent
a UUID). `user_sessions` rows with a NULL device must be deleted first, same rule.

### `database/migrations/0018_invitations.sql`

```sql
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin_sistema') THEN
    RAISE EXCEPTION '0018 requires 0015 (staff roles) to have been applied first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               varchar(320) NOT NULL,
  role_id             uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  organization_id     uuid REFERENCES organizations (id) ON DELETE CASCADE,
  token_hash          char(64) NOT NULL UNIQUE,
  accepted_at         timestamptz,
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  invited_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_email      ON invitations (email);
CREATE INDEX IF NOT EXISTS idx_invitations_pending    ON invitations (expires_at)
  WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  char(64) NOT NULL UNIQUE,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

INSERT INTO permissions (resource, action) VALUES
  ('invitations', 'CREATE'), ('invitations', 'READ'), ('invitations', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

UPDATE roles
   SET permissions = permissions ||
       '["CREATE invitations", "READ invitations", "DELETE invitations"]'::jsonb
 WHERE name IN ('admin_sistema', 'admin_organizacion')
   AND NOT permissions @> '["CREATE invitations"]'::jsonb;

COMMIT;
```

### Corrections to the SQL supplied in the phase brief

| Brief said | Reality in this repo | Correction |
|---|---|---|
| `ALTER TABLE users ADD COLUMN email VARCHAR UNIQUE` | `users.email varchar(320)` + `users_email_unique_idx` exist since **0010** | dropped from 0017 — re-adding it errors |
| `CREATE INDEX idx_users_email` | already covered by `users_email_unique_idx` | dropped (redundant) |
| `DROP CONSTRAINT users_device_uuid_key` | NULLs don't violate UNIQUE | **kept** (D7) — dropping it breaks device login's uniqueness invariant |
| `CREATE INDEX idx_user_sessions_user_id_created` | `idx_user_sessions_active (user_id, created_at DESC) WHERE revoked_at IS NULL` exists since **0016** | dropped (duplicate) |
| `permissions (resource, action, description)` | 0009: no `description` column; `action` has a CHECK over 5 verbs | 2-column INSERT |
| `('password-reset','CREATE')` permission row | the endpoint is unauthenticated by definition | dropped — a permission nobody can be required to hold is dead schema |
| `used_at` on invitations / `created_by_user_id` | proposal names `accepted_at` / `invited_by_user_id` | proposal wins (`accepted_at` is what "single-use" means for an invite) |
| `created_by_user_id UUID NOT NULL … ON DELETE SET NULL` | self-contradictory | `NULL`-able + `ON DELETE SET NULL` |
| "Sessions module needs no changes" | there is no bulk-revoke method | D6 — one additive repository method; behaviour unchanged |

## File Changes

| File | Action | Description |
|---|---|---|
| `database/migrations/0017_…`, `0018_…` + 2 `rollback/*.DOWN.sql` | Create | above |
| `backend/src/entities/{invitation,password-reset-token}.entity.ts` | Create | — |
| `backend/src/entities/user.entity.ts` | Modify | `passwordHash: string \| null`; `deviceUuid: string \| null` |
| `backend/src/modules/auth/credential-dispatch.ts` (+ spec) | Create | pure `resolveCredential` |
| `backend/src/modules/auth/password-hasher.ts` (+ spec) | Create | bcrypt cost 12, `DUMMY_HASH`, injectable for test-cost override |
| `backend/src/modules/auth/dto/{login,accept-invitation,password-reset,password-reset-confirm,change-password}.dto.ts` | Create/Modify | D2 union DTO + 4 new |
| `backend/src/modules/auth/auth.service.ts` | Modify | `issueSession` extraction, `loginWithPassword`, `revokeAllForUser`, D8 null guards |
| `backend/src/modules/auth/auth.controller.ts` | Modify | dispatch + 4 routes |
| `backend/src/modules/auth/auth.module.ts` | Modify | import `InvitationsModule`, `MailModule` |
| `backend/src/modules/invitations/**` | Create | module, repository, service, controller, `assert-can-invite.ts`, DTOs, specs |
| `backend/src/modules/auth/password-reset.{service,repository}.ts` (+ specs) | Create | lives in `auth/`, not its own module — its only consumer is `AuthController` |
| `backend/src/modules/sessions/sessions.repository.ts` (+ spec) | Modify | `revokeAllForUser` (D6) |
| `backend/src/modules/mail/templates/mail-templates.ts` | Modify | `'invitation'`, `'password-reset'` template names + bodies |
| `backend/src/modules/users/users.service.ts` | Modify | `invalidatePermissionCache` with a nullable device |
| `backend/src/app.module.ts` | Modify | register `InvitationsModule` |
| `backend/test/e2e/invitations.e2e-spec.ts` | Create | full flow |
| `backend/test/support/test-environment.ts` | Modify | `provisionPasswordUser` helper |

## Error Map

| Situation | Status | Code |
|---|---|---|
| login: unknown email / wrong password / `password_hash IS NULL` | 401 | `INVALID_CREDENTIALS` |
| login body with 0 or 2 credential shapes | 400 | `INVALID_CREDENTIAL_SHAPE` |
| token not base64url / wrong length | 400 | `INVALID_TOKEN` |
| preview or redeem, unknown token hash | 404 | `INVITATION_NOT_FOUND` |
| redeem/preview, `accepted_at IS NOT NULL` | 410 | `INVITATION_ALREADY_USED` |
| redeem/preview, `expires_at <= now()` | 410 | `INVITATION_EXPIRED` |
| invite or redeem against a claimed email | 409 | `EMAIL_ALREADY_CLAIMED` |
| invite outside the actor's org, or role ≥ actor's rank | 403 | `INSUFFICIENT_ROLE_RANK` / `OUT_OF_SCOPE_ORGANIZATION` |
| reset request, any email | 202 | — |
| reset confirm, used/expired token | 410 | `RESET_TOKEN_CONSUMED` / `_EXPIRED` |
| `PUT /auth/password`, wrong `current_password` | 401 | `INVALID_CREDENTIALS` |

## Testing Strategy

Strict TDD (`npm test`, Testcontainers e2e). Red first, always.

| Layer | What | Approach |
|---|---|---|
| Unit | `resolveCredential` — device / password / neither / both | pure, table-driven |
| Unit | `PasswordHasher` — round-trip, `DUMMY_HASH` verifies false, cost is config-driven | **cost 4 in tests** via config; never a hardcoded 12 in a unit test (12 × ~40 cases ≈ 4s of pure CPU) |
| Unit | `AuthService.loginWithPassword` — unknown email, null hash, inactive user, success | mocked repo + hasher; assert `bcrypt.compare` is called on **every** branch (timing equalisation is the assertion, not a comment) |
| Unit | `AuthService.login` device path | **existing specs unmodified** — the regression gate for the `issueSession` extraction |
| Unit | `InvitationsService` 404-vs-410 diagnosis, `assertCanInvite` matrix | mocked repository |
| Unit | token codec + `sha256Hex`/`timingSafeEqualHex` reuse | pure |
| Integration | `SessionsRepository.revokeAllForUser` — N active + 1 already-revoked + 1 expired → returns only the N | Testcontainers Postgres |
| Integration | redemption CAS — `Promise.all` of two `redeem()` on one token → exactly one 201, one 410, one `users` row | Testcontainers, real concurrency (no mocked lock) |
| Integration | `MailService.enqueue` puts `invitation` / `password-reset` on `mail:outbox` with a rendered, escaped body | Testcontainers Redis |
| E2E | invite → preview → accept → login A → login B (2 live sessions) → reset → **both** refresh 401 `SESSION_REVOKED` → re-login | `invitations.e2e-spec.ts` |
| E2E | expiry: `expires_at` is written by **SQL `UPDATE`** in the test setup, never `sleep` — the intervals are 24h/48h | injectable clock is not needed if the row's timestamp is the input |
| Regression | **all 122 pre-existing e2e unmodified** | run the full suite before writing a single new test; any pre-existing test that needs editing is a design bug |

## Migration / Rollout

Deploy order: 0017 → 0018 → code. Both are idempotent (`IF NOT EXISTS` / `ON CONFLICT`). No feature
flag: with no invitation rows and no `password_hash` set, every code path added here is unreachable
and the device path is bit-identical. No cache flush — `perm:v3:` is unchanged (D8 only adds a null
guard on which key is used).

## Open Questions

- [ ] **Reset/invite link base URL.** `MAIL_APP_BASE_URL` does not exist in `mail.config.ts`; the
      spec must name the env var and its dev default before the templates can be written.
- [ ] **Password policy floor.** Proposal scopes "a length floor" but names no number. Spec must
      pin it (recommendation: ≥12 chars, no composition rules).
- [ ] Non-blocking: `GET /auth/me` returns `device_uuid: string` today and becomes `string | null`
      for password-only users. No existing e2e asserts on a non-null value for such a user (none can
      exist yet), but this is a public response-contract widening the spec should state.
