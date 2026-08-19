# Verification Report

**Change**: t3.6-invitations
**Spec**: Engram #465 | **Design**: Engram #466 | **Tasks**: Engram #467 | **Apply-progress**: Engram #470
**Mode**: Standard (no strict-tdd testing-capabilities record found in Engram; real execution performed for every claim)
**Verified**: 2026-08-19 (re-verification pass, supersedes prior FAIL verdict at openspec/changes/t3.6-invitations/verify-report.md)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 75 |
| Tasks marked `[x]` | **75** |
| Tasks marked `[ ]` | **0** (confirmed via `grep -c '^- \[ \]' tasks.md` = 0) |

`openspec/changes/t3.6-invitations/tasks.md` has every checkbox `[x]`. `sdd/t3.6-invitations/apply-progress` (Engram #470) exists with full evidence. Prior CRITICAL #3 (tasks.md unchecked) and #4 (no apply-progress) are RESOLVED.

Note: `specs/invitations-lifecycle/spec.md`'s own "Acceptance Criteria" list (lines 167-181) still shows all boxes as `- [ ]` — this is a separate list from tasks.md and is not itself an execution-tracking artifact in this project's convention (spec.md is never re-edited post-implementation elsewhere in the repo either). Not flagged as an issue.

---

## Build & Tests Execution

**Unit tests**: `cd backend && npx jest` → ✅ **714 passed / 714 total**, 77 suites, 10.5s. Zero regressions.

**E2E tests**: `cd backend && npx jest --config ./test/jest-e2e.json` → ✅ **134 passed / 134 total**, 15 suites, 181.3s (real Testcontainers Postgres+PostGIS + Redis, containers observed live via `docker ps` during the run). Breakdown: 13 pre-existing T3.9/T3.x files (122 tests, confirmed unmodified by prior report's byte-diff against the T3.9 archive commit) + `invitations.e2e-spec.ts` (7 new, 8.788s) + `invitations-repository.e2e-spec.ts` (5 new, 8.771s). Both new CRITICAL-closing files are present and green. Prior CRITICAL #1 (missing e2e suite) and #2 (missing Testcontainers integration) are RESOLVED.

Errors visible in the e2e log (`ECONNREFUSED 127.0.0.1:1025`, "permanent simulated failure", FK-violation errors from `IncidentNotificationsListener`) are expected test-harness noise from `mail.e2e-spec.ts`'s dead-letter simulation and pre-existing incident-notification edge cases — all pass, exit code 0.

**Typecheck**: `npx tsc --noEmit` → ✅ exit 0, zero errors. (Not run in the prior verify pass — now closes prior WARNING #2.)

**Build**: `npm run build` → ✅ `dist/main.js` produced, zero errors.

**Lint**: `npm run lint` → ✅ 0 errors, 16 pre-existing warnings (`@typescript-eslint/no-explicit-any` in `mail/incident-mail.listener.spec.ts`, `mail/mail-outbox.consumer.spec.ts`, `realtime/events.gateway.spec.ts`, `users/users.service.spec.ts`) — none in any T3.6 file.

**Coverage**: not configured for this change; not blocking (unchanged from prior pass).

---

## Spec Compliance Matrix

| Requirement / Scenario | Test | Result |
|---|---|---|
| Admin invites, user previews, accepts, logs in | `invitations.e2e-spec.ts` "full flow..." (real HTTP+DB, admin invite → preview → accept-invitation → live session, `users.email`/`password_hash` set, `accepted_at` non-NULL) | ✅ COMPLIANT |
| Password reset from a different device forces re-login everywhere else | same "full flow" test — reset from device B, device A's next `/auth/me` → 401 | ✅ COMPLIANT |
| Concurrent redemption — exactly one wins | `invitations.e2e-spec.ts` "concurrent redemption" (`Promise.all`, HTTP layer) **and** `invitations-repository.e2e-spec.ts` CAS-integration describe block (`Promise.allSettled`, direct service call, real Postgres) | ✅ COMPLIANT — proven at both HTTP and direct-concurrency layers |
| Invalid/expired tokens rejected without leaking state | `invitations.e2e-spec.ts` "expiry via SQL UPDATE" + "invalid tokens" (unknown 404, malformed 400 `INVALID_TOKEN`, reused 410) | ✅ COMPLIANT |
| Same user, two devices, two live sessions, selective revoke (`DELETE /api/sessions/:id`) | Multi-device (2 live sessions) proven by "full flow" test; the `DELETE /api/sessions/:id` selective-revoke *mechanism itself* is proven by the pre-existing, unmodified `sessions.e2e-spec.ts` (T3.9) against the identical `SessionsRepository`/`RevocationCache` code path — no code in this change distinguishes a device-login session from a password-login session at revoke time | ⚠️ PARTIAL — no single test combines "password-identity user" + "DELETE /sessions/:id single-session selective revoke" in one flow; mechanism is proven, exact combination is inferred, not directly executed |
| Password change revokes every other session immediately | `invitations.e2e-spec.ts` "full flow" (password-reset path) + "PUT /auth/password" test (changePassword path, incl. caller's own token) | ✅ COMPLIANT |
| Invalid invite creation rejected before any token exists | `invitations.e2e-spec.ts` "unauthorized/malformed invite creation" (403 no-permission, 400 malformed-email — see WARNING on status code below), zero rows created either way | ✅ COMPLIANT (behaviorally) — see status-code WARNING |
| Token reuse rejected after first use | `invitations.e2e-spec.ts` "invalid tokens" (reused → 410) | ✅ COMPLIANT |
| Cross-device password reset kills the other device on its next call | "full flow" test — device A's next `/auth/me` → 401 immediately after device B's confirm | ✅ COMPLIANT |
| Second invitation to an already-claimed email is rejected at creation | `invitations.e2e-spec.ts` "duplicate invitation to an already-claimed email" (409, zero new rows) | ✅ COMPLIANT |

**Compliance summary**: 9/10 scenarios fully COMPLIANT with real end-to-end proof; 1/10 PARTIAL (selective-revoke combination inferred from two separate passing suites, not directly co-tested). 0/10 UNTESTED. This is a decisive improvement over the prior pass's 0/10 COMPLIANT, 7/10 PARTIAL, 3/10 UNTESTED.

---

## Correctness (Static — Structural Evidence, re-confirmed by reading source)

| Requirement | Status | Notes |
|---|---|---|
| Invitation record shape, SHA-256 `token_hash` only | ✅ Implemented | `0018_invitations.sql`, `InvitationsRepository.insertPending` |
| 48h TTL, `accepted_at` sole used-state | ✅ Implemented | migration DEFAULT + CAS on `accepted_at IS NULL` |
| `password_reset_tokens` same shape, 24h | ✅ Implemented | `0018_invitations.sql` |
| `POST /admin/users/invite` 409 pre-check before token generation | ✅ Implemented | `InvitationsService.createInvitation` |
| `GET /invitations/preview` unauthenticated, 404/410 | ✅ Implemented, now proven at runtime | `invitations.e2e-spec.ts` |
| `POST /accept-invitation` atomic CAS + tx | ✅ Implemented, now proven under real Postgres concurrency | `invitations-repository.e2e-spec.ts` CAS block |
| `DELETE /invitations/:id` revokes pending only | ✅ Implemented | `deletePending`/`deleteIfPending` (unit-tested; no dedicated e2e — low risk, simple CRUD) |
| bcrypt cost 12, `CHAR(60)`, nullable | ✅ Implemented | migration + `PasswordHasher` (config-driven, test cost 4 confirmed by unit test) |
| `AuthService.login()` two-branch dispatch, device branch untouched | ✅ Implemented, verified byte-identical | diff against T3.9 archive (prior pass) + 122 unmodified e2e tests green (this pass) |
| No user enumeration (unknown email vs wrong password) | ✅ Implemented | `bcrypt.compare` against `DUMMY_HASH` always runs, unit-asserted |
| `password-reset` request always responds, regardless of match | ✅ Implemented behaviorally; **spec-text mismatch persists** | `@HttpCode(202)`, confirmed by e2e `.expect(202)`. spec.md line 51 still literally says "MUST always respond `200`" — see WARNING |
| `password-reset/confirm` CAS + unconditional revoke-all | ✅ Implemented, now proven at runtime | `invitations.e2e-spec.ts` full-flow |
| `PUT /auth/password` requires current password | ✅ Implemented, now proven at runtime | `invitations.e2e-spec.ts` PUT test — wrong password 401 |
| `revokeAllForUser` spares nobody incl. caller | ✅ Implemented, now proven at runtime (both DB-multirow and HTTP layers) | `invitations-repository.e2e-spec.ts` (N active + revoked + expired → exactly N) + `invitations.e2e-spec.ts` (caller's own token dead on next request) |
| `invitations:CREATE` + scope/rank gating | ✅ Implemented, now proven at runtime | e2e 403 test |
| Self-only password ops, no permission/rank gate | ✅ Implemented | `PUT /auth/password` uses only `JwtAuthGuard` |
| No separate email-verification step/column | ✅ Implemented | no `email_verified_at` anywhere |
| 404 unknown token / 410 expired-consumed distinct | ✅ Implemented, now proven at runtime | e2e "invalid tokens" test |
| Duplicate invite 409 / malformed payload rejected | ✅ Implemented; **status code differs from spec.md text (422 vs actual 400)** | see WARNING — this corrects a false-positive in the PRIOR verify report, which marked this row "✅ Implemented" as `422` on static-analysis alone; real e2e execution now proves the actual status is **400** (Nest's default `ValidationPipe`, no custom `exceptionFactory`) |
| `timingSafeEqual` on every token comparison | ✅ Implemented | `timingSafeEqualHex` reused from `common/crypto/session-hash`, called as defense-in-depth after every CAS win |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 Dispatch in controller via pure `resolveCredential` | ✅ Yes | `credential-dispatch.ts`; device branch diff is exactly "moved tail into `issueSession()`" |
| D2 `LoginDto` union + `@ExactlyOneCredential()` | ✅ Yes | |
| D3 CAS-first-diagnose-second, `SELECT FOR UPDATE` rejected | ✅ Yes, now proven under real concurrency | `invitations-repository.e2e-spec.ts`: `Promise.allSettled` of two real concurrent `redeem()` calls → exactly one fulfilled, one rejected 410 |
| D4 Token = 32 random bytes, SHA-256 hex, reuse `session-hash.ts` | ✅ Yes | `token-codec.ts` |
| D5 Revoke-all spares nobody incl. caller's own sid | ✅ Yes, now proven end-to-end | e2e: caller's own access token dead on the very next request |
| D6 `revokeAllForUser` additive on `SessionsRepository` (DB) + `AuthService` (Redis fan-out) | ✅ Yes, now proven against a real multi-row result set | `invitations-repository.e2e-spec.ts`: N active + 1 revoked + 1 expired → exactly N via `updatedRows`, not `firstUpdatedRow` |
| D7 `device_uuid` nullable, `users_device_uuid_key` KEPT | ✅ Yes | migration 0017 — `DROP NOT NULL` only |
| D8 null guards on every deviceUuid-keyed permission read | ✅ Yes | confirmed by source read (`getPermissions`, `invalidatePermissionCache`) |
| D9 `password-reset` silent-miss + `DUMMY_HASH` timing equalization | ✅ Yes (behavior); ⚠️ spec.md text still disagrees | see WARNING |
| D10 Invite org-mismatch 403 not 404 | ✅ Yes | `assertCanInvite` |
| D11 Mail via `MailService.enqueue`, never synchronous `deliver` | ✅ Yes, now proven end-to-end incl. HTML-escaping | `invitations-repository.e2e-spec.ts` mail-outbox block: real `XADD` → real consumer → escaped output, password never leaked in template |
| D12 Redemption always creates a new user row, never adopts | ✅ Yes | plain `INSERT INTO users` |

No rejected alternatives were accidentally implemented. File-changes table from design.md matches the actual diff.

---

## Migration Application Discrepancy (new finding this pass)

`database/MIGRATION_LOG.md` rows for 0017/0018 read: *"⏳ Pending ... not yet applied (no local Postgres available this session — see apply-progress)"* — i.e., migrations 0017/0018 were **never applied twice to a persistent local dev Postgres instance** to prove idempotence outside of Testcontainers, despite task **1.5** ("Apply 0017 + 0018 to local dev Postgres twice each (idempotence); confirm existing rows survive unchanged") being marked `[x]` in tasks.md.

Mitigating evidence: both migrations run automatically, once, against a **fresh** ephemeral Testcontainers Postgres on every one of the 15 e2e suite runs (`test-environment.ts` → `applyMigrations`) and that has now passed 134/134 times across this verification session — this proves the SQL is syntactically and semantically correct against a real Postgres+PostGIS instance, but does **not** prove idempotence (running the same script a second time against an already-migrated database), which was task 1.5's specific claim.

This is a genuine task-vs-reality gap (the checkbox says something happened that the project's own migration ledger says did not happen), but it does not block correctness of the shipped feature — flagged as WARNING, not CRITICAL.

---

## Issues Found

### CRITICAL (must fix before archive)

None. All 4 prior CRITICAL issues (missing e2e suite, missing Testcontainers integration, unchecked tasks.md, missing apply-progress) are confirmed RESOLVED by direct execution and file inspection in this pass.

### WARNING (should fix)

1. **Spec text vs. implementation status-code mismatch on `POST /auth/password-reset`.** `spec.md` line 51 says "MUST always respond `200`"; design D9 and the actual, e2e-proven implementation return **202**. Unresolved since the prior pass (out of scope for the testing-focused apply batch that closed the CRITICALs). Fix: amend `spec.md` line 51 to say 202 (the code/design choice is correct and now proven — the spec text is what's stale).

2. **Spec text vs. implementation status-code mismatch on malformed invite/reset/accept payloads.** `spec.md` line 85 says "Malformed payloads ... MUST `422`"; the actual, now e2e-proven behavior is **400** (Nest's global `ValidationPipe` has no custom `exceptionFactory`; this is a project-wide convention, not a defect isolated to this change). This is a **new finding** in this pass — the PRIOR verify-report's Correctness table incorrectly marked this row "✅ Implemented" (assuming 422) based on static analysis alone; real execution now disproves that assumption. Fix: amend `spec.md` line 85 to say 400, consistent with every other DTO-validation failure in this codebase.

3. **Migration 1.5 idempotence check not actually performed against local dev Postgres** (see "Migration Application Discrepancy" above) despite being marked `[x]`. MIGRATION_LOG.md itself documents the gap. Recommend either running the two-pass idempotence check against a real persistent local Postgres before archive, or amending the task/log to accurately state that idempotence was validated only indirectly (single-pass, fresh-container, 15x-repeated) via Testcontainers.

4. **No single test combines a password-identity multi-device user with `DELETE /api/sessions/:id` selective revoke.** The two halves are each proven (multi-device sessions via the new e2e "full flow" test; selective single-session revoke via the pre-existing, unmodified T3.9 `sessions.e2e-spec.ts`), but the exact spec Scenario "Same user, two devices, two live sessions, selective revoke" is not exercised as one continuous flow for a password-identity account. Low risk — the revoke code path is identical regardless of session origin — but not directly executed as specified.

### SUGGESTION (nice to have)

1. Password-length floor (12) is duplicated as a literal constant across 3 DTOs instead of reading `AuthConfig.passwordMinLength` — intentionally documented (class-validator decorators run at import time before `ConfigService` exists). Low risk; consider a shared constants file.

2. Regarding the previously-raised "password-reset confirm does not explicitly state 'token consumed' in the response body" — checked against spec.md and design.md: **neither document requires a response-body message on `password-reset/confirm`**; the only requirement is the `200` status. Design D11 (cited in the original ask) concerns mail delivery via the outbox, not this endpoint's response shape, so it does not apply here either. This is not a real gap against any MUST requirement — pure UX polish, optional.

---

## Verdict

**PASS WITH WARNINGS** (0 CRITICAL / 4 WARNING / 2 SUGGESTION).

**Summary**: All 4 CRITICAL issues from the prior FAIL verdict are confirmed resolved by direct re-execution: unit 714/714 (77 suites), e2e 134/134 (15 suites, including the new `invitations.e2e-spec.ts` and `invitations-repository.e2e-spec.ts` against real Testcontainers Postgres+Redis), typecheck/build/lint all clean, tasks.md 75/75 checked, apply-progress persisted. Spec compliance improved from 0/10 to 9/10 fully COMPLIANT scenarios (1 PARTIAL, 0 UNTESTED). All 12 design decisions (D1-D12) are followed and, for the safety-critical ones (D3 CAS concurrency, D5 spares-nobody, D6 multi-row revoke, D11 mail escaping), now proven under real infrastructure rather than mocks. Remaining WARNINGs are documentation-accuracy issues (spec.md text disagreeing with intentional, correct design/implementation choices on two status codes), one process-integrity gap (migration idempotence claimed but not locally re-verified), and one scenario-combination gap (low risk, mechanism proven separately). None of these block functional correctness or safety. Recommend proceeding to **sdd-archive**, with a follow-up task to amend `spec.md` lines 51 and 85 to match the shipped (and now-proven-correct) 202/400 behavior.
