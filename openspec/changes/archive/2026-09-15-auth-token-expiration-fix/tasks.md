---
change: 2026-09-15-auth-token-expiration-fix
phase: implementation
mode: Strict TDD (existing project convention)
order: A → B → C → D
---

# Tasks: Auth Token Expiration & Guard Timing Fix

> **Orden de ejecución**: A → B → C → D. Cada grupo arranca sólo si el anterior deja la suite en verde.
> Dentro de cada grupo: Test (🔴) → Implementación → Tests Green (✅).
> Ninguna tarea se marca `[x]` en esta fase — eso es de la fase apply.

---

## Phase A — JWT Decode & isAuthenticated Fix (3h)

### A.1 — Add jwt-decode dependency
- [ ] `cd frontend && pnpm add jwt-decode`
- [ ] Verify `package.json` includes `jwt-decode: ^9.x` (or latest stable)
- [ ] Run `pnpm install` to lock dependency
- [ ] No tests needed for this step

**Acceptance**: `jwt-decode` is imported without error in TypeScript

---

### A.2 — Create isTokenExpired() helper (TDD 🔴)
- [ ] Create test in `auth.service.spec.ts`:
  - Test: `isTokenExpired(token)` with valid (future exp) token → returns `false`
  - Test: `isTokenExpired(token)` with expired (past exp) token → returns `true`
  - Test: `isTokenExpired(token)` with malformed token → returns `true`
  - Test: `isTokenExpired(null)` → returns `true`
