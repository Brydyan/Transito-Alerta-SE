---
design: auth-token-expiration-fix
version: 1.0
date: 2026-09-15
decisions: 8
---

# Design: Auth Token Expiration & Guard Timing Fix

## Architecture Overview

```
localStorage (access_token, refresh_token)
           ↓
isAuthenticated() computed
  - Check token exists
  - Decode JWT, extract exp claim (NEW)
  - Compare with Date.now()
  - Return true only if valid AND not expired
           ↓
guestGuard / authGuard (ASYNC NOW)
  - Wait for hydrateSession() to complete (NEW signal/observable)
  - Check isAuthenticated() result
  - Decide to allow/block/redirect
           ↓
authInterceptor (on 401)
  - Decode refresh_token exp (NEW)
  - If refresh_token expired: clearAuthState() immediately (no HTTP)
  - If refresh_token valid: POST /auth/refresh (existing flow)
```

---

## Design Decisions

### D1: JWT Decoding Library Choice

**Decision**: Use `jwtDecode` from npm package `jwt-decode` (community standard, <2KB, zero dependencies)

**Alternatives Rejected**:
- (A) Implement custom JWT parser — too error-prone, duplication
- (B) Use `@angular/common/http` HttpClientModule interceptor — wrong layer, interceptor is reactive not proactive
- (C) No client-side decoding, rely entirely on server 401s — does not solve the guard timing issue (synchronous guard runs before server validates)

**Why**: `jwt-decode` is the de-facto standard. Minimal size, zero dependencies, handles base64url decoding correctly. No need to reinvent.

**Implementation**:
```bash
npm install jwt-decode
# or
pnpm add jwt-decode
```

---

### D2: Token Expiry Check Location

**Decision**: Create a private `isTokenExpired(token?: string): boolean` helper in AuthService, called by `isAuthenticated` computed.

**Rationale**:
```typescript
// BEFORE (exists, no expiry):
readonly isAuthenticated = computed(() => !!this.accessToken());

// AFTER (exists AND not expired):
private isTokenExpired(token?: string): boolean {
  if (!token) return true;
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    if (!decoded.exp) return true;
    return Date.now() >= decoded.exp * 1000; // exp is in seconds, Date.now() is ms
  } catch {
    return true; // Invalid token format → treat as expired
  }
}

readonly isAuthenticated = computed(() => {
  const token = this.accessToken();
  return !!token && !this.isTokenExpired(token);
});
```

**Why This Location**:
- Single source of truth: AuthService knows about tokens
- Computed signal evaluates reactively: if token changes, isAuthenticated updates automatically
- Accessible to all guards, services, components via injection
- No global function pollution

---

### D3: Guard Async Pattern

**Decision**: Convert `guestGuard` and `authGuard` to `CanActivateFn` returning `Observable<boolean>` OR `Promise<boolean>`, waiting for a `sessionValidationComplete` signal before deciding.

