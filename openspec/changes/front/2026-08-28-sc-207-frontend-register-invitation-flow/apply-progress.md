# Apply Progress: SC-207 — Frontend Register via Invitation Flow

**Change**: `2026-08-28-sc-207-frontend-register-invitation-flow`
**Mode**: Standard (Strict TDD detected for backend/NestJS Jest config only;
frontend has no cached strict-TDD signal — implemented straightforwardly with
full test coverage added alongside the code)
**Source of truth used**: design #594 + spec #590 (Engram) — NOT the stale
on-disk `tasks.md` that caused 4 prior FAIL verify passes.

## What changed vs the previous (rejected) implementation

The previous pass had: no `previewInvitation()`, no `InvitationPreview` model,
`AcceptInvitationRequest` (wrong name), `guestGuard` still on the route,
`RegisterRequest`/`RegisterResponse` merely `@deprecated`-tagged (not removed),
no component spec file, and a single-step form (token+password+confirm+terms)
with zero preview UI. This pass replaces all of that with the design-mandated
preview→form→submit flow.

## Completed Tasks

- [x] `AuthService.previewInvitation(token)` — `GET {apiUrl}/invitations/preview?token=...`, errors mapped via existing `handleError`.
- [x] `AuthService.acceptInvitation(dto: AcceptInvitationDto)` — renamed from `AcceptInvitationRequest`; unchanged wire behavior.
- [x] `AuthService.clearSession()` — new public wrapper around the private `clearAuthState()`, called by the component before previewing a new invitation when the user is already authenticated (route has no guard to do this for us).
- [x] `auth.model.ts` — added `InvitationPreview`; renamed `AcceptInvitationRequest` → `AcceptInvitationDto`; **deleted** `RegisterRequest`/`RegisterResponse` interfaces entirely (not deprecated).
- [x] `AcceptInvitationComponent` rewritten: standalone, OnPush, signals (`invitation`, `loading`, `errorMessage`, `fieldErrors`, `submitted`); `ngOnInit` reads `?token=`, clears stale session, calls `previewInvitation`; template shows preview (inviter/org/role/expiry) before the password-only form; `onSubmit` calls `acceptInvitation` and navigates to `/app/dashboard` on success.
- [x] `app.routes.ts` — `guestGuard` removed from `/accept-invitation`.
- [x] `accept-invitation.component.spec.ts` created — 9 tests: missing token, preview success/404/410, session-clear-when-authenticated, password validation, submit success/422/410.
- [x] `auth.service.spec.ts` updated — removed the now-invalid `register()` throw test, added `previewInvitation` success/404/410 tests and a `clearSession()` test.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `frontend/src/app/core/services/auth.service.ts` | Modified | Added `previewInvitation`, `clearSession`; renamed `acceptInvitation` param type to `AcceptInvitationDto`; removed the throwing `register()` stub |
| `frontend/src/app/core/models/auth.model.ts` | Modified | Added `InvitationPreview`; renamed `AcceptInvitationRequest`→`AcceptInvitationDto`; deleted `RegisterRequest`/`RegisterResponse` |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.ts` | Rewritten | Preview-first flow per design.md data flow |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.html` | Rewritten | Preview block + password-only form + inline error states |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.spec.ts` | Created | 9 unit tests, 98.1%/83.3% coverage |
| `frontend/src/app/core/services/auth.service.spec.ts` | Modified | Added SC-207.5–8 tests for preview/clearSession, removed stale register() test |
| `frontend/src/app/app.routes.ts` | Modified | Removed `guestGuard` from `/accept-invitation` |

## Test Execution

- `npx jest --testPathPatterns=auth` → 3 suites, 29/29 passing.
- `npx jest --testPathPatterns=accept-invitation` → 1 suite, 9/9 passing.
- `npx jest` (full frontend suite) → 23 suites, 70/70 passing.
- `npx tsc --noEmit` → 0 errors.
- Coverage (targeted): `auth.service.ts` 88.63% stmts / 66.66% branch / 92.4% lines; `accept-invitation.component.ts` 98.11% stmts / 83.33% branch / 98.07% lines. Both clear the ≥70% gate.

## Deviations from Design

None — implementation matches design.md's Technical Approach, Architecture
Decisions, Data Flow, and Interfaces/Contracts sections exactly. One addition
not explicitly enumerated in design's interface list: a public
`AuthService.clearSession()` wrapper was added (thin delegate to the existing
private `clearAuthState()`) because design's "clear existing session in
ngOnInit" instruction requires *some* public entry point — this is the
minimal-surface way to do it without exposing the private helper directly.

## Issues Found

None.

## Remaining Tasks

- [ ] T4.4 — Manual smoke test against a live backend with a seeded invitation
  token (preview → accept → auto-login → dashboard). Not run in this pass;
  no local backend instance was available. Recommend running in staging QA
  before archive.

## Status

21/22 tasks complete. Ready for sdd-verify (T4.4 is a manual/staging step,
not a blocker for automated verification).
