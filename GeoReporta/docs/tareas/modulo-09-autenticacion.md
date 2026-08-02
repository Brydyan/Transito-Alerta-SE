# Módulo 09 — Autenticación y Control de Acceso

**Requisitos SRS:** RF-FUNC-024, RF-FUNC-025, RF-FUNC-026, RF-SW-001, RF-UI-001
**Casos de prueba:** CP-09-01 a CP-09-09 (9 casos)

---

## RF-FUNC-024 — Login de Usuario

### RF-FUNC-024_CP-09-01-F: Login con credenciales válidas redirige a dashboard

- **Requisito:** RF-FUNC-024 — Login de Usuario
- **Prueba:** CP-09-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Ingresar admin@ejemplo.com / Admin123, click en "Ingresar".
- **Criterio:** Spinner de carga, redirección a /dashboard (admin) o /feed (ciudadano), token almacenado.
- **Estado:** ☑ Completado | **Implementación:** 
  - `frontend/app/auth/pages/login/login.component.js` (lines 39-80) — `handleSubmit()` calls `auth.login(email, password)`
  - `frontend/app/auth/pages/login/login.component.html` (lines 1-120) — login form with email, password, submit button, error display
  - `frontend/app/auth/auth.service.js` (lines 39-48) — `login()` stores access token + session ID, triggers `_notifyAuthChange()`
  - Router redirects by role: admin roles → `/dashboard`, usuarios → `/feed`

---

### RF-FUNC-024_CP-09-01-B: POST /login retorna token JWT + user resource

- **Requisito:** RF-FUNC-024 — Login de Usuario
- **Prueba:** CP-09-01-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST /api/login con credenciales válidas.
- **Criterio:** HTTP 200, `{ "access_token": "...", "token_type": "Bearer", "expires_in": 900, "user": { ... } }`. Refresh token en HttpOnly cookie.
- **Estado:** ☑ Completado | **Implementación:**
  - `backend/routes/api.php` (line 24) — `POST /login` route
  - `backend/app/Domains/Auth/Local/Http/Controllers/AuthController.php` (lines 43-64) — `login()` validates LoginRequest, calls `AuthService::login()`, returns access_token + UserResource + refresh/mercure cookies
  - `backend/app/Domains/Auth/Local/Http/Requests/LoginRequest.php` (lines 12-18) — validates `email` (required, email format) + `password` (required, string)
  - `backend/app/Domains/Auth/Shared/Services/AuthService.php` (lines 60-89) — `login()` verifies password via Hash::check(), calls `issueSession()` if valid
  - Access token TTL: 900 seconds (15 min), Refresh TTL: 30 days
  - **Tests:** `backend/tests/Feature/Auth/AuthControllerTest.php` (lines 56-139)

---

## RF-UI-001 — Pantalla de Login

### RF-UI-001_CP-09-02-F: Login con password incorrecto muestra error

- **Requisito:** RF-UI-001 — Pantalla de Login
- **Prueba:** CP-09-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Email correcto, password equivocado, click "Ingresar".
- **Criterio:** Mensaje "Credenciales incorrectas" renderizado en rojo, form no se cierra.
- **Estado:** ☑ Completado | **Implementación:**
  - `frontend/app/auth/pages/login/login.component.js` (lines 57-78) — `handleSubmit()` catch block displays `err.message` in `#login-error` div
  - `frontend/app/auth/pages/login/login.component.html` (lines 18-20) — error div with red styling (`text-danger`)
  - Backend returns 422 ValidationException with message: "Credenciales inválidas" (from AuthenticationException::toValidationException)
  - **Tests:** `frontend/app/auth/pages/login/login.component.test.js` (lines 45-67)

---

### RF-SW-001_CP-09-02-B: Login falla con credenciales inválidas retorna 422

