# Design: Frontend E2E Tests Quick Fix

## Technical Approach
Mechanical wire-correction only — no new components, services, or abstractions. Five independent fixes implement R1-R7: (1) correct production logout redirect, (2) verify already-corrected Playwright selectors/route, (3) add test:e2e npm script, (4) remove CI soft-fail wrapper, (5) mark comment-flow.e2e.ts as skipped with TODO.

**Codebase finding (revises proposal's D1/D2 premise)**: frontend/e2e/auth-flow.e2e.ts is ALREADY FIXED on this branch — uses page.goto('/login') (line 35) and getByLabel(/usuario/i) (line 36), with inline comment documenting this exact fix. No edit needed there. Only remaining route defect: production logout path in auth.service.ts:91.

## Architecture Decisions

**D1 — Route path correction**: Fix auth.service.ts:91 router.navigate(['/auth/login']) → ['/login']. auth-flow.e2e.ts needs NO change (already correct). Rejected: also fixing auth.interceptor.ts:50 / error.interceptor.ts:19,46 — those '/auth/login' strings match the BACKEND API URL (environment.apiUrl + '/auth' + '/login'), not the Angular route; changing them would break auth-refresh-skip and 401-terminal logic. Only auth.service.ts:91 is an Angular router.navigate call, matches auth.guard.ts:19 and profile.component.ts which already use '/login'.

**D2 — Form label selector**: No change — auth-flow.e2e.ts:36 already uses getByLabel(/usuario/i) matching login.component.html:52 (label for="email">Usuario). Rejected: data-testid="email-input" — unnecessary churn since selector already resolves. i18n fallback (#email/formControlName) stays documented option per spec R2, not implemented unless label breaks.

**D3 — npm script**: Add "test:e2e": "playwright test" to frontend/package.json scripts (currently only ng, start, build, watch, test). Matches playwright.config.ts reporters already configured.

**D4 — CI hard-fail**: Remove `|| echo "::warning::Playwright suite failed..."` from ci.yml:433, leaving `pnpm exec playwright test --reporter=list`. Job already scoped to push/develop/main + frontend-path PRs (ci.yml:397-400), retries:2 set in playwright.config.ts:15, so hard-fail risk contained.

**D5 — Comment-flow defer**: Convert comment-flow.e2e.ts's test(...) to test.skip(...) + TODO block citing missing incident-detail/comment UI and hardcoded INCIDENT_ID='123' (line 19). Rejected: deleting the file — preserves skeleton for future feature per spec R7.

## Data Flow
Playwright test (auth-flow.e2e.ts) → GET /login (app.routes.ts:12) → fill Usuario/Contraseña, submit → POST {apiUrl}/auth/login (backend) → 200 → router navigates to /app/dashboard → logout() → clearAuthState() → router.navigate(['/login']) [D1 fix point]

## File Changes
| File | Action | Description |
|------|--------|-------------|
| frontend/src/app/core/services/auth.service.ts | Modify (line 91) | router.navigate(['/auth/login']) → ['/login'] |
| frontend/e2e/auth-flow.e2e.ts | None | Already correct; verify only |
| frontend/package.json | Modify | Add "test:e2e": "playwright test" to scripts |
| .github/workflows/ci.yml | Modify (line 433) | Drop soft-fail `\|\| echo "::warning::..."` |
| frontend/e2e/comment-flow.e2e.ts | Modify | test(...) → test.skip(...) + TODO comment block |

## Testing Strategy
Unit: auth.service.spec.ts unaffected (asserts POST URL only, not navigate target) — run to confirm no regression.
E2E: pnpm run test:e2e (frontend/) against seeded backend (admin@correo.com/123456), login → dashboard, logout → /login.
CI: push branch touching frontend/, confirm job fails on induced spec break, passes clean otherwise.

## Migration / Rollout
No migration required. Single commit; ci.yml:433 soft-fail can be restored independently of other 3 fixes to unblock CI without reverting test/code fixes (per proposal rollback plan).

## Open Questions
None blocking. Note for sdd-tasks: D1/D2 scope is smaller than proposal implied — only auth.service.ts:91 needs a code change; auth-flow.e2e.ts is verification-only, not a modify target.

## Next
Ready for sdd-tasks.
