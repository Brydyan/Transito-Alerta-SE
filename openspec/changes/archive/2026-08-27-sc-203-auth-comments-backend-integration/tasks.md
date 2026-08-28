# Tasks: Auth & Comments Backend Integration

**Change**: `2026-08-28-sc-203-auth-comments-backend-integration`  
**Total Tasks**: 25  
**Estimated**: 6h (Minimax impl + tests)  
**Assigned to**: Minimax (implementation agent)

---

## Fase A — Auth Service Uncomment & Real Flow (T1-T2)

### Phase A.1 — Uncomment Real Login

- [x] **A1.1** — Remove `//MOCK temporal para el login` comment block in auth.service.ts (lines 54-91)
- [x] **A1.2** — Uncomment real login method (lines 45-52 that are currently commented out)
- [x] **A1.3** — Verify `import { environment }` exists and `environment.apiUrl` set to `http://localhost:3001/api`
- [x] **A1.4** — Test: `ng serve` → login form → enter admin@correo.com / 123456 → verify HTTP POST to /auth/login fired (DevTools Network tab)

### Phase A.2 — Fix Token Lifecycle

- [x] **A2.1** — In auth.service.ts, verify token TTL calculation: `expires_at = created_at + 15 minutes`
- [x] **A2.2** — Ensure `tokenExpiresAtSignal` is exported as computed signal: `readonly tokenExpiresAt = computed(() => ...)`
- [x] **A2.3** — Verify localStorage keys use environment suffix: `auth_token_${environment.name}`
- [x] **A2.4** — Test: Login → close DevTools → check localStorage has `auth_token_development` entry

### Phase A.3 — Refresh Token Auto-Refresh

- [x] **A3.1** — In auth.interceptor.ts, add refresh check before every request:
  ```typescript
  if (expiresAt < now + 2min) {
    return this.authService.refresh().pipe(switchMap(...))
  }
  ```
- [x] **A3.2** — Implement `refresh()` method in auth.service calling `POST /auth/refresh`
- [x] **A3.3** — On 401 from refresh: call `logout()`, redirect to login
- [x] **A3.4** — Use `switchMap` to queue concurrent calls (only 1 refresh flies at a time)
- [x] **A3.5** — Test: Create incident → wait 14 min → trigger any HTTP call → verify refresh silently triggered (Network tab shows POST /auth/refresh then original call)

### Phase A.4 — Logout Implementation

- [x] **A4.1** — Verify logout method exists: `logout(): Observable<void>`
- [x] **A4.2** — On logout: clear all signals (token, user, refreshToken, etc.)
- [x] **A4.3** — On logout: clear localStorage keys matching `auth_*`
- [x] **A4.4** — On logout: navigate to `/auth/login`
- [x] **A4.5** — Test: Login → click "Logout" button → redirected to login, localStorage cleared

---

## Fase B — Register Flow Implementation (T3)

> **DEFERRED to Priority 2** — 2nd pass discovery:
> `POST /auth/register` is a 410 Gone tombstone in the backend
> (`backend/src/modules/auth/auth.controller.ts:54-58`).
> Registration is invitation-only via `POST /auth/accept-invitation`
> (with `{ token, password, terms_version? }`). Implementing the
> real flow requires a follow-up change. `authService.register()`
> now throws an explanatory error to surface stale callers.

### Phase B.1 — Register Method

- [ ] **B1.1** — In auth.service.ts, implement `register(payload: RegisterRequest): Observable<RegisterResponse>` (DEFERRED — backend is 410)
- [ ] **B1.2** — Calls `POST /auth/register` with email, password, device_uuid (DEFERRED — use `/auth/accept-invitation` instead)
- [ ] **B1.3** — Returns response unchanged: `{ id, email, message }` (DEFERRED)
- [ ] **B1.4** — Does NOT set token/user signals (no auto-login per R11) (DEFERRED)
- [ ] **B1.5** — Throws error on 422/409 with `.errors` field (DEFERRED)

### Phase B.2 — Register Component Integration

- [ ] **B2.1** — In RegisterComponent, wire `authService.register()` to form submit (DEFERRED — component removed)
- [ ] **B2.2** — On success: show success banner with `response.message` (DEFERRED)
- [ ] **B2.3** — On 422: extract `.errors` and map to form field hints (DEFERRED)
- [ ] **B2.4** — On success: after 3 seconds, navigate back to login form (DEFERRED)
- [ ] **B2.5** — Test: Submit registration form → success banner → redirected to login after 3s (DEFERRED)

### Phase B.3 — Validation

