# Tasks: SC-207 — Frontend Register via Invitation Flow

Scope: frontend only (backend complete). Estimate: 1-1.5 days. Total: 22 tasks across 5 phases.

## Phase 1: AuthService Extension (sequential — foundation)
- T1.1 auth.service.ts: previewInvitation(token) -> GET {apiUrl}/invitations/preview?token=...; map 404/410 via handleError. Spec: "Preview invitation on load", "Invalid token (404)"
- T1.2 auth.service.ts: acceptInvitation(dto) -> POST /auth/accept-invitation; persistTokens/handleLoginSuccess on 201; propagate 422/409/410. Spec: "Accept invitation succeeds (auto-login)", "Accept invitation validation failure (422)", "Expired or already-used token (410)"
- T1.3 auth.model.ts: add AcceptInvitationDto { token, password, terms_version? }. Parallel with T1.4. Spec: "Set password with client-side validation"
- T1.4 auth.model.ts: add InvitationPreview { organization_name, inviter_name, role_name, expires_at }; remove deprecated RegisterRequest/RegisterResponse. Parallel with T1.3. Spec: "Display invitation preview"
- T1.5 Verify register() stub tombstoned (410) per design; no remaining self-service register callers.
- T1.6 [TEST] auth.service.spec.ts: preview success+404, accept success(201/auto-login)+422+410. >=70% coverage. Depends on T1.1-T1.4.

## Phase 2: AcceptInvitationComponent (sequential; depends on Phase 1)
- T2.1 Create accept-invitation.component.ts: standalone, OnPush; signals invitation/loading/error/submitted; ngOnInit reads token from queryParamMap, clears existing session, calls previewInvitation. Spec: "Preview invitation on load", "Route available without guest guard"
- T2.2 Create accept-invitation.component.html: preview text (inviter/org/role/expiry), ReactiveForms password (minLength 12), submit disabled while loading, inline error (no toast). Spec: "Display invitation preview", "Set password with client-side validation"
- T2.3 Submit handler: acceptInvitation({token,password}); on 201 navigate to /app/dashboard; on error set error signal, allow retry. Spec: "Accept invitation succeeds (auto-login)"
- T2.4 Handle missing token: error.set('No invitation token provided'). Depends on T2.1.
- T2.5 Handle 404: error.set('Invitation not found'). Spec: "Invalid token (404)". Depends on T2.1.
- T2.6 Handle 410: error.set('Invitation expired or already used'). Spec: "Expired or already-used token (410)". Depends on T2.1/T2.3.
- T2.7 [TEST] accept-invitation.component.spec.ts: preview render, validation, submit->navigate, 404/410/422/missing-token errors. >=70% coverage. Depends on T2.1-T2.6.

## Phase 3: Route Integration (sequential; depends on Phase 2)
- T3.1 app.routes.ts: add { path: 'accept-invitation', loadComponent } — no guestGuard. Spec: "Route available without guest guard"
- T3.2 Verify no route conflicts with /auth/login, /login, wildcard/redirect.
- T3.3 [TEST] Route harness: /accept-invitation?token=... resolves component without redirect. Depends on T3.1.

## Phase 4: Validation + Coverage Gate (sequential; depends on Phases 1-3)
- T4.1 npm run test (Jest) — both spec files pass.
- T4.2 tsc --noEmit — zero errors.
- T4.3 Verify coverage >=70% on auth.service.ts and accept-invitation.component.ts.
- T4.4 Manual smoke test with seeded/mocked token: preview -> accept -> auto-login -> dashboard.

## Phase 5: Documentation (parallel with Phase 4)
- T5.1 Update MIGRATION_LOG.md/changelog if applicable.
- T5.2 Document flow: preview -> password form -> accept -> auto-login -> dashboard.

## Acceptance Criteria
AuthService preview+accept per contracts; route at /accept-invitation?token=... with no guestGuard; 404/410/422/missing-token errors shown inline; password minLength(12) client-side (backend authoritative); 201 auto-persists tokens + navigates to /app/dashboard; >=70% coverage on both new files; RegisterRequest/RegisterResponse removed.

## Dependency Notes
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4/5 (Phase 5 parallel to Phase 4). Within Phase 1, T1.3/T1.4 parallel with each other, precede/accompany T1.1/T1.2. Test tasks (T1.6, T2.7, T3.3) depend on their phase's implementation tasks.

## Next Step
Ready for implementation (sdd-apply).
