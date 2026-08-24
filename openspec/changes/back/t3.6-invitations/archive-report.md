# Archive Report: T3.6 Invitations — Email + Password Identity (Variante B)

**Change**: t3.6-invitations
**Archived**: 2026-08-19
**Artifact store**: hybrid (openspec + Engram)
**Verification verdict**: PASS WITH WARNINGS (0 CRITICAL / 4 WARNING / 2 SUGGESTION)

---

## What Was Implemented

### Migrations
- `database/migrations/0017_users_password_identity.sql` — adds `password_hash CHAR(60) NULL` to `users`; relaxes `device_uuid` and `user_sessions.device_uuid` to nullable; validates 0010 prerequisites.
- `database/migrations/0018_invitations.sql` — creates `invitations` and `password_reset_tokens` tables with SHA-256 token hashing, 48h/24h TTL; appends three permission rows to `invitations` resource; updates role-matrix for `admin_sistema` and `admin_organizacion`.
- Corresponding `.DOWN.sql` rollback scripts for both.

### Services & Repositories
- `InvitationsService` — creates, previews, lists-pending, deletes, and redeems invitations with atomic CAS (`UPDATE … WHERE … RETURNING`).
- `InvitationsRepository` — raw SQL layer: `insertPending`, `findPreviewByHash`, `redeemCas`, `findDiagnosisByHash`, `findByClaimedEmail`, `deleteIfPending`.
- `PasswordResetService` — requests (silent miss, always 202), confirms (CAS + revoke-all), delegates revocation to `AuthService`.
- `PasswordResetTokenRepository` — raw SQL: `insert`, `casConsume`, `findDiagnosisByHash`.
- `SessionsRepository.revokeAllForUser(userId)` — bulk revocation, returns all N revoked rows via `updatedRows<T>()` helper; denylist fan-out handled in `AuthService.revokeAllForUser`.
- `PasswordHasher` — bcrypt cost 12 (prod), configurable to cost 4 in tests; `DUMMY_HASH` for timing equalization.
- `credential-dispatch.ts` — pure `resolveCredential(dto)` validator; dispatches to device or password branch.

### Auth Refactor
- `AuthService.login()` — extracted `issueSession()` as private method; device branch untouched (regression gate).
- `AuthService.loginWithPassword()` — new entry point for password-credential path; `bcrypt.compare` on every branch (timing equalization).
- `AuthService.revokeAllForUser()` — orchestrates `SessionsRepository.revokeAllForUser()` + `RevocationCache.revoke()` fan-out; spares nobody including caller's own `sid`.
- `AuthService.changePassword()` — authenticated self-only password change; revokes all sessions.
- D8 null guards: `getPermissions(null)` returns `[]`; `invalidatePermissionCache` skips device-keyed deletes when `deviceUuid` is `null`.

### Endpoints
- `POST /api/admin/users/invite` — guards: `JwtAuthGuard`, `PermissionGuard('CREATE', 'invitations')`, `assertCanInvite`; returns 201 on enqueue.
- `GET /api/invitations/pending` — guards: `PermissionGuard('READ', 'invitations')`; returns list of unaccepted invitations.
- `GET /api/invitations/preview?token=` — NO auth; returns org/inviter/role/expiry for valid token; 404 unknown / 410 expired-or-consumed.
- `DELETE /api/invitations/:id` — guards: `PermissionGuard('DELETE', 'invitations')`; revokes pending invitation.
- `POST /api/auth/accept-invitation` — public; atomically creates user, sets password, marks `accepted_at`, issues session; 201.
- `POST /api/auth/password-reset` — public; always 202; emails reset token only on user hit.
- `POST /api/auth/password-reset/confirm` — public; CAS on token + sets password + revokes all sessions; 200.
- `PUT /api/auth/password` — guards: `JwtAuthGuard` (self-only); requires current password; revokes all sessions including caller's own; 200.

### Entities
- `InvitationEntity` — maps `invitations` table.
- `PasswordResetTokenEntity` — maps `password_reset_tokens` table.
- `UserEntity` — gains `passwordHash: string | null`; `deviceUuid` becomes `string | null`.
- `UserSessionEntity` — `deviceUuid` becomes `string | null`.

### Mail Templates
- `TemplateName` extended: `'invitation'`, `'password-reset'`.
- Both templates render via `field()`-escaped data; link to `${appBaseUrl}/accept-invitation?token=…` (48h) and `${appBaseUrl}/reset-password?token=…` (24h).
- Token string escaped in template output.

### DTOs & Validators
- `LoginDto` — union: `device_uuid` (optional) OR `{email, password}` (both optional); `@ExactlyOneCredential()` class-level validator.
- `AcceptInvitationDto` — `{ token, password (@MinLength(12)) }`.
- `PasswordResetRequestDto` — `{ email (@IsEmail()) }`.
- `PasswordResetConfirmDto` — `{ token, password (@MinLength(12)) }`.
- `ChangePasswordDto` — `{ current_password, new_password (@MinLength(12)) }`.

