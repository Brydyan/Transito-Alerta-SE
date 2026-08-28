# Design: Auth & Comments Backend Integration

**Change**: `2026-08-28-sc-203-auth-comments-backend-integration`  
**Phase**: Design & Contracts  
**Author**: GEMINI (SDD architect)  
**Date**: 2026-08-28

---

## D1 — Architecture Overview

```
┌─────────────────────────────────────────┐
│   Angular Components (UI Layer)         │
│  LoginComponent, IncidentDetailComponent │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│   Services (Business Logic)             │
│  AuthService, CommentService, etc.      │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│   Interceptors (HTTP Middleware)        │
│  auth.interceptor (JWT), error.interceptor │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│   HttpService (Base Layer)              │
│  Wraps HttpClient, baseUrl=localhost:3001/api │
└────────────────┬────────────────────────┘
                 │
                 ▼
        NestJS Backend (3001/api)
        Auth, Comments, Incidents modules
```

---

## D2 — Auth Service Contracts

### AuthService (frontend/src/app/core/services/auth.service.ts)

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  // ───── Signals (reactive state) ─────
  readonly isAuthenticated: Signal<boolean>;  // computed
  readonly currentUser: Signal<User | null>;
  readonly token: Signal<string | null>;
  readonly tokenExpiresAt: Signal<string | null>;  // ISO 8601 timestamp

  // ───── Public methods ─────
  
  login(credentials: LoginRequest): Observable<LoginResponse>;
  // POST /auth/login
  // Input: { email?, password?, device_uuid? }
  // Output: { access_token, refresh_token?, user: User }
  // Side effects: sets token/user signals, navigates on success
  // Throws: HttpErrorResponse on 401/500
  
  register(payload: RegisterRequest): Observable<RegisterResponse>;
  // POST /auth/register
  // Input: { email, password, device_uuid }
  // Output: { id, email, message: string }
  // Side effects: NONE (no auto-login per R11)
  // Throws: HttpErrorResponse on 422/409
  
  refresh(): Observable<RefreshTokenResponse>;
  // POST /auth/refresh
  // Input: none (backend reads httpOnly cookie)
  // Output: { access_token, refresh_token? }
  // Side effects: updates token signal
  // Throws: HttpErrorResponse on 401 (expired refresh token)
  
  logout(): Observable<void>;
  // POST /auth/logout
  // Side effects: clears all auth state, navigates to login
  // Throws: HttpErrorResponse on 401 (already logged out)
  
  me(): Observable<User>;
  // GET /auth/me (legacy security pattern, not used in T8 but kept)
  // Returns: current user from backend (role always fresh)
  // Throws: HttpErrorResponse on 401
}
```

### Type Definitions (frontend/src/app/core/models/auth.model.ts)

```typescript
// ───── Request/Response DTOs ─────

interface LoginRequest {
  email?: string;      // optional: can use device_uuid for anonymous
  password?: string;
  device_uuid?: string;  // for anonymous citizen flow
}

interface LoginResponse {
  access_token: string;        // JWT (15m TTL)
  refresh_token?: string;      // optional, backend sends in httpOnly cookie
  user: User;
}

interface RegisterRequest {
  email: string;
  password: string;            // min 8 chars (backend validates)
  device_uuid?: string;
}

interface RegisterResponse {
  id: string;
  email: string;
  message: string;             // "Verification email sent to..."
}

interface RefreshTokenResponse {
  access_token: string;        // new JWT
  refresh_token?: string;      // updated if rotating
}

interface User {
  id: string;                  // UUID
  email: string;
  name?: string;
  roleId?: number;             // backend role ID
  roleName?: string;           // 'admin' | 'operator' | 'citizen'
  avatar?: string | null;      // avatar URL or null
  permissions?: string[];      // cached from backend
  device_uuid?: string;        // for anonymous users
}

// ───── Signal State ─────

interface AuthState {
  tokenSignal: Signal<string | null>;
  refreshTokenSignal: Signal<string | null>;
  userSignal: Signal<User | null>;
  tokenCreatedAtSignal: Signal<string | null>;  // ISO 8601
  tokenExpiresAtSignal: Signal<string | null>;  // ISO 8601
  sidSignal: Signal<string | null>;             // session ID (legacy)
}
```

---

## D3 — Comment Service Contracts

### CommentService (frontend/src/app/core/services/comment.service.ts)

```typescript
@Injectable({ providedIn: 'root' })
export class CommentService {
  
  getComments(incidentId: string): Observable<Comment[]>;
  // GET /comments/incident/:incidentId
  // Returns: Comment[]
  // Throws: HttpErrorResponse on 404 (incident not found)
  
