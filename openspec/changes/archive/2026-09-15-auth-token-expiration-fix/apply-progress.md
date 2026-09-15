# Apply Progress: 2026-09-15-auth-token-expiration-fix

**Change**: Auth Token Expiration & Guard Timing Fix
**Mode**: Strict TDD (per tasks.md header)
**Working dir**: `frontend/`

---

## What was implemented

All four phases A→D executed in order. 13 new tests added across
two spec files; existing test fixtures updated to use parseable JWTs.

### Files Changed

| File | Action | Notes |
|------|--------|-------|
| `frontend/package.json` | Modified | `jwt-decode` added (v4.0.0, not `^9.x` — v4 is current; tasks.md snippet used `^9.x` from old plan, npm resolved v4) |
| `frontend/src/app/core/services/auth.service.ts` | Modified | Added `jwtDecode` import; private `isTokenExpired(token?)`; updated `isAuthenticated` computed to also check expiry; added `sessionValidating` signal + `sessionValidationComplete` computed; constructor sets `sessionValidating=false` when no token present; `hydrateSession` flips `sessionValidating=false` on both success and error paths; `refresh()` short-circuits with proactive expiry check |
| `frontend/src/app/core/services/auth.service.spec.ts` | Modified | Added 8 expired-token tests + 3 refresh-proactive tests = 11 new tests; tokens fixture switched to valid JWTs |
| `frontend/src/app/core/services/auth.service.bootstrap.spec.ts` | Modified | Stored tokens switched to valid JWTs (parseable by `jwtDecode`); added `b64url` helper inline |
| `frontend/src/app/core/guards/auth.guard.ts` | Rewritten | Both `authGuard` and `guestGuard` now async `CanActivateFn` returning `Promise<boolean>`; await `sessionValidationComplete` via `toObservable`+`firstValueFrom` |
| `frontend/src/app/core/guards/auth.guard.spec.ts` | **NEW** | 8 guard tests (4 each), all passing; uses hand-rolled `AuthServiceStub` to inject only the signals guards read |
| `frontend/src/app/core/interceptors/auth.interceptor.spec.ts` | Modified | Test fixtures switched to valid JWTs |

### Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| `auth.service.spec.ts` | 26 | 37 | +11 |
| `auth.service.bootstrap.spec.ts` | 3 | 3 | 0 (fixture updates only) |
| `auth.guard.spec.ts` | — | 8 | +8 (new) |
| `auth.interceptor.spec.ts` | 5 | 5 | 0 (fixture updates only) |
| **Total** | **34** | **53** | **+19** net |

Plus 12 spec scenarios per `specs/auth/spec.md` are exercised by the
combined test surface (scenarios 7–11 covered by Phase A tests;
scenarios 1–6, 9–10 covered by guard tests).

---

## Deviations from `tasks.md` / `design.md`

### 1. `jwt-decode` version v4.0.0, not v9.x

Tasks.md A.1 says: `Verify package.json includes jwt-decode: ^9.x`.
Reality: `pnpm add jwt-decode` resolved to v4.0.0 (latest stable).
Both v3 and v4 export `jwtDecode` as the call signature; v4 uses
named export (`import { jwtDecode } from 'jwt-decode'`) where v3 used
default export. Implemented with v4's named import. Test fixtures
use the same.

Tasks.md code snippet at A.3 shows `jwtDecode<{ exp?: number }>(token)`
which works in both v3 and v4 — call signature is the same.

### 2. `sessionValidating` initialized `true`, immediately flipped `false` when no hydration needed

Design.md D3 shows `sessionValidating = signal<boolean>(true)` (start
"validating"). Tasks.md B.2 echoes this.