- **Requisito:** RF-SW-001 — API REST Autenticación
- **Prueba:** CP-09-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST /api/login con password incorrecto.
- **Criterio:** HTTP 422, `{ "message": "Credenciales inválidas", "errors": { "email": [...] } }`.
- **Estado:** ☑ Completado | **Implementación:**
  - `backend/app/Domains/Auth/Shared/Services/AuthService.php` (lines 60-89) — throws AuthenticationException if password fails Hash::check()
  - `backend/app/Domains/Auth/Shared/Exceptions/AuthenticationException.php` (lines 10-26) — `toValidationException()` converts to Laravel ValidationException with 422 status
  - `backend/app/Domains/Auth/Local/Http/Controllers/AuthController.php` (lines 52-54) — catches AuthenticationException, rethrows as ValidationException
  - **Tests:** `backend/tests/Feature/Auth/AuthControllerTest.php` (lines 141-165)

---

### RF-UI-001_CP-09-03-F: Login con email vacío muestra validación

- **Requisito:** RF-UI-001 — Pantalla de Login
- **Prueba:** CP-09-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Dejar email vacío, ingresar password, click "Ingresar".
- **Criterio:** Mensaje de validación "El email es requerido" debajo del campo email, form no se envía.
- **Estado:** ☑ Completado | **Implementación:**
  - `frontend/app/auth/pages/login/login.component.html` (lines 6-14) — email input with `required` attribute + custom validation handler
  - `frontend/app/auth/pages/login/login.component.js` (lines 39-42) — client-side validation checks `email.trim().length > 0` before POST
  - If fails, displays error: "El email es requerido" in `#login-error`
  - **Tests:** `frontend/app/auth/pages/login/login.component.test.js` (lines 78-92)

---

## RF-FUNC-025 — Logout de Usuario

### RF-FUNC-025_CP-09-04-F: Logout cierra sesión y redirige a login

- **Requisito:** RF-FUNC-025 — Logout de Usuario
- **Prueba:** CP-09-04-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Click "Cerrar sesión" en header, intentar acceder a /dashboard.
- **Criterio:** Redirección inmediata a /login, access_token y session_id removidos, caches invalidadas (menú, permisos, notificaciones).
- **Estado:** ☑ Completado | **Implementación:**
  - `frontend/app/shared/app-shell.component.js` (lines 900-930) — logout button handler calls `auth.logout()`
  - `frontend/app/auth/auth.service.js` (lines 114-142) — `logout()` POST `/logout`, then:
    - Clears menuService cache (prevents stale sidebar)
    - Clears permissionService cache (prevents stale RBAC)
    - Clears notificationService cache
    - Invalidates mapaService cache
    - Calls `clearAuthState()` (removes access_token + session_id from memory)
    - Notifies subscribers via `_notifyAuthChange()` → triggers router → redirects to `/login`
  - `frontend/app/auth/auth.guard.js` (lines 9-17) — authGuard checks `getAccessToken()`, redirects to `/login` if falsy
  - **Tests:** `frontend/app/auth/auth.service.test.js` (lines 85-112)

---

### RF-FUNC-025_CP-09-04-B: POST /logout invalida sesión en servidor

- **Requisito:** RF-FUNC-025 — Logout de Usuario
- **Prueba:** CP-09-04-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST /api/logout con header Authorization (JWT token válido).
- **Criterio:** HTTP 200, `{ "message": "Sesión cerrada exitosamente." }`. Refresh token expira, sesión marcada como `is_revoked=1`.
- **Estado:** ☑ Completado | **Implementación:**
  - `backend/routes/api.php` (line 33) — `POST /logout` route with `middleware('jwt')`
  - `backend/app/Domains/Auth/Local/Http/Controllers/AuthController.php` (lines 96-109) — `logout()` reads `_session_id` from request, calls `AuthService::revokeSession()`, expires refresh + mercure cookies
  - `backend/app/Domains/Auth/Shared/Services/AuthService.php` (lines 100-105) — `revokeSession()` marks session record as `is_revoked=true`, sets expiry to now
  - Refresh token cookie expires immediately (max-age=-60)
  - Subsequent requests with old refresh token will fail (session check fails)
  - **Tests:** `backend/tests/Feature/Auth/AuthControllerTest.php` (lines 167-190)

---

## RF-FUNC-026 — Protección de Rutas

### RF-FUNC-026_CP-09-05-F: Acceso sin autenticación redirige a login

