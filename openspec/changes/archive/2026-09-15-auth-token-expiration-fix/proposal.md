---
change: 2026-09-15-auth-token-expiration-fix
capability: auth-token-validation
phase: pre-implementation
status: proposed
---

# Proposal: Auth Token Expiration & Guard Timing Fix

**Issue**: Expired JWT tokens in localStorage are treated as valid sessions, causing:
- Users stuck in `/app/dashboard` when trying to navigate to `/registro` (CreateAccount)
- `guestGuard` blocks navigation to guest routes (`/login`, `/registro`, `/verify-email`) based on stale tokens
- User confusion when tokens expire during inactivity

**Root Cause**: 
1. `isAuthenticated()` is a pure existence check (`!!accessToken()`) — no JWT expiry validation
2. `guestGuard` is synchronous and executes BEFORE `hydrateSession()` validates tokens server-side
3. No test coverage for expired-token scenarios

---

## Scope

### In Scope (This Change)
1. **Client-side JWT expiry validation** — decode access_token's `exp` claim and compare with `Date.now()`
2. **Guard timing fix** — make guards aware of token validity, not just existence
3. **Refresh token proactive expiry check** — decode refresh_token's `exp` before attempting refresh
4. **Test coverage** — add tests for expired token scenarios in auth.guard.spec.ts and auth.service.spec.ts
5. **Environment key consistency** — review and document localStorage key naming (production vs development)

### Out of Scope
- Backend token TTL changes (existing behavior is correct)
- Session revocation via blocklist (separate capability)
- OAuth2 / external authentication providers

---

## Affected User Flows

| Flow | Current Behavior | Expected Behavior |
|------|------------------|-------------------|
| Expired token in localStorage + click "Crear Cuenta" on /login | Redirects to /app/dashboard (fails) | Navigates to /registro |
| App reload with expired access_token | Shows broken /app/dashboard briefly | Clears session, redirects to /login |
| Expired refresh_token + interceptor 401 | Refresh attempt fails silently | Proactive check prevents failed refresh, clears session immediately |
| Run `ng serve` then `ng build --prod` | Tokens orphaned under different key | Tokens accessible regardless of build mode (if fix applied) |

---

## Implementation Strategy

**A1: Client-side JWT Expiry Decode (Required)**
- Add `jwtDecode` dependency (or implement minimal JWT parser)
- Create `isTokenExpired(token?: string): boolean` helper in AuthService
- Update `isAuthenticated` computed to check both existence AND non-expiry

**A2: Guard Async Awareness (Required)**
- Expose a `sessionValidated$: Observable<void>` or `sessionValidationComplete: signal<boolean>`
- Make `guestGuard` and `authGuard` async (return `Observable<boolean>` or `Promise<boolean>`)
- Guards wait for hydration to complete before deciding

**A3: Refresh Token Proactive Validation (Required)**
- Before `refresh()` HTTP call, decode refresh_token's `exp`
- If already expired client-side, skip HTTP and call `clearAuthState()` immediately

**A4: Test Coverage (Required)**
- Create `frontend/src/app/core/guards/auth.guard.spec.ts` with 8+ tests
- Add expired-token tests to `auth.service.spec.ts`
- Cover: expired access_token, expired refresh_token, both expired, valid token with valid refresh

**A5: Environment Key Review (Nice-to-have)**
- Document the current key pattern and versioning strategy
- Decide: keep env-dependent keys OR unify to single key
- If unifying, add migration logic to read from both old and new keys

---

## Success Criteria

- [x] User can navigate to `/registro` even with expired token in localStorage
- [x] `guestGuard` redirects only after confirming token invalidity (not just non-existence)
- [x] Expired refresh_token is detected client-side before HTTP call
- [x] `auth.guard.spec.ts` has 8+ tests, all passing (expired token scenarios covered)
- [x] No regressions in existing auth flows (login, logout, refresh)
- [x] TypeScript strict mode passes, no `any` types
- [x] E2E test suite (existing) all passing

---

## Estimated Effort

| Component | Hours |
|-----------|-------|
| A1 — JWT decode + isAuthenticated fix | 2h |
| A2 — Guard async refactor + timing fix | 3h |
| A3 — Refresh token proactive check | 1h |
| A4 — Test coverage (8+ tests) | 3h |
| A5 — Environment key review (optional) | 1h |
| **Total** | **~10h** (or 8h without A5) |

---

## Dependencies

- `jwtDecode` or minimal JWT parser (new dependency, ~2KB)
- No backend changes required
- No database migrations
- No RBAC permission changes

---

## Related Issues

- sc-207: RegisterComponent visibility depends on this fix
- Affects all user flows after inactivity (implicit dependencies)
- Not blocking any other changes but improves UX for all auth flows

---

## Next Steps

1. Approve this proposal
2. Create `spec.md` with requirements and scenarios
3. Create `design.md` with technical approach (JWT decode library choice, guard async pattern)
4. Create `tasks.md` with atomic checklist
5. Implement on new branch `feature/auth-token-expiration-fix`
6. Run `sdd-verify` against spec + design
7. Archive to `openspec/changes/archive/`