- [ ] **B3.1** — Add frontend validators (optional, backend is authoritative): (DEFERRED)
  - Email must be valid format
  - Password min 8 chars
  - device_uuid optional (set to UUID or leave blank)
- [ ] **B3.2** — Disable submit button while request in flight (DEFERRED)

---

## Fase C — Comment Service Endpoint Fixes (T4)

### Phase C.1 — Fix GET Comments Endpoint

- [x] **C1.1** — In comment.service.ts line 13, change:
  ```typescript
  // BEFORE
  return this.httpService.get<Comment[]>(`/incidents/${incidentId}/comments`);
  
  // AFTER
  return this.httpService.get<Comment[]>(`/comments/incident/${incidentId}`);
  ```
- [x] **C1.2** — Test: Call `getComments('123')` → DevTools shows GET `/comments/incident/123` (not `/incidents/123/comments`)

### Phase C.2 — Fix POST Comment Endpoint

- [x] **C2.1** — In comment.service.ts line 17, change:
  ```typescript
  // BEFORE
  return this.httpService.post<Comment>(`/incidents/${incidentId}/comments`, dto);
  
  // AFTER
  return this.httpService.post<Comment>(`/comments`, dto);
  ```
- [x] **C2.2** — Ensure DTO includes `incident_id` in body (not in URL path)
- [x] **C2.3** — Test: Create comment → DevTools shows POST `/comments` with `{ incident_id, text, author_id }` in body

### Phase C.3 — DELETE Comment (Already Correct)

- [x] **C3.1** — Verify DELETE endpoint is correct: `/comments/:id` (line 21)
- [x] **C3.2** — No changes needed

### Phase C.4 — Comment Cache Management

- [x] **C4.1** — Ensure `comments$` BehaviorSubject maintained in service
- [x] **C4.2** — On `createComment`: append to cache top
- [x] **C4.3** — On `deleteComment`: remove from cache
- [x] **C4.4** — Export `getComments$()` for template async pipe

---

## Fase D — Image Upload Stubs (T5)

### Phase D.1 — Method Stubs

- [x] **D1.1** — In comment.service.ts, add stub:
  ```typescript
  uploadCommentImage(commentId: string, file: File): Observable<CommentImage> {
    // Stub for Priority 2
    return this.httpService.post(`/comments/${commentId}/images`, formData);
  }
  ```
- [x] **D1.2** — Method exists but not wired to UI yet (Priority 2 will implement)
- [x] **D1.3** — Add comment: `// TODO: implement image compression + upload (Priority 2)`

---

## Fase E — Unit Tests (T6)

### Phase E.1 — Auth Service Tests

