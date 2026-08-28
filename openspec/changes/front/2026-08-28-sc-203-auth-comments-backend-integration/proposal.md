# Proposal: Frontend Auth & Comments Backend Integration

**Change**: `2026-08-28-sc-203-auth-comments-backend-integration`  
**Category**: Frontend (Angular 17 PWA)  
**Priority**: P0 (blocks all authenticated flows)  
**Requester**: Andy (caveman mode analysis)  
**Created**: 2026-08-28

---

## Problem

Frontend scaffolded 92% but **only 30% connected to backend**:

1. **Auth flow MOCKED** — `login()` uses `of().delay(1500)` instead of real `POST /auth/login`
2. **Register endpoint missing** — no `register()` implementation  
3. **Comment endpoints misaligned** — frontend calls `/incidents/:id/comments` but backend expects `/comments` and `/comments/incident/:id`
4. **No actual HTTP calls tested** — auth/comments never hit real NestJS API

**Impact**: 
- Citizens can't log in (mock only)
- No real token flow to backend
- Comment CRUD calls wrong endpoints
- Offline sync has no real data source

---

## Solution

Enable real backend connectivity for auth + comments by:

1. **Auth service** — Uncomment real login, add register, fix token lifecycle
2. **Comment service** — Fix endpoint paths to match backend reality
3. **Auth interceptor** — Verify JWT injection works end-to-end
4. **E2E tests** — Validate auth + comment flows against real API

---

## Scope

### In Scope
- ✅ Uncomment real auth login in `auth.service.ts`
- ✅ Implement register flow (no auto-login per legacy design)
- ✅ Fix comment service endpoints
- ✅ Add comment image upload stubs
- ✅ Test auth token refresh
- ✅ Jest unit tests for all 3 services
- ✅ E2E smoke tests (login → incidents → create comment)

### Out of Scope (next priority)
- ❌ Image upload implementation (Priority 2)
- ❌ Incident claim/release workflow (Priority 2)
- ❌ Map integration (Priority 3)
- ❌ Charts/stats dashboard (Priority 3)

---

## Backend Contracts (Ready)

**Auth endpoints** (NestJS, stable):
- `POST /auth/login` — `{ email?, password?, device_uuid? }` → `{ access_token, refresh_token?, user }`
- `POST /auth/register` — `{ email, password, device_uuid }` → `{ id, email, message }`
- `POST /auth/refresh` — refresh token exchange
- `GET /auth/me` — fetch current user + permissions
- `POST /auth/logout` — revoke session

**Comment endpoints** (NestJS, stable):
- `GET /comments/incident/:incidentId` — fetch comments for incident
- `POST /comments` — create comment (body: `{ incident_id, text, author_id }`)
- `PATCH /comments/:id` — update comment
- `POST /comments/:id/images` — upload comment image

---

## Acceptance Criteria

- [ ] Login flow calls real `POST /auth/login` (not mock)
- [ ] Register flow rejects invalid input, success shows message
- [ ] Auth tokens persisted in localStorage + cookie (if server sends)
- [ ] Comment service calls correct endpoints
- [ ] Comment image stubs integrated (no actual upload yet)
- [ ] Auth interceptor injects JWT on all calls
- [ ] Token refresh works after expiry
- [ ] All services 70%+ test coverage (Jest)
- [ ] E2E smoke test: login → list incidents → add comment (Playwright)
- [ ] No CORS errors in browser console
- [ ] No `any` types in services (TypeScript strict)

---

## Timeline

- **Design**: 30 min (D1)
- **Auth impl**: 2h (T1-T2)
- **Comments impl**: 1h (T3-T4)
- **Tests**: 1.5h (T5-T6)
- **E2E**: 1h (T7)
- **Total**: ~6h of Minimax work

---

## Dependencies

- ✅ Backend API (NestJS, 21 modules) — DONE
- ✅ Database migrations (42) — DONE
- ✅ Angular 17 scaffolding — DONE
- ⏳ This change (proposal) — WIP

**Blocked by**: Nothing. Can start immediately.

---

## Known Risks

1. **Token expiry** — refresh flow may not survive ~15m inactivity
2. **CORS** — if backend not configured for localhost:4200
3. **Offline queue** — sync service may replay old comment creates
4. **Type mismatch** — if backend API changed since design (mitigated by e2e tests)

**Mitigations**:
- E2E tests catch CORS + type mismatches immediately
- Implement refresh token retry in interceptor
- Offline sync service checks for duplicates before replay

---

## Related Changes

- `2026-08-26-t8-database-cutover` — DB ops ✅
- `2026-08-26-t7-geography-organizations-seed` — DB data ✅
- (This) SC-203 — Frontend auth + comments
- (Pending) Priority 2 — Images, claim/release, profile
- (Pending) Priority 3 — Map, charts, offline-first UX

---

## Decision Log

- **2026-08-28**: Proposal created. No register auto-login (matches legacy design R11).
- **2026-08-28**: Comment endpoints realigned to backend `/comments` path (not nested).
