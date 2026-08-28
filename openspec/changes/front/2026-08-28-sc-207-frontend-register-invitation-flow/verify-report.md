# Verify Report (Re-verify #4): SC-207 — Frontend Register via Invitation Flow

File: `openspec/changes/front/2026-08-28-sc-207-frontend-register-invitation-flow/verify-report.md` (hybrid). Source: spec #590, design #594, tasks #595, apply-progress (file only, never persisted to Engram).

**Verdict**: FAIL (7 CRITICAL, 4 WARNING, 2 SUGGESTION). Zero net progress since Re-verify #3 (#598) — code is byte-identical to the last FAIL. Same root cause flagged a 4th time.

## User's 7 checklist items (caveman mode)

1. AcceptInvitationComponent standalone + signals + ReactiveForms? **YES structurally** — `signal()`, `computed()`, `FormBuilder`/`ReactiveFormsModule`, `OnPush` all present in `accept-invitation.component.ts`. BUT it implements the WRONG flow (see #7).
2. previewInvitation + acceptInvitation in AuthService? **HALF** — `acceptInvitation()` exists (auth.service.ts:141-148). `previewInvitation()` does NOT exist. `grep -rn "previewInvitation" frontend/src` → zero hits.
3. InvitationPreview + AcceptInvitationDto models exist? **NO** — `InvitationPreview` interface: zero hits anywhere in frontend/src. `AcceptInvitationDto`: doesn't exist either; code has `AcceptInvitationRequest` instead (different name, same 3 fields — functionally close but not what design specified).
4. Route without guestGuard? **NO** — `app.routes.ts:28` → `canActivate: [guestGuard]` still present on `/accept-invitation`. Design decision table explicitly says no guestGuard ("guestGuard redirects authed users away, breaking invitation links"). apply-progress.md defends keeping it, contradicting the design artifact.
5. RegisterRequest/RegisterResponse removed? **NO** — both interfaces still in `auth.model.ts:60-68`, only `@deprecated`-tagged, not deleted.
6. Component spec exists + tests green ≥70%? **NO** — `accept-invitation.component.spec.ts` does not exist on disk (`ls` of the component dir shows only `.ts`/`.html`/`.css`). Zero component-level tests. The on-disk `tasks.md` (stale copy, see Root Cause) falsely marks B.4.3 "Component spec" as `[x]` complete — it is not.
7. Data flow preview→form→submit? **NO** — there is no preview step at all. Actual flow: token read from `?token=` query param → pre-filled/locked into the SAME form as password/confirm/terms → single submit → `acceptInvitation()`. The component never calls a preview endpoint, never shows `inviter_name`/`organization_name`/`role_name`/`expires_at`. This is a materially different (and simpler) flow than the one in design.md's Data Flow section.

## Test execution (this session)

`npx jest --testPathPatterns=auth --coverage`:
- **2 suites, 17 tests, 17 passed, 0 failed.** Same count as Re-verify #3.
- Suites run: `auth.service.spec.ts`, `auth.interceptor.spec.ts`. No `accept-invitation.component.spec.ts` suite exists to run.
- Coverage: `auth.service.ts` 89.15% stmts / 66.66% branch / 81.25% funcs — passes ≥70% on its own.
- `accept-invitation.component.ts`: **not present in the coverage report at all** — zero test imports it, so it has no coverage signal. Design's ≥70% coverage target on "new/modified code" is not met for this file.
- 4 SC-207 tests confirmed by name in `auth.service.spec.ts` (SC-207.1–4): post body, terms_version forwarding, 422 field errors, 410 invitation-used. All service-layer only.

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Accept Invitation Flow | Preview invitation on load | none found | ❌ UNTESTED (feature not implemented) |
| Accept Invitation Flow | Display invitation preview | none found | ❌ UNTESTED (feature not implemented) |
| Accept Invitation Flow | Set password with client-side validation | none (no component spec) | ❌ UNTESTED |
| Accept Invitation Flow | Accept invitation succeeds (auto-login) | `auth.service.spec.ts > SC-207.1` | ⚠️ PARTIAL (service layer only, no component-level proof of navigate-to-dashboard) |
| Accept Invitation Flow | Invalid token (404) | none found | ❌ UNTESTED (component maps 401/404 the same, no test covers either) |
| Accept Invitation Flow | Expired or already-used token (410) | `auth.service.spec.ts > SC-207.4` | ⚠️ PARTIAL (service layer only) |
| Accept Invitation Flow | Accept invitation validation failure (422) | `auth.service.spec.ts > SC-207.3` | ⚠️ PARTIAL (service layer only) |
| Accept Invitation Flow | Route available without guest guard | none (and guard IS present, contradicting the requirement) | ❌ FAILING |

**Compliance summary**: 0/8 fully compliant, 3/8 partial (service-layer only), 5/8 failing/untested. Identical to Re-verify #3.

## Coherence vs design.md

**Followed**: AuthService extension pattern (no new service), inline error signal (`errorMessage`), `ActivatedRoute.snapshot.queryParamMap` token source, standalone/OnPush/signals component structure, password `minLength(12)`.

**NOT followed**:
- `previewInvitation()` / `InvitationPreview` — entire preview leg of the design is absent.
- guestGuard removal — guard still applied, contradicting the design decision table.
- `AcceptInvitationDto` naming/shape — implemented as `AcceptInvitationRequest` instead.
- `register()` stub removal — kept as a throwing stub, undocumented deviation in design.md itself (only documented in apply-progress.md).
- `accept-invitation.component.spec.ts` — never created.
- Data Flow section (`token → preview → password form → accept`) — actual flow skips the preview step entirely.

## Root cause (flagged 4th time)

The on-disk `tasks.md` at `openspec/changes/front/2026-08-28-sc-207-.../tasks.md` still opens with "no proposal/design existed; tasks inferred from the SC-203 P2 deferral note" — this is false; `design.md` (Engram #594) has the full preview contract, the no-guestGuard decision, and the model/file list. The apply pass keeps targeting this stale, self-invented tasks.md instead of the real design/spec contract, so the preview flow, guestGuard removal, model cleanup, and component spec are never attempted. `apply-progress.md` shows the same implementer decisions as the prior 3 verify cycles — no new work was done between Re-verify #3 and this pass.

## Recommendation

**Do NOT archive.** Route back to `sdd-apply` with an explicit instruction to implement against `design.md`/`spec.md` (topic keys `sdd/2026-08-28-sc-207-frontend-register-invitation-flow/design` #594 and `.../spec` #590) — NOT the stale on-disk `tasks.md`. Missing work:
1. `AuthService.previewInvitation(token)` → `GET {apiUrl}/invitations/preview?token=...`, returns `InvitationPreview`.
2. `InvitationPreview` model in `auth.model.ts`.
3. Component: call preview on `ngOnInit`, render inviter/org/role/expiry, THEN show the password form.
4. Remove `canActivate: [guestGuard]` from the `/accept-invitation` route; clear existing session in `ngOnInit` instead.
5. Delete `RegisterRequest`/`RegisterResponse` from `auth.model.ts` (not just deprecate).
6. Create `accept-invitation.component.spec.ts` covering preview render, 404/410/422, validation, submit→navigate. Target ≥70% coverage on the component file.
7. Correct or regenerate the on-disk `tasks.md` so it matches design.md and stops producing false `[x]` completion claims.
8. Persist `apply-progress.md` to Engram (hybrid contract still broken — 0 hits on search for that topic key).

## Issues Found

**CRITICAL** (must fix before archive):
1. `previewInvitation()` missing entirely from `AuthService`.
2. `InvitationPreview` model missing entirely from `auth.model.ts`.
3. `/accept-invitation` route still has `canActivate: [guestGuard]` — design/spec explicitly require no guard.
4. `RegisterRequest`/`RegisterResponse` not removed from `auth.model.ts` (only `@deprecated`-tagged).
5. `accept-invitation.component.spec.ts` does not exist — zero component-level tests; on-disk tasks.md falsely marks this `[x]` complete.
6. Preview UI (inviter/org/role/expiry display) not implemented — spec scenario "Display invitation preview" has no code path.
7. Data flow contradicts design: no preview step; component goes straight from token-in-URL to a single combined form, skipping the `token → preview → password form → accept` sequence design.md specifies.

**WARNING** (should fix):
1. `AcceptInvitationRequest` used instead of design's `AcceptInvitationDto` (same 3 fields, different name — low risk but a spec/design drift).
2. `register()` throwing stub kept instead of removed per design's File Changes table; deviation is documented in apply-progress.md but design.md was never updated to reflect it.
3. `accept-invitation.component.ts` has 0% test coverage — no test file imports it at all.
4. On-disk `tasks.md` under `openspec/changes/front/...` is stale/wrong-scope relative to the Engram-authoritative design/spec/tasks (#594/#590/#595) — causes false completion signals on every apply/verify cycle.

**SUGGESTION** (nice to have):
1. `frontend/e2e/accept-invitation.e2e.ts` has 2 skipped tests (no real invitation token in CI) — fine for now, but flag for a future CI seed-token strategy.
2. Once preview flow lands, reconcile `openspec/changes/front/...` path vs the path referenced inside the Engram spec/design/tasks content (`openspec/changes/2026-08-28-sc-207-...` without the `front/` segment) to avoid future path confusion.

## Verdict

**FAIL** — 7 CRITICAL blockers. Core spec requirement (invitation preview before password entry, no-guestGuard route, model cleanup, component test coverage) remains unimplemented across 4 consecutive verify cycles. Do not archive; re-route to sdd-apply targeting design.md/spec.md directly.
