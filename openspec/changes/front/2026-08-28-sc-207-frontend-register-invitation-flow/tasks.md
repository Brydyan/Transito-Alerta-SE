# Tasks: SC-207 — Frontend Register via Invitation Flow

Source: spec `sdd/.../spec` (#590), design `sdd/.../design` (#594), proposal #583.
Scope: frontend only (backend complete). Estimate: 1-1.5 days.

## Phase 1: AuthService Extension (sequential — foundation)

- [ ] T1.1 `auth.service.ts`: add `previewInvitation(token): Observable<InvitationPreview>` → `GET {apiUrl}/invitations/preview?token=...`; map 404/410 via existing `handleError`.
  Spec: "Preview invitation on load", "Invalid token (404)"
- [ ] T1.2 `auth.service.ts`: add `acceptInvitation(dto: AcceptInvitationDto): Observable<AuthTokens>` → `POST /auth/accept-invitation`; call `persistTokens()`/`handleLoginSuccess()` on 201; propagate 422/409/410 via `handleError`.
  Spec: "Accept invitation succeeds (auto-login)", "Accept invitation validation failure (422)", "Expired or already-used token (410)"
- [ ] T1.3 `auth.model.ts`: add `AcceptInvitationDto { token, password, terms_version? }`. Parallel with T1.4.
  Spec: "Set password with client-side validation"
- [ ] T1.4 `auth.model.ts`: add `InvitationPreview { organization_name, inviter_name, role_name, expires_at }`; remove deprecated `RegisterRequest`/`RegisterResponse`. Parallel with T1.3.
  Spec: "Display invitation preview"
- [ ] T1.5 Verify `auth.service.ts` register() stub now throws/removed per design (410 tombstone alignment); confirm no remaining self-service register callers.
- [ ] T1.6 [TEST] `auth.service.spec.ts`: cover `previewInvitation` success + 404, `acceptInvitation` success (201, auto-login) + 422 + 410. Target >=70% coverage. Depends on T1.1-T1.4.

## Phase 2: AcceptInvitationComponent (sequential within phase; depends on Phase 1)

- [ ] T2.1 Create `features/auth/accept-invitation/accept-invitation.component.ts`: standalone, `ChangeDetectionStrategy.OnPush`; signals `invitation`, `loading`, `error`, `submitted`; `ngOnInit` reads `ActivatedRoute.snapshot.queryParamMap.get('token')`, clears any existing session, calls `previewInvitation`.
  Spec: "Preview invitation on load", "Route available without guest guard"
- [ ] T2.2 Create `accept-invitation.component.html`: render "You're invited by {inviter_name} to join {organization_name} as {role_name}" + expiry; `ReactiveFormsModule` password field (`Validators.minLength(12)`); submit button disabled while `loading()`; inline error text (no toast).
  Spec: "Display invitation preview", "Set password with client-side validation"
- [ ] T2.3 Implement submit handler: call `authService.acceptInvitation({ token, password })`; on 201 tokens are persisted automatically; `router.navigate(['/app/dashboard'])`; on error set `error` signal, allow retry.
  Spec: "Accept invitation succeeds (auto-login)"
- [ ] T2.4 Handle missing token query param: set `error.set('No invitation token provided')`, skip preview call. Depends on T2.1.
- [ ] T2.5 Handle 404 from preview: `error.set('Invitation not found')`. Depends on T2.1.
  Spec: "Invalid token (404)"
- [ ] T2.6 Handle 410 from preview/accept: `error.set('Invitation expired or already used')`. Depends on T2.1/T2.3.
  Spec: "Expired or already-used token (410)"
- [ ] T2.7 [TEST] `accept-invitation.component.spec.ts`: preview render, password min-length validation, submit→navigate, 404/410/422/missing-token error states. Target >=70% coverage. Depends on T2.1-T2.6.

## Phase 3: Route Integration (sequential; depends on Phase 2)

- [ ] T3.1 `app.routes.ts`: add `{ path: 'accept-invitation', loadComponent: () => AcceptInvitationComponent }` — no `canActivate`/`guestGuard`.
  Spec: "Route available without guest guard"
- [ ] T3.2 Verify route ordering has no conflict with `/auth/login`, `/login`, wildcard/redirect routes.
- [ ] T3.3 [TEST] Route harness: navigating to `/accept-invitation?token=...` resolves `AcceptInvitationComponent` without redirect. Depends on T3.1.

## Phase 4: Validation + Coverage Gate (sequential; depends on Phases 1-3)

- [ ] T4.1 Run `npm run test` (Jest) — `auth.service.spec.ts` + `accept-invitation.component.spec.ts` pass.
- [ ] T4.2 Run `tsc --noEmit` — zero TypeScript errors.
- [ ] T4.3 Verify coverage report: `auth.service.ts` and `accept-invitation.component.ts` >=70%.
- [ ] T4.4 Manual smoke test: seeded/mocked invitation token → preview renders → accept → auto-login → `/app/dashboard`.

## Phase 5: Documentation (parallel with Phase 4)

- [ ] T5.1 Update `MIGRATION_LOG.md`/changelog if applicable (self-service register removal, new invitation route).
- [ ] T5.2 Document flow (README or design addendum): preview → password form → accept → auto-login → dashboard.

## Acceptance Criteria
- [ ] AuthService: `previewInvitation()` + `acceptInvitation()` implemented per design contracts
- [ ] `AcceptInvitationComponent` routed at `/accept-invitation?token=...`, no `guestGuard`
- [ ] 404/410/422/missing-token errors caught and shown inline (no toast)
- [ ] Password form enforces `minLength(12)` client-side; backend authoritative
- [ ] 201 accept response auto-persists tokens and navigates to `/app/dashboard`
- [ ] `auth.service.ts` + `accept-invitation.component.ts` >=70% test coverage
- [ ] `RegisterRequest`/`RegisterResponse` models removed

## Dependency Notes
Phase 1 → Phase 2 → Phase 3 → Phase 4/5 (Phase 5 may run alongside Phase 4). Within Phase 1, T1.3/T1.4 (models) can be done in parallel with each other before/alongside T1.1/T1.2. Test tasks (T1.6, T2.7, T3.3) depend on their phase's implementation tasks completing first.
