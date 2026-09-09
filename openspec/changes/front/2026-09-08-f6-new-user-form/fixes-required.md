# Fixes Required — F6 (front) New User Form

> Companion to `verify-report.md` (FAIL verdict). Read that first for full context.

---

## Before you start

- Do NOT re-audit. The findings below were verified with real execution — re-running the test commands is for confirmation, not discovery.
- Most of the change is correct: 30/30 component tests pass, build is green, typecheck is green, lint has only the documented pre-existing dashboard error. The 3 fixes below are surgical; do not touch the rest.
- The critical fix (C-3) is **in the BACK change** (`back/2026-09-08-f6-new-user-form/`), not this one. It needs a new migration. Coordinate with the BACK `fixes-required.md` and do them together.

## Estado de los gates (after the fixes — what to expect)

| Gate | Before | After (expected) |
|---|---|---|
| `rtk pnpm test` | 547/551 (4 fail: 1 NEW + 3 pre-existing) | 551/551 (0 NEW) |
| `rtk pnpm run build` | exit 0 | exit 0 |
| `rtk pnpm run lint` | 1 error (pre-existing `dashboard.component.ts:11`) | unchanged |
| `npx tsc -b tsconfig.json --noEmit` | exit 0 | exit 0 |
| `rtk pnpm test:e2e` (local) | 33 pass / 44 skip | 33 pass / 44 skip (no change; e2e runs on CI) |
| Live: `POST /api/users` as master | 403 "Missing permission: CREATE users" | 201 with `phone` + `permissions` from role |

## Hallazgos

### C-1 (test broken by the orchestrator's own change)

**File**: `frontend/src/app/app.routes.new-user-form.spec.ts:63-64`

**Defect**: The test asserts the source file has the URL `['/app/admin/usuarios', 'new']` (Spanish, broken route) — but the orchestrator correctly changed the source to `['/app/admin/users', 'new']` (English, working route). The test now fails against the corrected source.

**Por qué importa**: This is a regression-guard test the orchestrator wrote specifically to prevent the original `nuevo`/`new` bug from coming back. By leaving the test in the broken state, the guard fires on the GOOD code, hiding future regressions of the original bug. Per `claude-qa.md` "Señal de alarma": "Un test que hubo que editar para que pase → cambió comportamiento, no presentación."

**Corrección** (1 line per assertion):

```diff
-    expect(usersListSrc).toMatch(/\['\/app\/admin\/usuarios',\s*'new'\]/);
-    expect(usersListSrc).not.toMatch(/\['\/app\/admin\/usuarios',\s*'nuevo'\]/);
+    expect(usersListSrc).toMatch(/\['\/app\/admin\/users',\s*'new'\]/);
+    expect(usersListSrc).not.toMatch(/\['\/app\/admin\/users',\s*'nuevo'\]/);
```

**Verify**: `rtk jest --testPathPatterns='app.routes.new-user-form'` should be `PASS (5) FAIL (0)`.

### C-2 (e2e assertions broken by the orchestrator's own change)

**File**: `frontend/e2e/new-user-form.e2e.ts:102, 131, 205`

**Defect**: 3 `toHaveURL` assertions still check the OLD Spanish `usuarios` route. The orchestrator updated `page.goto` URLs (5 of 5) but missed the `toHaveURL` regexes (3 of them). The component navigates to `/app/admin/users` (English), so these will FAIL on CI when `BASE_URL+E2E_PASSWORD` is set.

**Por qué importa**: Currently masked by `test.skip(!HAS_BACKEND)`, so the orchestrator's local test run was green. But these e2e specs are the integration-level verification of the F6 form's happy path (S2), error path (S3), and photo upload (S4) — and all 3 would fail in CI. This is exactly the kind of "green locally, red in CI" defect `claude-qa.md` "Lo que corre distinto en tu máquina que en CI" warns about.

**Corrección** (3 line replacements):

```diff
-    await expect(page).toHaveURL(/\/app\/admin\/usuarios$/);
+    await expect(page).toHaveURL(/\/app\/admin\/users$/);
```
(applies to lines 102, 131, 205)

