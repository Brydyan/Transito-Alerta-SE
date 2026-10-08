# Frontend E2E Smoke Specification (NEW capability: frontend-e2e-smoke)

## Purpose
Contract for the Playwright login smoke flow (frontend/e2e/auth-flow.e2e.ts), the production logout redirect it exercises, and the CI gate enforcing it. Fixes a suite written against routes/labels that never existed, previously masked by a soft-failing CI job.

## Requirements

### Requirement: Auth Flow Navigates to Real Login Route
File: frontend/e2e/auth-flow.e2e.ts:29 (goto()); real route: frontend/src/app/app.routes.ts:12.
- Scenario: Test opens login page — GIVEN Playwright context init, WHEN auth-flow.e2e.ts navigates to login, THEN it goes to `/login`, AND NOT `/auth/login`.

### Requirement: Auth Flow Selects Real Form Label
File: frontend/e2e/auth-flow.e2e.ts:30 (getByLabel()); rendered label: login.component.html:52 ("Usuario").
- Scenario: Test fills username field — GIVEN login page loaded at `/login`, WHEN test locates username input via getByLabel, THEN selector matches "Usuario", AND NOT "email".
- Scenario: Selector resilient to fallback — GIVEN label text could change with i18n, WHEN primary selector fails, THEN fallback (#email or formControlName) MAY be used.

### Requirement: Successful Login Reaches Dashboard
- Scenario: Login redirects and renders authenticated UI — GIVEN valid seeded creds (admin@correo.com/123456) submitted on /login, WHEN request succeeds, THEN URL matches `/app/dashboard` AND header (getByRole('banner')) shows user name.

### Requirement: Logout Redirects to Real Login Route
File: frontend/src/app/core/services/auth.service.ts:91. Must match auth.guard.ts and profile.component.ts which already use `/login`.
- Scenario: User logs out — GIVEN authenticated user on protected page, WHEN authService.logout() called, THEN router navigates to `/login`, login form renders (no 404), AND NOT `/auth/login`.

### Requirement: E2E Suite Runnable via npm Script
File: frontend/package.json.
- Scenario: Developer runs suite locally — GIVEN reachable backend with seeded data, WHEN `npm run test:e2e` runs from frontend/, THEN Playwright executes all *.e2e.ts files, AND exits non-zero on any failure (no soft-fail).

### Requirement: CI Enforces E2E Results
File: .github/workflows/ci.yml (~line 433). Remove `|| echo "::warning::..."` soft-fail wrapper.
- Scenario: Spec fails in CI — WHEN one or more specs fail, THEN job reports failed status, no soft-fail fallback.
- Scenario: Spec passes in CI — WHEN all specs pass/skip, THEN job reports success.

### Requirement: Comment Flow Suite Deferred Pending UI
File: frontend/e2e/comment-flow.e2e.ts. Targets incident-detail/comment UI that doesn't exist yet (no comment composer under frontend/src/app/features/).
- Scenario: Suite runs — WHEN E2E suite runs, THEN comment-flow.e2e.ts reported as skipped (test.skip) not failed, skip reason references missing UI as TODO, no new assertions added in this change.

## Coverage
Happy paths: covered (login success, logout, CI pass). Edge cases: covered (label fallback, comment-flow skip). Error states: covered (route 404 avoidance, CI hard-fail on failure).

## Next
Ready for sdd-tasks (mechanical fix, no design needed — proposal explicitly states "no new abstractions").
