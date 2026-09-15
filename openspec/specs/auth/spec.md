# Specification: Auth Backend Integration

**Capability**: `auth-backend` (login, register, token lifecycle)

---

## R1 — Login Flow

### R1.1 Successful Login

**Given** a valid user email/password  
**When** calling `authService.login({ email: 'admin@correo.com', password: '123456' })`  
**Then**:
- HTTP `POST /auth/login` called with payload
- Backend returns `{ access_token: 'jwt...', refresh_token?: 'jwt...', user: {...} }`
- `access_token` stored in `tokenSignal` (signal)
- `refresh_token` stored in `refreshTokenSignal` (if returned)
- `userSignal` updated with `{ id, email, name, roleId, roleName }`
- Token timestamps computed: `created_at`, `expires_at` (15m default)
- `isAuthenticated` computed signal returns `true`
- `currentUser` computed signal returns user object
- Router auto-navigates to dashboard (or retains current route if already authed)
- Promise resolves with user object

### R1.2 Failed Login (Invalid Credentials)

**Given** invalid email/password  
**When** calling `authService.login({ email: 'wrong@mail.com', password: 'bad' })`  
**Then**:
- HTTP `POST /auth/login` called
- Backend returns 401 with error object: `{ message: 'Invalid credentials' }`
- `tokenSignal` remains null
- `userSignal` remains null
- `isAuthenticated` returns `false`
- Error thrown to caller with `.message` and `.status`
- Promise rejects; caller's `.catch()` handles display

### R1.3 Network Error

**Given** backend unreachable  
**When** calling `authService.login(...)` and network fails  
**Then**:
- HTTP error caught by `error.interceptor`
- Error passed to caller with `{ status: 0, message: 'Network error' }`
- Offline queue (IndexedDB) does NOT store login attempts
- Promise rejects; caller shows toast

---

## REMOVED: R2 — Register Flow (self-service)

(Reason: `POST /auth/register` tombstoned to 410 Gone in SC-207; replaced by invitation-only flow)

### REMOVED: R2.1 Successful Registration (self-service)

**Given** valid registration payload: `{ email, password, device_uuid }`  
**When** calling `authService.register(payload)`  
**Then**:
- HTTP `POST /auth/register` called
- Backend returns 201: `{ id, email, message: 'Verification email sent...' }`
- `tokenSignal` remains null (no auto-login per legacy design)
- `userSignal` remains null
- `isAuthenticated` returns `false`
- Router stays on `/auth/login` (caller responsibility to navigate)
- Promise resolves with server response (caller shows `message` in success banner)

### REMOVED: R2.2 Registration Validation Failure (self-service)

**Given** invalid payload (weak password, invalid email, etc)  
**When** calling `authService.register(payload)`  
**Then**:
- HTTP `POST /auth/register` called
- Backend returns 422: `{ message: '...', errors: { email: [...], password: [...] } }`
- Error passed to caller with `.errors` field parsed
- `tokenSignal`, `userSignal` unchanged
- Promise rejects; caller maps `.errors` to form field hints

### REMOVED: R2.3 Email Already Exists (self-service)

**Given** email already registered  
**When** calling `authService.register({ email: 'existing@mail.com', ... })`  
**Then**:
- Backend returns 409: `{ message: 'Email already registered' }`
- Error passed to caller with `{ status: 409, message }`
- Form validator highlights email field
- Promise rejects

## R2 — Accept Invitation Flow (Registration via Invitation)

### Requirement: Accept Invitation Flow

The system MUST replace self-service registration with invitation-only account creation. `POST /auth/register` MUST return 410 Gone (tombstoned). Users MUST create accounts exclusively via `POST /auth/accept-invitation`, reached by first previewing via `GET /invitations/preview?token=...`.