```diff
-    await expect(page).toHaveURL(/\/app\/admin\/usuarios\/new$/);
+    await expect(page).toHaveURL(/\/app\/admin\/users\/new$/);
```
(applies to line 131 — both regexes, or one of them depending on the spec)

**Verify**: re-read each `toHaveURL` and confirm the regex matches the actual `router.navigate` target in `new-user-form.component.ts:378, 387, 399` (all are `['/app/admin/users']`).

### C-3 (F6 form non-functional at runtime — show-stopper)

**This fix is in the BACK change folder**, not this one. See `openspec/changes/back/2026-09-08-f6-new-user-form/fixes-required.md` for the full prescription. In short: new migration `0049_admin_user_permissions.sql` adding `(users, CREATE)` and `(users, DELETE)` to the catalog, granting them to `master` + `admin_org`, denormalizing to those users, bumping `permission_version`, and flushing `perm:v3:uid:*` in Redis (DB 1).

**For this FRONT change**: nothing to do. After the BACK fix lands, the front form's `POST /api/users` will start returning 201 instead of 403, and the e2e S2/S3/S4 specs will pass on CI. The frontend code does not need to change.

## Reparto

| Hallazgo | Quién | Esfuerzo |
|---|---|---|
| C-1 | `minimax-builder` (front) | 1 line, ~5 min |
| C-2 | `minimax-builder` (front) | 3 line replacements, ~5 min |
| C-3 | `minimax-builder` (back, in coordination with front) | New migration + spec update + Redis flush + new e2e, ~1-2 h |

## No toques

These are explicitly OUT of scope for the F6 fixes (they would re-introduce work that's already done or push into other phases):

| File / area | Why not now |
|---|---|
| `frontend/src/app/features/admin/users/_old_user-management/` | Pre-existing layout, not touched by F6 |
| `frontend/src/app/features/admin/users/services/users.service.ts:createUser` (the legacy `FormData` variant) | Kept for `UserFormComponent` (edit path) compat. Do not deprecate in this fix pass. |
| `frontend/src/app/features/admin/users/services/users.service.ts:144` (`getRoles()` type mismatch `rolId: number`) | Pre-existing bug, documented in `apply-progress.md §Finding 1`. Out of F6 scope. |
| `frontend/src/app/core/interceptors/error.interceptor.ts` | Orchestrator correctly chose to NOT change it (per the context provided). The fix for C-2 is in the service (`catchError(() => of([]))`). |
| `frontend/src/app/features/dashboard/dashboard.component.ts:11` (lint error) | Pre-existing, owned by `f6-redesign-existing-screens` archive. |
| `frontend/src/app/features/admin/users/users-list/users-list.component.spec.ts` (2 pre-existing failures) | Pre-existing, owned by `f6-usuarios-redesign` archive. Not in F6 scope. |
| `frontend/src/app/features/dashboard/dashboard.component.spec.ts` (1 pre-existing failure) | Pre-existing, owned by `f6-redesign-existing-screens` archive. Not in F6 scope. |
| `database/rollback/0043_incident_close_permission.DOWN.sql:35` (DOWN fails) | Pre-existing bug, owned by `t7-rollback-cycle`. Not in F6 scope. |

## Orden sugerido

De menor a mayor riesgo:

1. **C-1** (1 line, ~5 min, no risk) — fix and re-run `rtk jest --testPathPatterns='app.routes.new-user-form'`. Confirm `PASS (5) FAIL (0)`.
2. **C-2** (3 lines, ~5 min, no risk) — fix and re-read each `toHaveURL` against the navigate target. Confirm each regex matches the actual `router.navigate` call.
3. **C-3** (in BACK `fixes-required.md`, ~1-2 h) — this is the show-stopper. Coordinate with the BACK change. Re-run the full test suites (front and back) and the live `curl` integration test (B.4.5) after.
4. After all 3: re-verify this `verify-report.md` and the BACK `verify-report.md`. The expected new verdicts are: front = PASS (or PASS WITH WARNINGS if SUGGESTIONs are deferred), back = PASS (or PASS WITH WARNINGS).