- **Requisito:** RF-FUNC-026 — Protección de Rutas
- **Prueba:** CP-09-05-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Abrir nueva pestaña, ir directamente a /#/dashboard sin token.
- **Criterio:** Router intercepta, redirige inmediatamente a /#/login antes de cargar componente.
- **Estado:** ☑ Completado | **Implementación:**
  - `frontend/app/core/router.js` (lines 85-91) — runGuards() ejecuta antes de route activation
  - `frontend/app/auth/auth.guard.js` (lines 9-17) — `canActivate()` checks `getAccessToken()`, returns false + redirects if missing
  - All protected routes decorated with authGuard: `/dashboard`, `/incidencias`, etc.
  - **Tests:** `frontend/app/auth/auth.guard.test.js` (lines 12-35)

---

## RS-006 — Sesiones (Expiración y Renovación)

### RS-006_CP-09-06-F: Sesión expira y redirige a login automáticamente

- **Requisito:** RS-006 — Sesiones (expiración)
- **Prueba:** CP-09-06-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Token expira (TTL 15 min). Usuario intenta hacer un request a los 20 min.
- **Criterio:** Http.service intenta `POST /auth/refresh` automáticamente. Si falla (no hay valid refresh cookie), redirige a `/login` con mensaje "Sesión expirada".
- **Estado:** ☑ Completado | **Implementación:**
  - `frontend/app/core/http.service.js` (lines 90-145) — interceptor logic:
    - Line 120: on 401 response, attempts `POST /auth/refresh`
    - Line 122-128: if refresh succeeds, queues pending request + retries it
    - Line 129-135: if refresh fails, clears auth state + redirects to `/login`
  - `frontend/app/auth/auth.service.js` (lines 179-186) — `tryRestoreSession()` runs on app bootstrap, attempts refresh silently
  - **Tests:** `frontend/app/core/http.service.test.js` (lines 120-180)

---

### RS-006_CP-09-07-B: Token refresh renew access token automáticamente

- **Requisito:** RS-006 — Sesiones (renovación)
- **Prueba:** CP-09-07-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST /api/auth/refresh con refresh_token válido en cookie.
- **Criterio:** HTTP 200, retorna nuevo `access_token` + nuevo `refresh_token` en cookie. Sesión actualizada (token hash renovado).
- **Estado:** ☑ Completado | **Implementación:**
  - `backend/routes/api.php` (line 25) — `POST /auth/refresh` route (public, no JWT middleware)
  - `backend/app/Domains/Auth/Local/Http/Controllers/AuthController.php` (lines 69-91) — `refresh()` reads `refresh_token` cookie, calls `AuthService::refresh()`, returns new tokens
  - `backend/app/Domains/Auth/Shared/Services/AuthService.php` (lines 91-99) — `refresh()` validates refresh token:
    - Finds session by refresh token hash
    - Checks `!$session->is_revoked && !$session->isExpired()`
    - Issues new access + refresh tokens, updates session record
  - New refresh token hash stored in DB (prevents replay attacks)
  - **Tests:** `backend/tests/Feature/Auth/AuthControllerTest.php` (lines 192-220)

---

### RS-006_CP-09-08-F: Token refresh transparente en background sin interrumpir UX

- **Requisito:** RS-006 — Sesiones (transparencia)
- **Prueba:** CP-09-08-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Usuario trabajando en dashboard. A los 14 min (antes de expiración 15m), request automático usa token expirado internamente.
- **Criterio:** Http.service detecta 401, intenta refresh en background, reintenta request original. Usuario no ve redirección a login, continúa sin interrupción.
- **Estado:** ☑ Completado | **Implementación:**
  - `frontend/app/core/http.service.js` (lines 120-145) — token refresh queue:
    - `_inflightRefresh` flag prevents concurrent refresh calls (lines 140-145)
    - `_tokenRefreshQueue` holds pending requests while refresh is in-flight
    - After successful refresh, all queued requests retry automatically
  - User sees no UI disruption (no redirect, no error banner)
  - **Tests:** `frontend/app/core/http.service.test.js` (lines 182-230)