**Implementation Approach**:
```typescript
// In AuthService:
private sessionValidating = signal<boolean>(true); // Start as "validating"
readonly sessionValidationComplete = computed(
  () => !this.sessionValidating() // false while hydrating, true when done
);

// In constructor's hydrateSession():
// ... (fetch user, clear on 401, etc.)
// At the end:
this.sessionValidating.set(false); // Signal validation is complete

// In guestGuard:
export const guestGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for hydration to complete, THEN decide
  return firstValueFrom(
    toObservable(authService.sessionValidationComplete).pipe(
      filter(isComplete => isComplete), // Wait until true
      take(1),
      map(() => {
        // NOW check the (validated) authentication state
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

**Why Observable/Promise**:
- Angular guards support async CanActivateFn (documented in Angular 15+)
- Allows the guard to wait for data before deciding
- RxJS `toObservable` + `filter` is the Angular-idiomatic way

**Alternative Rejected** (D3alt):
- Make isAuthenticated() an Observable itself — complicates every component that uses it; signals are better
- Store a `validationPromise` and await it in guards — less reactive, doesn't update if tokens change mid-app-lifetime

---

### D4: Refresh Token Proactive Validation

**Decision**: Before calling `refresh()` HTTP, decode refresh_token's exp and short-circuit if already expired.

**Implementation**:
```typescript
// In AuthService.refresh():
refresh(): Observable<AuthTokens> {
  if (this.refreshInProgress$) {
    return this.refreshInProgress$;
  }

  // NEW: Check if refresh_token is already expired (D4)
  const refreshToken = this.refreshToken();
  if (!refreshToken || this.isTokenExpired(refreshToken)) {
    // Don't waste an HTTP call; clear session immediately
    this.clearAuthState();
    this.router.navigate(['/login']);
    return throwError(() => new Error('Refresh token expired'));
  }

  // Proceed with the existing refresh flow
  const body: RefreshRequest = { refresh_token: refreshToken };
  this.refreshInProgress$ = this.http.post<AuthTokens>(...)
    // ... (existing tap, catchError, shareReplay)
}
```

**Why**:
- Fast-fail: detects expired refresh token in ~1ms (no network latency)
- Reduces server load: no 401 response needed for an obviously-expired token
- Better UX: logout happens immediately, not after a delayed server 401
- Consistent with requirement R4

---

### D5: Test Coverage Strategy

**Decision**: Create dedicated test files for guards, plus expand existing auth.service.spec.ts.

**Files to Create**:
- `frontend/src/app/core/guards/auth.guard.spec.ts` (new, 8+ tests)
- Expand `frontend/src/app/core/services/auth.service.spec.ts` (add 6+ expired-token tests)

**Test Structure** (example):
```typescript
describe('guestGuard (token expiry)', () => {
  it('allows navigation to /registro when access_token is expired', async () => {
    // Seed an expired token
    const expiredToken = generateJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
    // ... set up guard with expired token
    // ... call guard for /registro route
    // Expect: true (allow navigation)
  });

  it('blocks navigation to /registro when access_token is valid', async () => {
    // Seed a valid token
    const validToken = generateJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    // ... set up guard with valid token
    // ... call guard for /registro route
    // Expect: false (block, redirect to /app/dashboard)
  });
  
  // ... 6+ more scenarios (refresh token expired, both expired, etc.)
});
```

**Why Dedicated File**:
- Guards have zero current test coverage (noted in analysis)
- Dedicated file is easier to find and extend
- Isolates guard logic from service tests

---

### D6: Environment Key Strategy (Documentation)

**Decision**: Document the current behavior. KEEP the env-dependent key suffix for now (no breaking change). Add migration helper for future unification if needed.

**Current Behavior** (unchanged):
```typescript
private getStored(key: string): string | null {
  const env = environment.production ? 'production' : 'development';
  return localStorage.getItem(`auth_${key}_${env}`);
  // Example keys:
  // - auth_access_token_production (ng build --prod)
  // - auth_access_token_development (ng serve)
}
```

**Documentation**:
- Add comment in auth.service.ts explaining why the suffix exists
- Document in `docs/architecture/` or `CLAUDE.md` that changing build mode loses tokens
- Flag as "tech debt: consider unified key naming in future refactor"

**Why No Immediate Unification**:
- No breaking change to existing users
- Complexity: would need to read from both old and new keys during migration period
- This issue is separate from the expiration fix (can be tackled in a future change)

**Alternative Rejected** (D6alt):
- Unify to single key now — requires migration logic, increases scope, not necessary for fixing the expiration bug

---

### D7: Error Handling in hydrateSession

**Decision**: On 401 from `fetchUser()` during hydration, ALWAYS call `clearAuthState()` + `navigate(['/login'])`. Silent errors on other status codes (500, timeout) leave session intact.

**Implementation**:
```typescript
private hydrateSession(): void {
  this.fetchUser().subscribe({
    error: (err: { status?: number }) => {
      if (err?.status === 401) {
        // Token is invalid server-side (expired, revoked, etc.)
        this.clearAuthState();
        this.router.navigate(['/login']);
      }
      // Else: network error, server error, timeout — keep the token, user can retry
      // sessionValidating is set to false AFTER this error handling (see below)
    },
    complete: () => {
      this.sessionValidating.set(false); // Validation done, regardless of outcome
    }
  });
}
```

**Why**:
- 401 = token is invalid on the server. Client can't fix it by retrying.
- 5xx / timeout = transient backend issue. Client should keep the token and retry later.
- Sets `sessionValidating.set(false)` only AFTER determining the outcome, so guards unblock

---

### D8: No Changes to LoginComponent or RegisterComponent

**Decision**: Existing components don't need to be modified. The fix happens in AuthService + Guards. RegisterComponent can remain unchanged.

**Rationale**:
- RegisterComponent has `guestGuard` on its route
- Once guestGuard is fixed (D3), RegisterComponent will be reachable
- No component-level logic needs to change
- The flow is: guestGuard (fixed) → route loads → RegisterComponent renders

---

## Interface Contracts

### AuthService Public Interface (after this change)

```typescript
export class AuthService {
  // EXISTING (unchanged)
  readonly accessToken: WritableSignal<string | null>;
  readonly refreshToken: WritableSignal<string | null>;
  readonly user: WritableSignal<User | null>;
  readonly token: Signal<string | null>; // legacy alias