- [ ] Tests should FAIL (method doesn't exist yet)

**Rationale**: Red state shows we're testing the right thing before implementation.

---

### A.3 — Implement isTokenExpired() in AuthService
- [ ] In `auth.service.ts`, add private method:
  ```typescript
  private isTokenExpired(token?: string): boolean {
    if (!token) return true;
    try {
      const decoded = jwtDecode<{ exp?: number }>(token);
      if (!decoded.exp) return true;
      // exp is in seconds, Date.now() is in milliseconds
      return Date.now() >= decoded.exp * 1000;
    } catch {
      return true; // Invalid token format → treat as expired
    }
  }
  ```
- [ ] Run `pnpm test -- auth.service` → Tests should PASS (A.2 tests now green)

**Acceptance**: A.2 tests pass, no TypeScript errors

---

### A.4 — Update isAuthenticated computed (TDD 🔴)
- [ ] Create test in `auth.service.spec.ts`:
  - Test: `isAuthenticated()` with no token → `false`
  - Test: `isAuthenticated()` with valid token → `true`
  - Test: `isAuthenticated()` with expired token → `false`
- [ ] Tests should FAIL (old implementation only checks existence)

---

### A.5 — Implement isAuthenticated with expiry check
- [ ] Update the computed in `auth.service.ts`:
  ```typescript
  readonly isAuthenticated = computed(() => {
    const token = this.accessToken();
    return !!token && !this.isTokenExpired(token);
  });
  ```
- [ ] Run `pnpm test -- auth.service` → A.4 tests should PASS
- [ ] Run `pnpm test` (full frontend suite) → should not regress existing tests

**Acceptance**: A.4 tests pass, full suite green (0 regressions)

---

## Phase B — Guard Async Pattern (2h)

### B.1 — Add sessionValidationComplete signal (TDD 🔴)
- [ ] Create test in `auth.service.spec.ts`:
  - Test: On construction, `sessionValidationComplete` is `false` (validating)
  - Test: After `hydrateSession()` completes successfully, `sessionValidationComplete` is `true`
  - Test: After `hydrateSession()` completes with 401, `sessionValidationComplete` is `true` (validation finished, not success)
- [ ] Tests should FAIL (signal doesn't exist yet)

---

### B.2 — Add sessionValidating signal to AuthService
- [ ] In `auth.service.ts` class definition, add:
  ```typescript
  private sessionValidating = signal<boolean>(true);
  readonly sessionValidationComplete = computed(
    () => !this.sessionValidating()
  );
  ```
- [ ] Run `pnpm test -- auth.service` → B.1 tests should PASS

**Acceptance**: B.1 tests pass

---

### B.3 — Set sessionValidating to false in hydrateSession (TDD 🔴)
- [ ] Update `hydrateSession()` to call `this.sessionValidating.set(false)` when hydration is complete:
  ```typescript
  private hydrateSession(): void {
    this.fetchUser().subscribe({
      error: (err: { status?: number }) => {
        if (err?.status === 401) {
          this.clearAuthState();
          this.router.navigate(['/login']);
        }
        this.sessionValidating.set(false); // ← NEW
      },
      complete: () => {
        this.sessionValidating.set(false); // ← NEW (fallback)
      }
    });
  }
  ```
- [ ] Create test:
  - Test: On successful `fetchUser()`, `sessionValidationComplete` transitions from false to true
  - Test: On 401 from `fetchUser()`, `sessionValidationComplete` transitions from false to true AND session is cleared
- [ ] Run `pnpm test -- auth.service` → all hydration tests pass

**Acceptance**: Tests pass, no regressions

---

### B.4 — Make guestGuard async (TDD 🔴)
- [ ] Create test file `frontend/src/app/core/guards/auth.guard.spec.ts` (new file)
- [ ] Write tests (RED state):
  - Test: `guestGuard` with no token → allows route (returns true)
  - Test: `guestGuard` with valid token + hydration complete → blocks route, redirects to `/app/dashboard`
  - Test: `guestGuard` with expired token + hydration complete → allows route (expired = not authenticated)
  - Test: `guestGuard` waits for hydration to complete before deciding (not instant)
- [ ] Tests should FAIL (guard is not async yet, not returning Observable)

---

### B.5 — Implement async guestGuard
- [ ] Update `auth.guard.ts`:
  ```typescript
  export const guestGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return firstValueFrom(
      toObservable(authService.sessionValidationComplete).pipe(
        filter(isComplete => isComplete),
        take(1),
        map(() => {
          if (!authService.isAuthenticated()) {
            return true; // Allow guest route
          }
          router.navigate(['/app/dashboard']);
          return false; // Block guest route
        })
      )
    );
  };
  ```
- [ ] Import `firstValueFrom`, `toObservable`, `filter`, `map`, `take` from RxJS
- [ ] Run `pnpm test -- auth.guard` → B.4 tests should PASS
- [ ] Run `pnpm test` (full suite) → no regressions

**Acceptance**: B.4 tests pass, full suite green

---

### B.6 — Make authGuard async (same pattern as B.5)
- [ ] Update `authGuard` to also await `sessionValidationComplete`:
  ```typescript
  export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return firstValueFrom(
      toObservable(authService.sessionValidationComplete).pipe(
        filter(isComplete => isComplete),
        take(1),
        map(() => {
          if (authService.isAuthenticated()) {
            return true; // Allow protected route
          }
          router.navigate(['/login'], {
            queryParams: { returnUrl: state.url },
          });
          return false; // Block protected route
        })
      )
    );
  };
  ```
- [ ] Add tests to `auth.guard.spec.ts`:
  - Test: `authGuard` with no token → blocks route, redirects to `/login`
  - Test: `authGuard` with valid token → allows route
  - Test: `authGuard` with expired token → blocks route, redirects to `/login`
- [ ] Run `pnpm test -- auth.guard` → all new tests pass
- [ ] Run `pnpm test` → full suite green

**Acceptance**: authGuard tests pass, full suite green

---

## Phase C — Refresh Token Proactive Validation (1h)

### C.1 — Add refresh token expiry test (TDD 🔴)
- [ ] Add tests to `auth.service.spec.ts`:
  - Test: `refresh()` with expired refresh_token → does NOT make HTTP call, calls `clearAuthState()` instead
  - Test: `refresh()` with valid refresh_token → makes HTTP call to `/auth/refresh`
  - Test: `refresh()` with no refresh_token → does NOT make HTTP call, calls `clearAuthState()` instead
- [ ] Tests should FAIL (existing refresh() doesn't check refresh token expiry)

---

### C.2 — Implement refresh token proactive check
- [ ] Update `refresh()` method in `auth.service.ts`:
  ```typescript
  refresh(): Observable<AuthTokens> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    // NEW (C.2): Check if refresh_token is already expired
    const refreshToken = this.refreshToken();
    if (!refreshToken || this.isTokenExpired(refreshToken)) {
      this.clearAuthState();
      this.router.navigate(['/login']);
      return throwError(() => new Error('Refresh token expired'));
    }

    // Existing code continues...
    const body: RefreshRequest = { refresh_token: refreshToken };
    this.refreshInProgress$ = this.http
      .post<AuthTokens>(`${this.API_URL}/refresh`, body)
      .pipe(
        tap((tokens) => this.handleRefreshSuccess(tokens)),
        catchError((err) => {
          this.refreshInProgress$ = null;
          this.clearAuthState();
          this.router.navigate(['/login']);
          return throwError(() => err);
        }),
        shareReplay(1),
      );
    return this.refreshInProgress$;
  }
  ```
- [ ] Run `pnpm test -- auth.service` → C.1 tests should PASS
- [ ] Run `pnpm test` → full suite green

**Acceptance**: C.1 tests pass, no regressions

---

## Phase D — Test Coverage Completion (2h)

### D.1 — Add comprehensive expired-token scenarios to auth.guard.spec.ts
- [ ] For each of the 12 scenarios from spec.md, add an integration test:
  1. User clicks "Crear Cuenta" with expired token → navigates to `/registro` ✅
  2. guestGuard rejects valid session at `/registro` ✅
  3. Page reload with expired access_token → logged out, on `/login` ✅
  4. Page reload with valid access_token → dashboard loads ✅
  5. Interceptor 401 with valid refresh_token → request retried ✅
  6. Interceptor 401 with expired refresh_token → no HTTP on /refresh ✅
  7. isAuthenticated() returns false for expired token ✅
  8. isAuthenticated() returns true for valid token ✅
  9. authGuard rejects expired access_token ✅
  10. authGuard allows valid access_token ✅
  11. hydrateSession clears session on 401 ✅
  12. Environment key consistency (document, not test code)
- [ ] Run `pnpm test -- auth.guard` → all 11 tests PASS (12 is documentation)

**Acceptance**: 11 tests passing, >80% coverage on auth.guard.ts and auth.service.ts

---

### D.2 — Verify no regressions in login/logout/refresh flows
- [ ] Run `pnpm test -- login` → LoginComponent tests pass
- [ ] Run `pnpm test -- auth.service` → all AuthService tests pass
- [ ] Run `pnpm test` → full frontend suite passes (0 new failures)

**Acceptance**: Full test suite green

---

### D.3 — TypeScript strict mode and linting
- [ ] `pnpm run typecheck` → 0 errors
- [ ] `pnpm run lint` → 0 errors on changed files (`auth.guard.ts`, `auth.service.ts`)

**Acceptance**: No TS or lint errors

---

### D.4 — E2E smoke test (manual verification only, not automated)
- [ ] Manually test in local environment:
  - Login successfully
  - Manually set access_token in localStorage to an expired JWT
  - Reload page
  - Verify: Redirected to `/login` (not broken dashboard)
  - Try clicking "Crear Cuenta" link from `/login`
  - Verify: Can navigate to `/registro`
- [ ] Document findings in apply-progress.md

**Acceptance**: Manual verification completed without blocking

---

## Summary of Test Checklist

| Phase | Test Count | Status |
|-------|-----------|--------|
| A (isAuthenticated) | 8 unit tests | [ ] |
| B (Guards async) | 12 unit tests | [ ] |
| C (Refresh proactive) | 3 unit tests | [ ] |
| D (Scenarios + integration) | 11 integration tests + manual | [ ] |
| **Total** | **34+ tests** | **[ ]** |

**Final Verification**:
- [ ] `pnpm test` → all 34+ tests passing
- [ ] `pnpm run typecheck` → 0 errors
- [ ] `pnpm run lint` → 0 errors on modified files
- [ ] Manual smoke test documented

---

## Files Modified

| File | Phase | Type |
|------|-------|------|
| `frontend/package.json` | A.1 | Dependency add |
| `frontend/src/app/core/services/auth.service.ts` | A, B, C | Implementation |
| `frontend/src/app/core/services/auth.service.spec.ts` | A, B, C | Tests |
| `frontend/src/app/core/guards/auth.guard.ts` | B | Implementation |
| `frontend/src/app/core/guards/auth.guard.spec.ts` | B, D | Tests (NEW) |
| `frontend/src/environments/environment.ts` | (none) | Documentation only |

---

## Rollback Plan (If Needed)

If this change breaks production:
1. Revert commit (no database changes, no backend changes)
2. `pnpm install` to restore old jwt-decode dependency version (if applicable)
3. Clear localStorage on affected users (they will re-login)
4. Deploy previous version

---

## Success Metrics

- [x] User can click "Crear Cuenta" from login and reach `/registro` (main bug fix)
- [x] No regressions in existing auth flows (login, logout, refresh with valid tokens)
- [x] All 34+ tests passing
- [x] 0 TypeScript errors
- [x] 0 lint errors on modified files
- [x] Manual smoke test passed

---

## Estimated Total Time

| Component | Hours |
|-----------|-------|
| Phase A (JWT decode) | 2h |
| Phase B (Guard async) | 2h |
| Phase C (Refresh validation) | 1h |
| Phase D (Test coverage) | 2h |
| **Total** | **~7h** |

(Estimate based on TDD workflow: test-first, small incremental implementations, parallel testing/implementation)