  getComments$(): Observable<Comment[]>;
  // Returns: observable of cached comments (BehaviorSubject)
  // Used by: template async pipe, reactive updates
  
  createComment(incidentId: string, dto: CreateCommentDto): Observable<Comment>;
  // POST /comments
  // Body: { incident_id: incidentId, text, author_id }
  // Returns: created Comment with id, created_at
  // Side effects: adds to local cache
  // Throws: HttpErrorResponse on 422 (validation), 401 (not authed)
  
  updateComment(id: string, dto: UpdateCommentDto): Observable<Comment>;
  // PATCH /comments/:id
  // Body: { text? }
  // Returns: updated Comment
  // Side effects: updates cache
  // Throws: HttpErrorResponse on 403 (not author), 404 (not found)
  
  deleteComment(id: string): Observable<void>;
  // DELETE /comments/:id
  // Returns: void
  // Side effects: removes from cache
  // Throws: HttpErrorResponse on 403 (not author), 404
  
  uploadCommentImage(commentId: string, file: File): Observable<CommentImage>;
  // POST /comments/:id/images
  // Body: FormData { image: File }
  // Returns: { id, comment_id, url, created_at }
  // Side effects: appends to comment.images cache
  // Throws: HttpErrorResponse on 400 (invalid file), 401
  // NOTE: Stub for P0, full impl in Priority 2
}
```

### Type Definitions (frontend/src/app/core/models/comment.model.ts)

```typescript
interface Comment {
  id: string;                 // UUID
  incident_id: string;        // FK to incidents
  author_id: string;          // FK to users
  author?: User;              // optional denorm (backend may include)
  text: string;
  created_at: string;         // ISO 8601
  updated_at: string;         // ISO 8601
  deleted_at?: string | null; // soft delete
  images?: CommentImage[];
}

interface CreateCommentDto {
  incident_id: string;
  text: string;
  author_id: string;           // from AuthService.currentUser().id
}

interface UpdateCommentDto {
  text?: string;              // only field client can change
}

interface CommentImage {
  id: string;
  comment_id: string;
  url: string;                // S3 or Supabase storage URL
  size_bytes: number;
  mime_type: string;
  created_at: string;
}
```

---

## D4 — Interceptor Changes

### Auth Interceptor (frontend/src/app/core/interceptors/auth.interceptor.ts)

**Current status**: Exists, needs refinement for refresh token flow

**Changes**:
1. Check `authService.tokenExpiresAt()` before every request
2. If expires in < 2min, queue `refresh()` first
3. Use `switchMap` to wait for refresh to complete
4. Retry original request with new token
5. On 401 from refresh, logout + redirect to login

```typescript
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authService.token();
    
    if (!token) {
      return next.handle(req);  // no auth
    }
    
    // Check if refresh needed
    const expiresAt = this.authService.tokenExpiresAt();
    const now = new Date().toISOString();
    const needsRefresh = expiresAt && new Date(expiresAt) < new Date(Date.now() + 2 * 60 * 1000);
    
    if (needsRefresh) {
      // Wait for refresh, then retry original call
      return this.authService.refresh().pipe(
        switchMap(() => {
          const newReq = this.addAuthHeader(req);
          return next.handle(newReq);
        }),
        catchError((err) => {
          // Refresh failed: logout
          this.authService.logout();
          return throwError(() => err);
        }),
      );
    }
    
    // Token OK, just add header
    const authReq = this.addAuthHeader(req);
    return next.handle(authReq);
  }

  private addAuthHeader(req: HttpRequest<any>): HttpRequest<any> {
    const token = this.authService.token();
    if (!token) return req;
    return req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
}
```

### Error Interceptor (frontend/src/app/core/interceptors/error.interceptor.ts)

**Changes**:
1. On 401 + auth already valid: assume session revoked remotely, logout
2. On 422: attach `errors` field to thrown error for component field-level rendering
3. On 403: show "You don't have permission" toast
4. On 404: show "Resource not found" (context-dependent)
5. On network error (status 0): queue for offline sync if applicable

---

## D5 — Storage & Persistence

### localStorage Keys

```
auth_token_{env}         // JWT access token
auth_refresh_token_{env} // Refresh token (backup, in case not httpOnly)
auth_user_{env}          // Serialized User object
auth_created_at_{env}    // Token creation timestamp
auth_expires_at_{env}    // Token expiration timestamp
auth_sid_{env}           // Session ID (legacy, if used)
```

**Note**: `{env}` = 'development' | 'staging' | 'production' (from `environment.ts`)

---

## D6 — Offline Sync Integration

### OfflineSyncService Changes

```typescript
// In offline-sync.service.ts

// Queuing
queueComment(commentDto: CreateCommentDto): Promise<void> {
  // Store in IndexedDB under: incidents:${incidentId}:comments:draft:${uuid}
  // Sync on reconnect
}

