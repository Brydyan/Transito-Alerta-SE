---
spec: auth-token-expiration-fix
version: 1.0
date: 2026-09-15
requirements: 5
scenarios: 12
---

# Spec: Auth Token Expiration & Guard Timing Fix

## Capability

Detect and handle expired JWT tokens (both access and refresh) client-side before attempting HTTP requests or allowing navigation to protected/guest routes. Prevent stale tokens in localStorage from blocking user flows.

---

## Requirements

### Requirement 1: Client-side JWT Expiry Detection (R1)

**Given** an access_token is stored in localStorage  
**When** the token's `exp` claim indicates expiration in the past  
**Then** `isAuthenticated()` computed signal returns `false`

**Rationale**: Tokens expire server-side, but the client has the exp claim available. Decoding it locally prevents dead time where a user is treated as "authenticated" but the server rejects all requests.

---

### Requirement 2: guestGuard Awaits Hydration (R2)

**Given** a user navigates to a guest route (`/login`, `/registro`, `/verify-email`) with an expired token in localStorage  
**When** the guard evaluates  
**Then** the guard waits for `hydrateSession()` to complete (validate token server-side) before deciding to allow or block navigation

**Rationale**: Synchronous guards race with deferred hydration. The guard must respect the server's authority on token validity, not guess based on stale client state.

---

### Requirement 3: guestGuard Blocks Only Valid Sessions (R3)

**Given** a user with an expired access_token attempts to navigate to `/registro`  
**When** the guestGuard evaluates after hydration is complete  
**Then** the guard returns `true` (allow navigation to `/registro`) because `isAuthenticated()` returns `false` (token is expired)

**Rationale**: "Not authenticated" means both "no token" and "token is stale". The guard should not distinguish.

---

### Requirement 4: Refresh Token Expiry Proactive Check (R4)

**Given** an expired refresh_token is stored in localStorage  
**When** `authInterceptor` receives a 401 and attempts to call `refresh()`  
**Then** `refresh()` checks the refresh_token's `exp` claim client-side BEFORE the HTTP call. If expired, it calls `clearAuthState()` immediately (no HTTP call).

**Rationale**: The refresh token has its own TTL. Attempting to refresh with an already-expired refresh token is wasted work. Detect it locally to provide faster error feedback.

---

### Requirement 5: Test Coverage for Expired Tokens (R5)

**Given** a test suite for auth guards and auth service  
**When** the suite runs  
**Then** all of the following scenarios pass (see Scenarios section)

**Rationale**: Expired token handling was never tested. This change must close that gap.

---

## Scenarios

### Scenario 1: User with expired access_token clicks "Crear Cuenta" on /login
**Given** a user is on `/login` with an expired access_token in localStorage  
**When** the user clicks the "¿No tenés cuenta? Crear cuenta" link (navigates to `/registro`)  
**Then** `guestGuard` allows navigation to `/registro` (not redirected to `/app/dashboard`)

**Test**: click on link → URL changes to `/registro` → RegisterComponent renders

---

### Scenario 2: guestGuard rejects valid session at /registro
**Given** a user is logged in with a valid, non-expired access_token  
**When** they navigate to `/registro`  
**Then** `guestGuard` blocks the navigation and redirects to `/app/dashboard`

**Test**: valid token + attempt `/registro` → redirected to `/app/dashboard`

---

### Scenario 3: Page reload with expired access_token
**Given** a user has an expired access_token in localStorage  
**When** they reload the app (or navigate to `/app/dashboard`)  
**Then** `authGuard` does NOT allow the route to load. Instead, `hydrateSession()` detects 401 on `fetchUser()`, calls `clearAuthState()`, and redirects to `/login`

**Test**: reload with expired token → logged out, on `/login`

---

### Scenario 4: Page reload with valid access_token
**Given** a user has a valid, non-expired access_token in localStorage  
**When** they reload the app  
**Then** `authGuard` allows access to `/app/dashboard`. `hydrateSession()` fetches `/auth/me` successfully, and `user` signal is populated

**Test**: reload with valid token → dashboard loads, user signal populated

---