#### Scenario: Preview invitation on load
- GIVEN a user has an invitation token in the URL (`?token=...`)
- WHEN `AcceptInvitationComponent` loads
- THEN `AuthService.previewInvitation(token)` calls `GET /invitations/preview?token=...`
- AND the backend returns `{ organization_name, inviter_name, role_name, expires_at }`

#### Scenario: Display invitation preview
- GIVEN preview data was received successfully
- WHEN the component renders
- THEN it MUST display "You're invited by {inviter_name} to join {organization_name} as {role_name}"
- AND MUST show the invitation's expiry date/time

#### Scenario: Set password with client-side validation
- GIVEN the preview is shown
- WHEN the user enters a password
- THEN the form MUST enforce `Validators.minLength(12)` client-side
- AND the backend remains the authoritative validator (client check is UX only, not a security boundary)

#### Scenario: Accept invitation succeeds (auto-login)
- GIVEN a valid, unexpired token and a password >= 12 chars
- WHEN the user submits the form
- THEN `AuthService.acceptInvitation(token, password, terms_version?)` MUST call `POST /auth/accept-invitation`
- AND the backend returns 201 with `{ access_token, refresh_token, permissions }`
- AND tokens MUST be persisted via `persistTokens`, `isAuthenticated()` becomes `true`
- AND the router MUST navigate to `/app/dashboard`

#### Scenario: Invalid token (404)
- GIVEN an unknown or malformed token
- WHEN the preview call fires
- THEN the 404 response MUST be caught
- AND the component MUST show "Invitation not found" via an `errorMessage` signal
- AND no tokens are stored

#### Scenario: Expired or already-used token (410)
- GIVEN a token that has expired or was already redeemed
- WHEN the accept call fires
- THEN the 410 response MUST be caught
- AND the component MUST show "Invitation expired or already used" via the `errorMessage` signal
- AND no tokens are stored

#### Scenario: Accept invitation validation failure (422)
- GIVEN a valid token but a password failing backend rules
- WHEN the accept call fires
- THEN the 422 response MUST be caught
- AND field-level errors MUST be mapped to the password control
- AND no tokens are stored

#### Scenario: Route available without guest guard
- GIVEN no active session, OR an already-authenticated session
- WHEN the user navigates to `/accept-invitation?token=abc123`
- THEN the route MUST load `AcceptInvitationComponent` without a `guestGuard`
- AND if a session already exists, it MUST be cleared before the new invitation is accepted (so the user can join a different org)

---

## R3 — Token Refresh

> **Contrato de rutas (fijado 2026-09-01)**: la ruta real es `POST /api/auth/refresh` —
> prefijo global `api` (`backend/src/main.ts:30`, `app.setGlobalPrefix('api')`) +
> `@Controller('auth')` (`backend/src/modules/auth/auth.controller.ts:41`). **No hay
> segmento de versión**: no existe `enableVersioning` en el backend, y el frontend
> compone la URL con `apiUrl: '/api'` (`frontend/src/environments/environment.ts:3`).
> Cualquier test o cliente que asuma `/api/v1/...` está desalineado con el sistema real.

### R3.1 Auto-Refresh Before Expiry

**Given** access token within 2 min of expiry  
**When** any HTTP call triggered (via `auth.interceptor`)  
**Then**:
- Interceptor checks `tokenExpiresAt` signal
- If remaining time < 2 min, call `authService.refresh()` first
- `POST /api/auth/refresh` called (backend uses httpOnly refresh cookie)
- Backend returns `{ access_token: 'new_jwt...' }`
- `tokenSignal` updated
- `tokenExpiresAt` recalculated (now + 15m)
- Original HTTP call retried with new token
- User sees no interruption (transparent)

### R3.2 Refresh Token Expired

**Given** refresh token expired (no cookie or invalid)  
**When** auto-refresh triggered  
**Then**:
- `POST /api/auth/refresh` called
- Backend returns 401: `{ message: 'Refresh token invalid' }`
- `clearAuthState()` called: all signals reset to null
- Router navigates to `/auth/login`
- Toast shown: "Session expired, please login again"
- Original HTTP call NOT retried

