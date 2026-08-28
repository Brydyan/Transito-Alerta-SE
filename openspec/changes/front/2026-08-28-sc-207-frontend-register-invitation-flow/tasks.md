# Tasks: SC-207 — Frontend Register via Invitation Flow

**Change**: `2026-08-28-sc-207-frontend-register-invitation-flow`
**CORRECTED 2026-08-28** — this file previously ignored `design.md` (#594
in Engram) and `spec.md` (#590) and self-invented a different flow
(single-step form with token/password/confirm/terms, no preview step,
`AcceptInvitationRequest` naming, `guestGuard` kept). That caused 4
consecutive FAIL verify passes. This revision matches the real
tasks artifact (Engram `sdd/2026-08-28-sc-207-frontend-register-invitation-flow/tasks`,
#595), sourced from spec #590 + design #594 + proposal #583.

Scope: frontend only (backend complete). Total: 22 tasks across 5 phases.

## Phase 1: AuthService Extension (sequential — foundation)

- [x] T1.1 `auth.service.ts`: `previewInvitation(token)` → `GET {apiUrl}/invitations/preview?token=...`; maps 404/410 via `handleError`.
- [x] T1.2 `auth.service.ts`: `acceptInvitation(dto)` → `POST /auth/accept-invitation`; `persistTokens`/`handleLoginSuccess` on 201; propagates 422/409/410.
- [x] T1.3 `auth.model.ts`: add `AcceptInvitationDto { token, password, terms_version? }`.
- [x] T1.4 `auth.model.ts`: add `InvitationPreview { organization_name, inviter_name, role_name, expires_at }`; **removed** (not deprecated) `RegisterRequest`/`RegisterResponse`.
- [x] T1.5 Verified `register()` stub removed entirely (no remaining callers grepped).
- [x] T1.6 [TEST] `auth.service.spec.ts`: preview success+404+410, accept success(201/auto-login)+422+410, `clearSession()`. 29/29 passing.

## Phase 2: AcceptInvitationComponent (sequential; depends on Phase 1)

- [x] T2.1 `accept-invitation.component.ts`: standalone, OnPush; signals `invitation`/`loading`/`errorMessage`/`fieldErrors`/`submitted`; `ngOnInit` reads token from `queryParamMap`, clears existing session via `authService.clearSession()` if authenticated, calls `previewInvitation`.
- [x] T2.2 `accept-invitation.component.html`: preview text (inviter/org/role/expiry via `date` pipe), ReactiveForms password (`minLength(12)`), submit disabled while loading/invalid, inline error banner (no toast).
- [x] T2.3 Submit handler: `acceptInvitation({ token, password })`; on 201 navigates to `/app/dashboard`; on error sets `errorMessage`, allows retry.
- [x] T2.4 Missing token: `errorMessage.set('No se proporcionó un token de invitación.')`, no `previewInvitation` call, no form rendered.
- [x] T2.5 404 (preview or accept): `errorMessage.set('Invitación no encontrada.')`.
- [x] T2.6 410 (preview or accept): `errorMessage.set('La invitación expiró o ya fue utilizada.')`.
- [x] T2.7 [TEST] `accept-invitation.component.spec.ts`: preview render, missing-token, 404/410 preview, password validation, submit→navigate, 422 field errors, 410 on submit, session-clear-on-authenticated. 9/9 passing, 98.1%/83.3% coverage.

## Phase 3: Route Integration (sequential; depends on Phase 2)

- [x] T3.1 `app.routes.ts`: `{ path: 'accept-invitation', loadComponent }` — **no** `guestGuard` (removed; component self-clears session instead).
- [x] T3.2 Verified no route conflicts with `/login`, wildcard/redirect (routes list checked manually).
- [x] T3.3 [TEST] Covered indirectly via component spec (ActivatedRoute harness with `convertToParamMap`); no separate route-resolution suite added — component tests exercise the same contract.

## Phase 4: Validation + Coverage Gate (sequential; depends on Phases 1-3)

- [x] T4.1 `npx jest` (full suite) — 23 suites / 70 tests passing.
- [x] T4.2 `tsc --noEmit` — zero errors.
- [x] T4.3 Coverage: `auth.service.ts` 88.6%/66.7% branch; `accept-invitation.component.ts` 98.1%/83.3% branch — both ≥70% statement/line threshold.
- [ ] T4.4 Manual smoke test with seeded/mocked token against a running backend — not run in this pass (no local backend instance available); deferred to staging QA per design.md rollout notes.

## Phase 5: Documentation (parallel with Phase 4)

- [x] T5.1 This file corrected in place; apply-progress.md updated (see sibling file + Engram `sdd/.../apply-progress`).
- [x] T5.2 Data flow documented in `accept-invitation.component.ts` header comment: preview → password form → accept → auto-login → dashboard.

## Acceptance Criteria

AuthService preview+accept per contracts; route at `/accept-invitation?token=...` with no `guestGuard`; 404/410/422/missing-token errors shown inline; password `minLength(12)` client-side (backend authoritative); 201 auto-persists tokens + navigates to `/app/dashboard`; ≥70% coverage on both new/modified files; `RegisterRequest`/`RegisterResponse` removed (not deprecated).

**Status**: 21/22 tasks complete. Only T4.4 (manual staging smoke test) remains — requires a live backend with a seeded invitation token, out of scope for this automated pass.

Related: Engram `sdd/2026-08-28-sc-207-frontend-register-invitation-flow/spec` (#590), `.../design` (#594), `.../tasks` (#595)