// Deduplication (on sync success)
deduplicateComments(incidentId: string): Promise<void> {
  // Check if draft comment matches newly created comment
  // by text + timestamp proximity
  // Remove draft if synced successfully
}
```

**Rule**: Login attempts are NEVER queued (security). Registration optional (not typically offline).

---

## D7 — Testing Strategy

### Unit Tests (Jest)

**auth.service.spec.ts**:
- ✅ `login()` success: token stored, user cached
- ✅ `login()` failure: no state change, error passed
- ✅ `register()` success: no auto-login
- ✅ `register()` validation error: mapped to `.errors`
- ✅ `refresh()` success: token updated
- ✅ `refresh()` failure: logout triggered
- ✅ `logout()` clears state
- ✅ Token expiry computed correctly

**comment.service.spec.ts**:
- ✅ `getComments()` success: array returned
- ✅ `getComments()` 404: error thrown
- ✅ `createComment()` success: cache updated
- ✅ `createComment()` 422: error with `.errors`
- ✅ `deleteComment()` success: removed from cache
- ✅ `uploadCommentImage()` stub: method exists, not yet implemented

**auth.interceptor.spec.ts**:
- ✅ JWT injected on authed calls
- ✅ No JWT on public calls
- ✅ Refresh triggered when < 2min to expiry
- ✅ Original call retried after refresh
- ✅ 401 from refresh triggers logout

### E2E Tests (Playwright)

**auth-flow.e2e.ts**:
1. Open login page
2. Enter credentials: admin@correo.com / 123456
3. Submit → wait for navigation to dashboard
4. Verify URL = /dashboard, header shows user name

**comment-flow.e2e.ts**:
1. Login (auth-flow)
2. Open incident detail page
3. Verify "Comments" section loads
4. Add comment: "Test comment from E2E"
5. Verify new comment appears in list
6. Verify comment shows current timestamp

---

## D8 — Type Safety

**Rules**:
- ❌ NO `any` types in auth/comment services
- ✅ Strict mode: `"strict": true` in tsconfig.json
- ✅ All DTOs fully typed with interfaces
- ✅ Observables always typed: `Observable<T>`
- ✅ Signals typed: `Signal<T>`
- ✅ Error handling: `HttpErrorResponse` always caught

---

## D9 — Error Handling Matrix

| Error | HTTP Code | Handler | User Sees |
|-------|-----------|---------|-----------|
| Invalid creds | 401 | error.interceptor | Toast + form re-shown |
| Email exists | 409 | error.interceptor | Form field hint |
| Validation | 422 | error.interceptor | Field-level errors |
| Forbidden | 403 | error.interceptor | Toast "No permission" |
| Not found | 404 | error.interceptor | Toast "Resource not found" |
| Network | 0 | error.interceptor | Toast "Connection lost" + queue sync |
| Refresh token expired | 401 | auth.interceptor → logout | Redirect to login |
| Concurrent refresh | N/A | switchMap (queuing) | Transparent (single refresh) |

---

## D10 — Migration Notes

**From Legacy (GeoReporta)**:
- ✅ No caching of role (always fetch from `/me` — not used in T8 but kept for future)
- ✅ No auto-login after register (matches R11 decision)
- ✅ localStorage for token persistence (matches legacy)
- ✅ JWT in `Authorization: Bearer` header (standard)
- ✅ HttpOnly cookie for refresh token (backend managed)

**New in T8**:
- ✅ TypeScript strict mode (no legacy `any`)
- ✅ Angular signals for reactive state (replacing RxJS subjects)
- ✅ Standalone components (no modules, Angular 17+)
- ✅ Interceptor auto-refresh (no manual refresh calls in components)
- ✅ Observable-based services (not Promises)

---

## D11 — Known Limitations (P0)

1. **No concurrent login** — if user logs in from 2 tabs, tokens may desync
2. **No SSO** — Google Auth flow removed (Google OAuth not in roadmap for T8)
3. **No biometric** — Touch/Face ID not in scope
4. **Image upload stub** — full implementation deferred to Priority 2

---

## D12 — Dependencies

- ✅ `@angular/common/http` — HttpClient
- ✅ `@angular/core` — Injectable, Signal, computed
- ✅ `rxjs` — Observable, switchMap, catchError, tap
- ✅ `typescript` — strict mode

**No new dependencies added**.

---

## Decision Log

- **2026-08-28**: Design document created. All DTOs finalized.
- **2026-08-28**: Endpoint paths aligned (comments: `/comments`, not nested).
- **2026-08-28**: Token refresh strategy: 2-min window, transparent retry.
- **2026-08-28**: No register auto-login (confirmed vs legacy R11).