---

## R4 — Logout

### R4.1 Logout

**Given** logged-in user  
**When** calling `authService.logout()`  
**Then**:
- HTTP `POST /auth/logout` called
- Backend revokes session (invalidates refresh cookie)
- `clearAuthState()` called:
  - `tokenSignal` → null
  - `userSignal` → null
  - `sidSignal` → null
  - localStorage cleared
- `isAuthenticated` returns `false`
- Router navigates to `/auth/login`
- Promise resolves

---

## R5 — Token Persistence

### R5.1 Token Persisted Across Refresh

**Given** logged-in user closes browser tab  
**When** user reopens app  
**Then**:
- `AuthService` constructor calls `getStoredToken()`
- `tokenSignal` initialized from localStorage: `auth_token_${env}`
- `userSignal` initialized from localStorage: `auth_user_${env}`
- `isAuthenticated` computed signal returns `true` immediately
- User NOT redirected to login (already authed)
- Route guard allows navigation to protected pages

### R5.2 Token Cleared on Logout

**Given** user logged out  
**When** browser closed and reopened  
**Then**:
- localStorage keys `auth_token_${env}`, `auth_user_${env}` are missing
- `tokenSignal` initialized as null
- `isAuthenticated` returns `false`
- Route guard redirects to `/auth/login`

---

## R6 — JWT Injection (Auth Interceptor)

> **Contrato de rutas**: idéntico al de R3 — `setGlobalPrefix('api')` + `@Controller(...)`,
> sin segmento de versión. La suite `auth.interceptor.spec.ts` DEBE dirigirse a rutas
> reales (`/api/auth/login`, `/api/auth/refresh`, `/api/auth/me`, `/api/incidents`, …).
> Una URL inventada que el propio test emite y espera no verifica nada — pasa con
> cualquier literal. Corregido en `2026-09-01-fix-auth-interceptor-spec-urls` (ver
> `openspec/changes/archive/2026-09-01-fix-auth-interceptor-spec-urls/`).

### R6.1 JWT Injected on Authenticated Calls

**Given** logged-in user with valid token  
**When** any HTTP GET/POST/PATCH/DELETE triggered  
**Then**:
- `auth.interceptor` intercepts request
- `Authorization: Bearer <token>` header added
- Request proceeds with auth header
- Backend decodes JWT, validates signature, permits call

### R6.2 No JWT on Unauthenticated Calls

**Given** logged-out user (or token null)  
**When** HTTP call triggered  
**Then**:
- `auth.interceptor` checks `authService.token()` signal
- If null, NO `Authorization` header added
- Request proceeds as-is (public endpoint or 401 if protected)

### R6.3 Interceptor Test Suite Targets Real Routes

**Given** `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`  
**When** se busca la cadena `/api/v1`  
**Then**:
- No hay coincidencias — toda URL del archivo corresponde a un `@Controller` existente
  del backend
- Un test de regresión (`auth.interceptor.regression.spec.ts`) falla si `/api/v1`
  reaparece en el spec

---

## R7 — Concurrent Calls Handling

### R7.1 Multiple Calls During Refresh

**Given** user makes 3 HTTP calls while token refresh in flight  
**When** all 3 calls reach interceptor before refresh completes  
**Then**:
- First call triggers `refresh()` and waits
- Remaining 2 calls wait for refresh to finish (no duplicate refresh)
- After refresh, all 3 retried with new token
- User sees single request volley (not 3 refresh attempts)

---

## Integration with Components

- **LoginComponent** — calls `authService.login()`, handles 401/network errors, shows form hints
- **RegisterComponent** — calls `authService.register()`, shows success banner, navigates to login
- **Route guards** — check `isAuthenticated` signal, allow/deny navigation
- **Header component** — reads `currentUser` signal, displays user name/avatar (reactive)
- **Offline sync** — NO login attempts stored in IndexedDB (security)
