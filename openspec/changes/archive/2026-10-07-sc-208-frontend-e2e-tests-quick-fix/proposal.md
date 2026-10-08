# Proposal: Frontend E2E Tests Quick Fix (Stream 1a)

## Intent

The Playwright smoke suite (`frontend/e2e/`) was written against a routing/label contract that never existed, so it times out on every run. CI hides this: `ci.yml:433` appends `|| echo "::warning::..."`, so the job is green regardless. There is also no `test:e2e` script, so nobody runs it locally. Net effect: a frontend e2e gate that costs CI minutes and proves nothing.

Verified defects:

| File | Line | Defect |
|---|---|---|
| `frontend/e2e/auth-flow.e2e.ts` | 29 | `goto('/auth/login')` — real route is `/login` (`app.routes.ts:12`) |
| `frontend/e2e/auth-flow.e2e.ts` | 30 | `getByLabel(/email/i)` — label text is `Usuario` (`login.component.html:52`) |
| `frontend/src/app/core/services/auth.service.ts` | 91 | Logout navigates to `/auth/login` → 404. `auth.guard.ts:19` and `profile.component.ts:88` already use `/login` |
| `frontend/package.json` | 4-10 | No `test:e2e` script |
| `.github/workflows/ci.yml` | 433 | Soft-fail swallows every failure |

`comment-flow.e2e.ts` targets an incident-detail page + comment composer that do not exist (`frontend/src/app/features/` has no comment component). It cannot be fixed here.

## Scope

### In Scope
- `auth-flow.e2e.ts`: `/auth/login` → `/login`; `getByLabel(/email/i)` → `/usuario/i`
- `auth.service.ts:91`: navigate `['/login']` (production bug, same root cause)
- `frontend/package.json`: add `"test:e2e": "playwright test"`
- `comment-flow.e2e.ts`: `test.skip` with a TODO pointing at the blocking comment-UI feature
- `ci.yml`: drop the `|| echo "::warning::"` soft-fail

### Out of Scope
- Building incident-detail or comment UI (separate feature)
- New e2e specs beyond the existing login flow
- Seed-data pipeline changes (`admin@correo.com` / `123456` assumed present)
- `BASE_URL`/staging wiring — keep `webServer` local dev server behaviour

## Capabilities

### New Capabilities
- `frontend-e2e-smoke`: Playwright login smoke flow and its CI gate contract (route, selectors, hard-fail policy, skip policy for blocked specs)

### Modified Capabilities
- None

## Approach

Mechanical fix, no new abstractions. Correct the two selectors/route in `auth-flow.e2e.ts` to match the real DOM, fix the one production navigation that shares the wrong route constant, add the missing script, quarantine `comment-flow.e2e.ts` via `test.skip` so the file compiles and is visibly pending instead of silently red, then remove the soft-fail so the job can actually block a merge. Assertions already valid — `waitForURL(/\/app\/dashboard/)` matches `login.component.ts:59`, and `getByRole('banner')` resolves against `layout/header/header.html:1`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/e2e/auth-flow.e2e.ts` | Modified | Route + label fix |
| `frontend/e2e/comment-flow.e2e.ts` | Modified | `test.skip` + TODO |
| `frontend/src/app/core/services/auth.service.ts` | Modified | L91 `/auth/login` → `/login` |
| `frontend/package.json` | Modified | `test:e2e` script |
| `.github/workflows/ci.yml` | Modified | `frontend-e2e` job hard-fails |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hard-fail turns CI red on unrelated PRs if backend/seed unreachable | Med | Verify green on this branch first; `retries: 2` already set for CI; revert to soft-fail if flaky |
| `getByLabel(/usuario/i)` breaks on i18n/label copy change | Low | Prefer `#email` / `formControlName` fallback if label proves unstable |
| `auth.service.ts:91` change alters logout redirect for users | Low | It currently 404s; any change is strictly an improvement |

## Rollback Plan

Single-commit revert. Each item is independent: restore `|| echo "::warning::"` on `ci.yml:433` to unblock CI without reverting the test fixes; remove the `test:e2e` script to restore the prior script set. No migrations, no data, no runtime config.

## Dependencies

- Reachable backend with seed user `admin@correo.com` / `123456` for the login flow
- `pnpm exec playwright install chromium` (already in the CI job)

## Success Criteria

- [ ] `pnpm test:e2e` runs `auth-flow.e2e.ts` to green locally against a seeded backend, no timeouts
- [ ] Test asserts real `POST /auth/login` fired, lands on `/app/dashboard`, header shows the user name
- [ ] `comment-flow.e2e.ts` reports as skipped (not failed) with a TODO naming its blocker
- [ ] Logging out navigates to `/login` and renders the login form
- [ ] `frontend-e2e` CI job fails the build when a spec fails