### Scenario 5: Interceptor 401 with valid refresh_token
**Given** a user's access_token is expired but refresh_token is still valid  
**When** an authenticated request fails with 401  
**Then** `authInterceptor` calls `refresh()` → proactive check sees refresh_token is valid → HTTP POST to `/auth/refresh` → new tokens stored → request retried with new access_token

**Test**: 401 + valid refresh → request retried → succeeds

---

### Scenario 6: Interceptor 401 with expired refresh_token
**Given** both access_token and refresh_token are expired  
**When** an authenticated request fails with 401  
**Then** `authInterceptor` calls `refresh()` → proactive check sees refresh_token.exp is in past → NO HTTP call, `clearAuthState()` called immediately → router.navigate(['/login'])

**Test**: both tokens expired → no 401 on /refresh, immediate logout

---

### Scenario 7: isAuthenticated() returns false for expired token
**Given** an access_token JWT with `exp: <past timestamp>` is in localStorage  
**When** `isAuthenticated` computed signal is evaluated  
**Then** it returns `false` (even though the string exists in localStorage)

**Test**: decode expired token, check isAuthenticated() → false

---

### Scenario 8: isAuthenticated() returns true for valid token
**Given** an access_token JWT with `exp: <future timestamp>` is in localStorage  
**When** `isAuthenticated` computed signal is evaluated  
**Then** it returns `true`

**Test**: decode valid token, check isAuthenticated() → true

---

### Scenario 9: authGuard rejects expired access_token
**Given** a user navigates to `/app/dashboard` with an expired access_token  
**When** `authGuard` evaluates  
**Then** after hydration completes and confirms the token is invalid, `authGuard` returns `false` and redirects to `/login`

**Test**: expired token + attempt `/app/dashboard` → redirected to `/login`

---

### Scenario 10: authGuard allows valid access_token
**Given** a user navigates to `/app/dashboard` with a valid access_token  
**When** `authGuard` evaluates  
**Then** `authGuard` returns `true` and allows the route

**Test**: valid token + attempt `/app/dashboard` → dashboard loads

---

### Scenario 11: hydrateSession clears session on 401
**Given** the AuthService constructor calls `hydrateSession()` (via queueMicrotask) with an expired access_token  
**When** `fetchUser()` attempts `GET /auth/me` with the expired token  
**Then** the server responds 401 → `authInterceptor` attempts refresh → refresh fails with 401 (refresh token also expired) → `clearAuthState()` is called → `isAuthenticated()` returns `false`

**Test**: constructor with expired token → after microtask → isAuthenticated() is false

---

### Scenario 12: Environment key consistency
**Given** a user logs in under `ng serve` (environment.development.ts, localStorage key suffix = 'development')  
**When** the build mode changes to production (or vice versa)  
**Then** tokens are still accessible (key strategy is consistent, OR migration reads from both keys)

**Test**: seed token under 'development' key → read under 'production' mode → still retrievable (or documented as expected loss)

---

## Acceptance Criteria

- [x] All 12 scenarios have passing tests
- [x] No regression in existing auth flows (login, logout, refresh with valid tokens)
- [x] `authGuard` and `guestGuard` have dedicated test file with 8+ tests
- [x] JWT decode happens for both access_token and refresh_token
- [x] No unhandled promise rejections or silent errors
- [x] TypeScript strict mode compliance
- [x] E2E auth test suite (existing) all passing

---

## Non-functional Requirements

| Requirement | Note |
|-------------|------|
| Performance | JWT decode should happen synchronously on every isAuthenticated() call (negligible cost, <1ms) |
| Security | No keys or sensitive data logged when token expires. Expiry detection is non-secret math on the exp field. |
| Backwards Compatibility | localStorage keys must be read correctly even if the env mode changes. Document the strategy. |
| Accessibility | No changes to UI/UX, auth flow is transparent to user (happens in background). |

---

## Out of Scope (Documented for Future)

- Refresh token rotation (server-side mechanism, not client validation)
- Proactive token refresh before expiry (optimization, not a blocker)
- Silent re-login with saved credentials (security decision, not this change)
- JWT signature verification client-side (trust server, too expensive client-side)
