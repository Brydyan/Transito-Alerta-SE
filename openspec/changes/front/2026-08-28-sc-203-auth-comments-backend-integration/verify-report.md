# Verification Report (2nd pass — post Minimax contract-realignment fixes)

**Change**: `2026-08-28-sc-203-auth-comments-backend-integration`
**Mode**: Standard (Strict TDD config present but this is a re-verify pass)
**Verified by**: sdd-verify (2nd pass), re-reading real backend source + running tests directly

---

## Context

1st pass (`verify-report.md` v1, engram #578) found 3 blocking CRITICALs:
1. Auth contract snake_case mismatch (frontend guessed camelCase `accessToken`/`user{...}`, real backend returns `{access_token, refresh_token, permissions}`)
2. `POST /auth/register` is a 410 Gone tombstone on the backend but frontend had a live, wired `RegisterComponent`
3. Unit test fixtures mocked the same wrong fictional shape as the implementation (tests were self-referential, proved nothing)

Minimax executed a 2nd pass. This report re-verifies against the real backend source and re-executes tests directly (not trusting the apply-progress claims).

---

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | ~87 (25 top-level + subtasks) |
| Tasks `[x]` | 52 |
| Tasks `[ ]` | 35 — all accounted for: Fase B (11, deferred to P2, backend is 410), F1.3/F1.4/F2.3/F2.4 (4, require live Playwright run against seeded backend), Acceptance Criteria + Status Tracking checklist rollups at bottom of tasks.md (20, cosmetic — not re-ticked even though their constituent subtasks are done) |

No incomplete CODE tasks. All incomplete items are either explicitly deferred (documented) or execution-only (Playwright against a live server).

---

### Build & Tests Execution

**Build (`tsc --noEmit`)**: PASSED — zero errors.

**Tests — directly executed** (`node_modules/.bin/jest`, not `pnpm jest` which failed on this machine due to an unrelated pnpm build-approval prompt):

```
Changed suites only:
  auth.service.spec.ts        8 tests  — PASS
  comment.service.spec.ts     8 tests  — PASS
  auth.interceptor.spec.ts    5 tests  — PASS
  Total: 3 suites, 21/21 PASS

Full frontend suite:
  Test Suites: 2 failed, 20 passed, 22 total
  Tests:       51 passed, 51 total
```

The 2 failing suites (`header.spec.ts`, `main-layout.spec.ts`) fail with `Vitest cannot be imported in a CommonJS module` — they import `vi` from `vitest` inside a Jest config. Confirmed pre-existing and unrelated: `git log` shows these files were last touched in commit `519e879` ("feat: funcionamiento base del loggin del sistema"), and `git status` shows zero pending changes to `frontend/src/app/layout/` in this change. Not introduced by this change.

**Coverage**: Not measured this pass (not required — focus was contract correctness).

---

### Spec Compliance Matrix — Auth (`specs/auth/spec.md`)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| R1.1 | Successful login | `auth.service.spec.ts` — login(device_uuid), login(email+password) | ✅ COMPLIANT (tokens/isAuthenticated/persistence) — ⚠️ spec text says `userSignal` populates `{email,name,roleId,roleName}` from login; real backend `/auth/me` only returns `user_id/device_uuid/permissions`, those 4 fields are always `null` by design. Spec text is stale, not the code. |
| R1.2 | Failed login (401) | `auth.service.spec.ts` E1.3 | ✅ COMPLIANT |
| R1.3 | Network error | (none found) | ❌ UNTESTED — no explicit test for `status:0` network-failure path, though `handleError` code handles it |
| R2.1–R2.3 | Register (success/422/409) | (none — register removed) | ⚠️ DEVIATED BY DESIGN — backend `/auth/register` is 410 Gone; `authService.register()` now throws a clear deferral error, `RegisterComponent` deleted, zero remaining callers/routes. Correct engineering call, but `specs/auth/spec.md` R2 still describes a live register flow — doc not updated to reflect the deferral (tasks.md already documents it correctly) |
| R3.1 | Auto-refresh before expiry (pre-flight, 2-min window) | (none — feature dropped) | ⚠️ DEVIATED BY DESIGN — real `AuthTokens` doesn't expose token expiry, so pre-flight refresh is impossible; replaced with refresh-on-401. Verified correct and necessary via `backend/src/modules/auth/auth.service.ts` (no expiry field returned). `specs/auth/spec.md` R3.1 not updated to reflect this |
| R3.2 | Refresh token expired | `auth.service.spec.ts` E1.5, `auth.interceptor.spec.ts` E3.4 | ✅ COMPLIANT |
| R4.1 | Logout | `auth.service.spec.ts` E1.6 | ✅ COMPLIANT |
| R5.1 | Token persisted across reload | (none found — code exists: constructor reads localStorage + `fetchUser()`) | ⚠️ PARTIAL — implemented, no dedicated rehydration test |
| R5.2 | Token cleared on logout | `auth.service.spec.ts` E1.6 | ✅ COMPLIANT |
| R6.1 | JWT injected on authed calls | `auth.interceptor.spec.ts` E3.1 | ✅ COMPLIANT |
| R6.2 | No JWT on unauthed calls | `auth.interceptor.spec.ts` E3.2 | ✅ COMPLIANT |
| R7.1 | Concurrent calls single-flight refresh | (none found — code exists: `refreshInProgress$` + `shareReplay(1)`) | ⚠️ PARTIAL — implemented, no dedicated concurrent-call test (was present pre-2nd-pass, dropped along with the pre-flight tests) |

**Compliance summary**: 7/12 fully compliant, 4 partial/deviated-by-design (all with sound engineering justification), 1 untested edge case. Zero regressions vs. what the real backend supports.

### Spec Compliance Matrix — Comments (`specs/comments/spec.md`)

Unchanged from 1st pass (Fase C was not touched in the 2nd-pass fix, already verified correct against `backend/src/modules/comments/`). Re-confirmed this pass:

| Requirement | Test | Result |
|---|---|---|
| R1.1/R1.2/R1.3 Fetch | `comment.service.spec.ts` — getComments success/404 | ✅ COMPLIANT |
| R2.1 Create | `comment.service.spec.ts` — createComment (body `{content, incident_id}`, matches `backend/src/modules/comments/dto/create-comment.dto.ts`) | ✅ COMPLIANT |
| R3.1 Update | `comment.service.spec.ts` — updateComment (PATCH `/comments/:id`) | ✅ COMPLIANT |
| R4.1 Delete | `comment.service.spec.ts` — deleteComment | ✅ COMPLIANT |
| R5.1 Image stub | `comment.service.spec.ts` — uploadCommentImage | ✅ COMPLIANT (stub only, as spec requires) |
| R7.1/R7.2 Reactive cache | `comment.service.spec.ts` — getComments$, clearCache | ✅ COMPLIANT |

Note: spec.md still uses `text`/`author_id` field names (stale, inherited from Gemini's proposal draft); actual backend + code correctly use `content` and derive the author from the JWT. Code is right, doc is wrong — same pattern flagged in the 1st pass, not fixed this pass (out of Fase C scope, no regression).

---

### Correctness (Static — Structural Evidence, cross-checked against real backend source)

| Requirement | Status | Notes |
|---|---|---|
| `AuthTokens` shape matches backend | ✅ Implemented | `frontend/src/app/core/models/auth.model.ts:21-25` == `backend/src/modules/auth/auth.service.ts:63-65` (`access_token`, `refresh_token`, `permissions`, snake_case, verified byte-for-byte) |
| `LoginRequest` matches backend `LoginDto` | ✅ Implemented | `auth.model.ts:9-13` (`device_uuid?`/`email?`/`password?`) == `backend/src/modules/auth/dto/login.dto.ts` (`ExactlyOneCredential` validator) |
| `RefreshRequest` matches backend `RefreshDto` | ✅ Implemented | `{refresh_token}` in body == `backend/src/modules/auth/dto/refresh.dto.ts:6` |
| Register removed cleanly | ✅ Implemented | `RegisterComponent` directory deleted (`find frontend/src/app/features/auth` shows no register/*), zero remaining callers of `authService.register()` outside its own file + its spec, zero route references in `app.routes.ts` |
| Interceptor handles snake_case tokens | ✅ Implemented | `auth.interceptor.ts` reads `authService.token()` (alias for `accessToken` signal, holds `tokens.access_token` value) — no residual camelCase wire-field references anywhere in `auth.service.ts`/`auth.interceptor.ts` |
| Unit test fixtures use real contract | ✅ Implemented | `auth.service.spec.ts` + `auth.interceptor.spec.ts` fixtures are 100% snake_case (`access_token`, `refresh_token`, `permissions`, `user_id`, `device_uuid`) — verified line-by-line, zero leftover camelCase expectations |
| Comment service (Fase C) | ✅ Implemented (no regression) | Endpoints, DTO field names (`content`, `incident_id`) match `backend/src/modules/comments/` exactly |

---

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| Use real backend `AuthTokens` contract | ✅ Yes | Confirmed via direct backend source read, not just trusting apply-progress claims |
| Register deferred, not faked | ✅ Yes | Clean removal + explanatory error, not a silent no-op |
| Pre-flight refresh (2-min window) | ⚠️ Deviated (necessary) | Backend doesn't expose expiry; refresh-on-401 substituted. Sound tradeoff, but `design.md`/`specs/auth/spec.md` still describe the old pre-flight design — should be updated for documentation accuracy before/at archive |

---

### Issues Found

**CRITICAL** (must fix before archive):
None. All 3 previously-blocking CRITICALs are resolved and independently re-verified against the actual backend source (not just re-reading Minimax's claims) plus real `jest`/`tsc` execution on this machine.

**WARNING** (should fix, non-blocking):
1. `specs/auth/spec.md` R2 (Register) and R3.1 (pre-flight refresh) describe behavior that no longer exists in the code, for good reason (backend constraints), but the spec doc was never updated to reflect the 2nd-pass deviations. Recommend a short addendum/errata section in the spec (or an explicit "superseded by 2nd-pass" note) before archive, so future readers don't treat the stale spec as current truth.
2. `apply-progress.md` contains duplicated and contradictory content: the top of the file correctly documents the 2nd-pass snake_case fix, but further down there are two leftover "Resumen"/"Decisiones técnicas" sections from the 1st pass that still claim the old camelCase/`user{email,nombre,rolId,...}` shape is "the real backend contract" (`mantengo el shape real del backend`). This is now factually false and could mislead anyone reading the file top-to-bottom without cross-checking dates. Recommend cleaning up before archive.
3. R1.3 (network error / `status:0`) has no dedicated unit test, though the `handleError` code path exists.

**SUGGESTION** (nice to have):
1. Add a dedicated concurrent-refresh test at the interceptor level (fire 3 calls while a refresh is in flight, assert only 1 `POST /auth/refresh`) — was present pre-2nd-pass, dropped along with the pre-flight tests; the single-flight guard (`refreshInProgress$` + `shareReplay(1)`) deserves direct coverage since it's the concurrency-safety mechanism.
2. Add a token-rehydration-on-reload test (`localStorage` pre-seeded → new `AuthService` instance → `isAuthenticated()===true` without an HTTP login call).
3. Re-tick the "Acceptance Criteria" and "Status Tracking" checklist rollups at the bottom of `tasks.md` — cosmetic only, their underlying subtasks are already done.
4. `specs/comments/spec.md` still uses `text`/`author_id` field names instead of the real `content` — same doc-drift pattern as the auth spec, not blocking (code is correct), carried over unresolved from 1st pass.

---

### Verdict
**PASS WITH WARNINGS**

All 3 previously-blocking CRITICALs are genuinely fixed — independently confirmed by reading the real backend source (`backend/src/modules/auth/`, `backend/src/modules/comments/`) and re-executing tests directly on this machine (21/21 changed-suite tests pass, `tsc --noEmit` clean, full suite 51/51 passing with 2 confirmed-pre-existing-and-unrelated failures). This code can authenticate against the real NestJS backend: request/response shapes match byte-for-byte on both sides of the wire for login, refresh, logout, and `/me`.

Remaining issues are documentation drift (spec.md not updated to reflect legitimate 2nd-pass deviations) and missing edge-case tests — none of which block functional correctness. Recommend: archive now, optionally spin the doc cleanup into a fast-follow or do it as part of archive housekeeping.