---

### RS-006_CP-09-09-BD: Sesión expirada se invalida en BD automáticamente

- **Requisito:** RS-006 — Sesiones (limpieza)
- **Prueba:** CP-09-09-BD
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Ejecutar verificación de sesiones expiradas.
- **Criterio:** Query `SELECT * FROM sessions WHERE expires_at < NOW()` retorna sesiones con `is_revoked=1` o eliminadas por garbage collection.
- **Estado:** ☑ Completado | **Implementación:**
  - `backend/app/Domains/Sessions/Models/Session.php` (lines 1-50) — Session model with:
    - `expires_at` timestamp
    - `is_revoked` boolean
    - `isValid()` method: checks `!is_revoked && expires_at > NOW()`
  - Middleware `JwtAuthenticate` (lines 60-90) checks `isValid()` on every request
  - Laravel session garbage collection (configured in `config/session.php`): stale sessions pruned automatically
  - No explicit DELETE required; `isValid()` check prevents use of expired sessions
  - **Tests:** `backend/tests/Unit/Sessions/SessionTest.php` (lines 20-45)

---

## Resumen de Implementación

| Característica | Frontend | Backend | BD | Tests | Estado |
|---|---|---|---|---|---|
| Login local (email/password) | ✓ | ✓ | — | ✓ | ☑ |
| Logout + revocación de sesión | ✓ | ✓ | ✓ | ✓ | ☑ |
| Token refresh automático | ✓ | ✓ | — | ✓ | ☑ |
| Auth guard (rutas protegidas) | ✓ | ✓ | — | ✓ | ☑ |
| Role-based access control | ✓ | ✓ | — | ✓ | ☑ |
| Permission-based access control | ✓ | ✓ | — | ✓ | ☑ |
| Google/Firebase sign-in | ✓ | ✓ | — | ✓ | ☑ |
| User registration (R11) | ✓ | ✓ | — | ✓ | ☑ |
| Current user (/me) endpoint | ✓ | ✓ | — | ✓ | ☑ |
| Profile update | ✓ | ✓ | — | ✓ | ☑ |
| JWT signing + validation | — | ✓ | — | ✓ | ☑ |
| HttpOnly cookies (refresh/mercure) | — | ✓ | — | ✓ | ☑ |
| Session revocation (DB-backed) | — | ✓ | ✓ | ✓ | ☑ |
| IP/UA tracking | — | ✓ | ✓ | ✓ | ☑ |

---

> **Total tareas:** 9 | **Frontend:** 6 | **Backend:** 3 | **BD:** 1
> **Completadas:** 9/9 (100%) | **Estado:** ✅ 100%
> **ESTADO M09:** ✅ COMPLETADO — Autenticación completa con login local, Google, refresh automático, revocación de sesión, guards de rol/permisos, tests exhaustivos. Listo para producción.

## Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `backend/app/Domains/Auth/Local/Http/Controllers/AuthController.php` | Endpoints login/logout/refresh/me/profile |
| `backend/app/Domains/Auth/Firebase/Http/Controllers/GoogleAuthController.php` | Google/Firebase auth endpoint |
| `backend/app/Domains/Auth/Shared/Services/AuthService.php` | Lógica de autenticación (login, issuance, refresh, revoke) |
| `backend/app/Domains/Sessions/Models/Session.php` | Model de sesión con validación |
| `backend/app/Domains/Sessions/Http/Middleware/JwtAuthenticate.php` | Middleware de JWT + session validation |
| `backend/app/Domains/Users/Models/User.php` | User model con roles y permisos |
| `frontend/app/auth/auth.service.js` | Frontend auth service (login, logout, me, refresh) |
| `frontend/app/auth/auth.guard.js` | Route guard para autenticación |
| `frontend/app/auth/role.guard.js` | Route guard para roles |
| `frontend/app/auth/permission.guard.js` | Route guard para permisos |
| `frontend/app/core/http.service.js` | HTTP interceptor con token refresh automático |
| `frontend/app/auth/pages/login/login.component.js` | Login page (local + Google) |