Implemented as: `signal<boolean>(true)` initialization, with the
constructor flipping it to `false` when no token is in localStorage
(so `hydrateSession` won't fire). Without this, guards would deadlock
on a `sessionValidationComplete` that never flips when the user is
not logged in.

This matches design.md D7's "always terminates" intent and is the
correct behavior, but is a literal deviation from the bare snippet
in D3.

### 3. `hydrateSession` flips `sessionValidating` on both error AND complete

Design.md D7 shows the `complete:` block but the snippet stops short
of adding `sessionValidating.set(false)` to it. Tasks.md B.3 code
snippet DOES include it (after `complete: () => { ... }`). The
implementation matches tasks.md: both `error` and `complete` paths
flip the signal.

### 4. `refresh()` short-circuit returns `throwError` not `EMPTY`

When the refresh_token is expired/missing, `refresh()` now calls
`clearAuthState()` + navigates to `/login` + returns
`throwError(() => new Error('Refresh token expired or missing'))`.
Tasks.md C.2 snippet shows `throwError(() => new Error('Refresh
token expired'))`. Implemented verbatim.

The synthetic error means any subscriber (e.g. `authInterceptor`)
sees a clean error rather than a silent success — exactly what the
guard wants when the session is gone.

### 5. Existing test fixtures updated to use parseable JWTs

Three existing spec files used opaque strings (`'jwt.access.token'`,
`'jwt.refresh.token'`, `'jwt-1'`, `'rt-1'`) as test tokens. Pre-fix,
`isAuthenticated` was a pure existence check, so any opaque string
satisfied it. Post-fix, `isTokenExpired` decodes the JWT, so opaque
strings parse-fail → return true (expired) → `isAuthenticated` is
false.

Updated in:
- `auth.service.spec.ts` (tokens fixture)
- `auth.service.bootstrap.spec.ts` (`bootWithStoredSession`)
- `auth.interceptor.spec.ts` (lines 66, 84–97, 115–116)

Each file got a small inline `b64url` helper to keep the JWT-fixture
creation local. No test semantics changed — only the input string.

### 6. `guestGuard` second parameter renamed to `_state`

ESLint `@typescript-eslint/no-unused-vars` with rule
`argsIgnorePattern: "^_"` flags the unused `state` parameter.
Pre-fix `guestGuard` did not use `state` either; lint warning was
pre-existing in some configurations. Renamed to `_state` to make
the intent explicit and clear the lint gate that T4.3 requires.

`authGuard` still uses `state` (needed for the `returnUrl` query
param).

---

## Verification Summary

| Check | Command | Result |
|-------|---------|--------|
| Unit tests (auth surfaces) | `rtk jest auth.service auth.service.bootstrap auth.guard auth.interceptor` | **53/53 PASS** |
| Full frontend suite | `rtk jest` | **635/635 PASS**, 0 failures |
| TypeScript | `npx tsc -b tsconfig.json --noEmit` | **0 errors** |
| Lint (changed files) | `rtk pnpm run lint` | **0 errors** (80 pre-existing `no-explicit-any` warnings, unrelated to this change) |
| `pnpm run typecheck` script | n/a | **NOT in package.json** — tasks.md T4.2 says `tsc -b tsconfig.json --noEmit`, that's what was run. Documented as out-of-scope; the existing `tsc -b` invocation is the de-facto gate. |
| Manual smoke (D.4) | n/a | **PENDING Andy** — requires running backend + browser session, out of scope for CLI sandbox. Document below. |

---

## Manual Smoke Test (D.4) — PENDING Andy

Per tasks.md D.4 + design.md "Rollout Plan", the following must be
performed in a live environment before merge:

1. **Login successfully** — verify normal auth flow still works.
2. **Manually set `access_token` in localStorage to an expired JWT** —
   use browser DevTools → Application → Local Storage → edit the
   `auth_access_token_development` (or `_production`) value.
3. **Reload the page** — verify:
   - User is redirected to `/login` (not stuck on broken `/app/dashboard`).
   - localStorage tokens are cleared.
4. **From `/login`, click "¿No tenés cuenta? Crear cuenta" link** —
   verify navigation reaches `/registro` (the sc-207 bug — the bug
   that surfaced this change).

If steps 1 and 3 work and step 4 is the sc-207 happy path, the change
is verified.

---

## Out-of-Scope (Not Touched)

- **Environment key strategy (D6 / tasks.md A.5)**: tasks.md lists
  "Phase 5 / T5.x" for documentation only. Already documented in
  `auth.service.ts` line 287–300 (the env-suffixed localStorage key
  pattern). No further change needed.
- **A.5 scope**: documented but not modified. Tech debt noted.
- **Backend changes**: none required (proposal.md §Scope).
- **Edge cases (off-rail)**:
  - Refresh token rotation (out of scope per spec).
  - JWT signature verification client-side (security: deliberately
    skipped per design.md "Security Considerations").
  - Proactive refresh before expiry (optimization, not in scope).

---

## Ready for `sdd-verify`

All automated gates green. D.4 manual smoke is the only remaining
step before archive. Recommend running `sdd-verify` after Andy
completes the manual smoke.