  // NEW (this change)
  readonly isAuthenticated: Signal<boolean>;
  readonly sessionValidationComplete: Signal<boolean>;

  // NEW (private, used internally)
  private isTokenExpired(token?: string): boolean;
  private sessionValidating: WritableSignal<boolean>;

  // EXISTING (unchanged)
  login(input: LoginRequest): Observable<AuthTokens>;
  logout(): Observable<LogoutResponse>;
  refresh(): Observable<AuthTokens>;
  fetchUser(): Observable<MeResponse>;
  clearSession(): void;
  // ... etc
}
```

### Guard Async Return Type (after this change)

```typescript
export const guestGuard: CanActivateFn = (route, state): Observable<boolean> => {
  // Returns Observable<boolean> instead of boolean
  // Angular Router supports both sync and async CanActivateFn
};

export const authGuard: CanActivateFn = (route, state): Observable<boolean> => {
  // Same async pattern
};
```

---

## Rollout Plan

1. **Create feature branch**: `feature/auth-token-expiration-fix` from `main`
2. **Add dependency**: `pnpm add jwt-decode` in frontend/
3. **Implement A1-A5** (proposal scope)
4. **Run tests**: `pnpm test` (all auth tests pass, no regressions)
5. **Code review**: Check for security issues in JWT decode usage
6. **Merge to feature branch**, create PR against main
7. **Run sdd-verify**: Verify against this spec
8. **Archive change**: Move to `openspec/changes/archive/`
9. **Merge PR to main**

---

## Security Considerations

- **JWT Decode**: `jwtDecode` is a standard library. No custom crypto; it's just base64url decoding and JSON parsing.
- **Exp Claim**: The `exp` field is not secret (anyone can read it from a JWT without a key). Checking it client-side is safe.
- **No Key Verification**: This change does NOT verify the JWT signature client-side (expensive, unnecessary — trust the server that issued it).
- **No Sensitive Data Logging**: No token values are logged when expired.

---

## Performance Impact

- JWT decode: ~1ms per isAuthenticated() call (negligible)
- Guard delay: Adds ~1 microtask cycle (~0-10ms) to route navigation while hydration completes (acceptable)
- No additional HTTP calls (proactive refresh token check reduces network calls)
- Net: Negligible impact on perceived performance

---

## Browser Compatibility

- `jwtDecode`: Works on all modern browsers (ES5+)
- `toObservable`: Angular 16+
- `firstValueFrom`: RxJS 7+
- Current project uses Angular 17+ and RxJS 7+ (no compat issues)