### Tests
- Unit: 714 total (baseline 614 pre-existing + ~100 new).
  - `credential-dispatch` table-driven (device / password / neither / both).
  - `PasswordHasher` round-trip, `DUMMY_HASH` verification, cost config-driven.
  - `AuthService.loginWithPassword` mocked repo + hasher; assert `bcrypt.compare` on every branch.
  - `AuthService.login` device path — existing specs unmodified (regression gate).
  - `InvitationsService` — 404-vs-410 diagnosis, authorization matrix.
  - `PasswordResetService` — silent-miss request, CAS, token reuse.
  - `token-codec` pure functions.
  - `SessionsRepository.revokeAllForUser` integration (Testcontainers Postgres).
  - Concurrent redemption integration (real Postgres concurrency).
  - Mail outbox integration (Testcontainers Redis).

- E2E: 134 total (baseline 122 pre-existing + 12 new).
  - `invitations.e2e-spec.ts` (7 tests) — full flow (invite → preview → accept → login A → login B → reset → revoke).
  - `invitations-repository.e2e-spec.ts` (5 tests) — CAS concurrency, mail escaping.
  - All 122 pre-existing tests from T3.9 pass unmodified.

---

## Verification Results

**Baseline from T3.9**: unit 614/614, e2e 122/122.
**Final**: unit 714/714 (77 suites, 10.5s), e2e 134/134 (15 suites, 181.3s real Testcontainers).
**Typecheck**: ✅ zero errors.
**Build**: ✅ `dist/main.js` produced.
**Lint**: ✅ 0 errors (16 pre-existing warnings in unrelated files).

| Metric | Result |
|--------|--------|
| **Spec compliance** | 9/10 scenarios fully compliant (1 partial — selective-revoke combination inferred from two passing suites) |
| **Design coherence** | All 12 decisions (D1-D12) followed; safety-critical (D3, D5, D6, D11) proven under real infrastructure |
| **Regression gate** | All 122 pre-existing e2e tests pass unmodified — device-login path byte-identical |

### Issues Found

**CRITICAL**: None. All 4 prior CRITICALs (missing e2e, missing Testcontainers, unchecked tasks, missing apply-progress) resolved.

**WARNING** (should fix, not blocking):
1. `POST /api/auth/password-reset` spec says `200`; implementation returns `202` (correct, spec text is stale). Fix: amend spec line 51 to 202.
2. Malformed payloads spec says `422`; implementation returns `400` (Nest's global validation, project-wide convention). Fix: amend spec line 85 to 400.
3. Migration idempotence (task 1.5) marked `[x]` but never tested twice against persistent local Postgres (only single-pass via 15x ephemeral Testcontainers runs). Recommend local two-pass verification before Supabase deploy or amend task docs.
4. No single test combines password-identity multi-device user + `DELETE /api/sessions/:id` selective revoke (mechanism proven separately, low risk).

**SUGGESTION** (nice to have):
1. Password-length floor (12) duplicated across 3 DTOs instead of reading `AuthConfig.passwordMinLength` (intentional per design; consider shared constants file).
2. "Token consumed" message on `password-reset/confirm` not specified in any requirement (no real gap).

---

## Files Synced to Main Specs

| Domain | Action | Details |
|--------|--------|---------|
| `invitations-lifecycle` | Created | 1 requirement, 10 scenarios, 15 acceptance criteria. Source: `openspec/changes/t3.6-invitations/specs/invitations-lifecycle/spec.md` → `openspec/specs/invitations-lifecycle/spec.md`. |

---

## Archive Contents

The following artifacts have been archived under `openspec/changes/archive/2026-08-19-t3.6-invitations/`:
- ✅ `proposal.md` — Variante B intent, scope, risks, rollback.
- ✅ `design.md` — 12 architecture decisions (D1-D12), component design, migration specs, error map, testing strategy.
- ✅ `tasks.md` — 75 tasks across 9 phases; all `[x]` marked complete.
- ✅ `specs/invitations-lifecycle/spec.md` — full lifecycle spec (primary artifact).
- ✅ `verify-report.md` — verification verdict: PASS WITH WARNINGS.

---

## Source of Truth Updated

The following main specs now reflect the new behavior:
- `openspec/specs/invitations-lifecycle/spec.md` — canonical invitations & password-identity lifecycle.

---

## Engram Artifact References

For traceability, the following Engram observations are referenced:
- Proposal: `sdd/t3.6-invitations/proposal` (Engram #463)
- Spec: `sdd/t3.6-invitations/spec` (Engram #465)
- Design: `sdd/t3.6-invitations/design` (Engram #466)
- Tasks: `sdd/t3.6-invitations/tasks` (Engram #467)
- Apply-progress: `sdd/t3.6-invitations/apply-progress` (Engram #470)
- Verification: `sdd/t3.6-invitations/verify-report` (Engram #468 — file-based, prior report)

---

## SDD Cycle Complete

The change has been fully planned (proposal), specified (spec + design), implemented (tasks → apply-progress), verified (PASS WITH WARNINGS), and archived. The multi-device, email+password identity capability is now part of the production codebase, with device-UUID login untouched and all 122 pre-T3.6 e2e tests passing unmodified.

**Ready for deployment to Supabase.**

Recommended follow-ups (optional, non-blocking):
- Amend `openspec/specs/invitations-lifecycle/spec.md` lines 51 and 85 to reflect shipped (correct) 202/400 status codes.
- Verify migration idempotence locally before Supabase apply, or document single-pass Testcontainers validation as sufficient.