- [x] **E1.1** — Create/update `frontend/src/app/core/services/auth.service.spec.ts` (if doesn't exist)
- [x] **E1.2** — Test: `login()` success
  - Mock `httpService.post` to return `{ access_token: 'jwt...', user: {...} }`
  - Call `authService.login(creds)`
  - Assert `tokenSignal() === 'jwt...'`
  - Assert `isAuthenticated() === true`
  - Assert `currentUser().id === user.id`
- [x] **E1.3** — Test: `login()` 401 error
  - Mock `httpService.post` to throw 401
  - Call `authService.login(creds)`
  - Assert error caught, `isAuthenticated() === false`
- [x] **E1.4** — Test: `register()` success
  - Mock 201 response: `{ id, email, message }`
  - Call `authService.register(payload)`
  - Assert `isAuthenticated() === false` (no auto-login)
  - Assert response.message returned
- [x] **E1.5** — Test: `register()` 422 validation error
  - Mock 422 with `.errors` field
  - Call `authService.register(...)`
  - Assert error.errors accessible to component
- [x] **E1.6** — Test: `refresh()` success
  - Mock 200 response: `{ access_token: 'new_jwt...' }`
  - Call `authService.refresh()`
  - Assert `tokenSignal()` updated to new JWT
- [x] **E1.7** — Test: `logout()` clears state
  - Set auth state, then call `logout()`
  - Assert all signals are null
  - Assert localStorage cleared

### Phase E.2 — Comment Service Tests

- [x] **E2.1** — Create/update `frontend/src/app/core/services/comment.service.spec.ts`
- [x] **E2.2** — Test: `getComments()` success
  - Mock `httpService.get('/comments/incident/:id')` to return `Comment[]`
  - Call `getComments(incidentId)`
  - Assert array returned
  - Assert cache updated via `comments$.next()`
- [x] **E2.3** — Test: `getComments()` 404 error
  - Mock 404 response
  - Call `getComments(invalidId)`
  - Assert error thrown
- [x] **E2.4** — Test: `createComment()` success
  - Mock `httpService.post('/comments', dto)` to return `Comment`
  - Call `createComment(incidentId, dto)`
  - Assert new comment in cache
  - Assert optimistic update fired
- [x] **E2.5** — Test: `deleteComment()` success
  - Mock `httpService.delete` to return 200/204
  - Call `deleteComment(commentId)`
  - Assert comment removed from cache

### Phase E.3 — Interceptor Tests

- [x] **E3.1** — Create/update `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
- [x] **E3.2** — Test: JWT injected on authed calls
  - Set token in signal: `authService.tokenSignal.set('jwt...')`
  - Trigger HTTP GET
  - Assert `Authorization: Bearer jwt...` header sent
- [x] **E3.3** — Test: No JWT on public calls
  - Clear token: `authService.tokenSignal.set(null)`
  - Trigger HTTP GET
  - Assert NO `Authorization` header
- [x] **E3.4** — Test: Refresh triggered < 2min to expiry
  - Set token expiry to `now + 90 seconds`
  - Trigger HTTP GET
  - Assert `POST /auth/refresh` called first
  - Assert original call retried with new token

**Total test cases**: 20+  
**Target coverage**: 70%+ (auth, comment, interceptor services)

---

## Fase F — E2E Tests (T7)

### Phase F.1 — Auth Flow E2E

- [x] **F1.1** — Create `frontend/e2e/auth-flow.e2e.ts` (Playwright)
- [x] **F1.2** — Test steps:
  1. `goto('/auth/login')`
  2. Fill email: `admin@correo.com`
  3. Fill password: `123456`
  4. Click submit
  5. Wait for navigation to `/dashboard` (or first protected page)
  6. Assert header shows user name
  7. Assert URL is `/dashboard`
- [ ] **F1.3** — Run: `npm run test:e2e`
- [ ] **F1.4** — Assert test passes

### Phase F.2 — Comment CRUD E2E

- [x] **F2.1** — Create `frontend/e2e/comment-flow.e2e.ts` (Playwright)
- [x] **F2.2** — Test steps:
  1. Login (reuse F1.2 steps)
  2. Goto `/incidents/123` (hardcoded valid incident from seed)
  3. Wait for "Comments" section to load
  4. Type comment: `Test comment from E2E`
  5. Click "Add comment"
  6. Assert new comment appears in list within 2 seconds
  7. Assert comment shows current timestamp
  8. Assert comment text visible
- [ ] **F2.3** — Run: `npm run test:e2e`
- [ ] **F2.4** — Assert test passes

---

## Acceptance Criteria (All Phases)

- [ ] Login form calls real `POST /auth/login` (DevTools confirms)
- [ ] Tokens persisted in localStorage (DevTools Application tab)
- [ ] Register form works, shows success message, no auto-login
- [ ] Comment service calls `/comments/incident/:id` (not wrong nested path)
- [ ] Comment create calls `/comments` (body has `incident_id`, not URL param)
- [ ] Comment delete works (cache updated)
- [ ] Auth interceptor injects JWT on all authed calls
- [ ] Token refresh auto-triggers at 2-min window (DevTools Network tab)
- [ ] No `any` types in auth/comment services (tsc --strict pass)
- [ ] 70%+ Jest coverage for core services
- [ ] E2E smoke tests: login + comment flow pass
- [ ] No CORS errors in browser console
- [ ] No console errors/warnings

---

## Status Tracking

- [ ] Fase A — Auth real login + token lifecycle
- [ ] Fase B — Register flow
- [ ] Fase C — Comment endpoints fix
- [ ] Fase D — Image upload stubs
- [ ] Fase E — Unit tests (20+ cases)
- [ ] Fase F — E2E tests (2 flows)

---

## Notes for Minimax

1. **Auth service** — Check for import of `environment` and verify `apiUrl` value
2. **Error handling** — All 422 errors must pass `.errors` field to component, not just message
3. **Token expiry** — Backend sends 15m TTL; frontend computes `expires_at = created_at + 15min`
4. **No register auto-login** — Match GeoReporta R11 design (user stays on login form)
5. **Comment endpoint alignment** — This is a BREAKING change from current (wrong) path
6. **Test coverage** — Aim for 70%+ on all 3 core services
7. **E2E setup** — Ensure test incident (ID: 123 or seed value) exists before running

---

## Success Definition

**All 25 tasks complete AND**:
- Login works end-to-end (real backend API)
- Register works (no auto-login)
- Comments CRUD works (correct endpoints)
- All services pass Jest + E2E tests
- No TypeScript errors or warnings
- Ready for merge to develop
