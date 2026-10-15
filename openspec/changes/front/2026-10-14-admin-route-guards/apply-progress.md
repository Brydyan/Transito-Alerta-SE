# Apply Progress: Admin Route Guard Gap

**Change**: `front/2026-10-14-admin-route-guards`
**Mode**: Strict TDD

## Completed Tasks

- [x] 1.1 Created `database/migrations/0070_system_config_permission.sql`
- [x] 1.2 Created `database/rollback/0070_system_config_permission.DOWN.sql`
- [ ] 1.3 Verify migration applies/rolls back cleanly on test DB (manual — out of scope for apply phase)
- [x] 2.1 Added `canActivate: [permissionGuard]` + `data.permission: 'READ users'` to `admin/users` list (`path: ''`)
- [x] 2.2 Added `canActivate: [permissionGuard]` + `data.permission: 'READ roles'` to `admin/roles` list
- [x] 2.3 Fixed `admin/config` route: added `permission: 'READ system-config'` to its existing `data` object
- [x] 2.4 Added `canActivate: [permissionGuard]` + `data.permission: 'READ departments'` to `admin/departamentos` list (`path: ''`)
- [x] 2.5 Added `canActivate: [permissionGuard]` + `data.permission: 'READ organizations'` to `admin/organizaciones` list (`path: ''`)
- [ ] 3.1–3.6 Manual browser verification (out of scope for apply phase)

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `frontend/src/app/app.routes.ts` | Modified | Added `canActivate: [permissionGuard]` + `data.permission` to 4 list routes; added `permission: 'READ system-config'` to config route `data` |
| `frontend/src/app/app.routes.spec.ts` | Created | TDD spec — 10 structural assertions covering all 5 route changes |
| `frontend/src/app/app.routes.new-user-form.spec.ts` | Modified | Fixed fragile regex (pre-existing failure) that broke when `canActivate: [...]` was added to the `path: ''` child; replaced with bracket-counting extraction |
| `database/migrations/0070_system_config_permission.sql` | Created | `READ system-config` catalog row + grants to `master` and `operador_sistema` |
| `database/rollback/0070_system_config_permission.DOWN.sql` | Created | Symmetric rollback — removes UUID from role arrays, bumps version, soft-deletes catalog row |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `app.routes.spec.ts` | Unit (structural) | ✅ 11/11 (permission.guard) | ✅ Written (9 failing) | ✅ 10/10 passed | ➖ Triangulation skipped: purely structural metadata — one possible value per route, no branching logic | ➖ None needed |
| 2.2 | `app.routes.spec.ts` | Unit (structural) | ✅ same baseline | ✅ Written | ✅ Passed | ➖ Same reason | ➖ None needed |
| 2.3 | `app.routes.spec.ts` | Unit (structural) | ✅ same baseline | ✅ Written (was 1 passing already — guard present, missing data) | ✅ Passed after fix | ➖ Same reason | ➖ None needed |
| 2.4 | `app.routes.spec.ts` | Unit (structural) | ✅ same baseline | ✅ Written | ✅ Passed | ➖ Same reason | ➖ None needed |
| 2.5 | `app.routes.spec.ts` | Unit (structural) | ✅ same baseline | ✅ Written | ✅ Passed | ➖ Same reason | ➖ None needed |
| 1.1 | N/A — SQL file | N/A | N/A (new file) | N/A | N/A | N/A | N/A |
| 1.2 | N/A — SQL file | N/A | N/A (new file) | N/A | N/A | N/A | N/A |

### Test Summary
- **Total tests written**: 10 (in `app.routes.spec.ts`)
- **Total tests passing**: 32 (10 new + 11 permission.guard + 5 new-user-form + 6 audit-logs)
- **Layers used**: Unit/structural (10)
- **Approval tests**: 0 — no refactoring of logic
- **Pure functions created**: 0 — declarative config only

## Work Unit Evidence

| Evidence | Result |
|----------|--------|
| Focused test command and result | `npx jest --testPathPatterns='app.routes\|permission.guard' --no-coverage` → 32 passed / 0 failed (6 suites) |
| Runtime harness | N/A — declarative route config; no runtime boundary changed. Guard logic (`permission.guard.ts`) is unchanged. |
| Rollback boundary | `git revert frontend/src/app/app.routes.ts`; run `database/rollback/0070_system_config_permission.DOWN.sql` on DB |

## Deviations from Design

1. **Pre-existing test fixed**: `app.routes.new-user-form.spec.ts` contained a fragile regex that matched only the first `]` after `children: [`. Adding `canActivate: [permissionGuard]` to the `path: ''` child put a `]` inside the children block, truncating the regex match. Fixed the extraction using bracket-counting instead. This was a latent defect (the test also failed on base with a babel parse error). The fix preserves all 5 original test assertions — only the extraction mechanism changed.

2. **Task 2.1 note**: The prompt spec asked to also add guards to `users/new` and `users/:id/edit`. The design (D2) and tasks.md only assign guards to the list routes. The prompt's Phase 2 description mentions those but tasks.md items 2.1–2.5 only cover list routes. Followed tasks.md strictly — no guards added to `new` or `:id/edit` under `users`.

3. **Tasks 1.3 and 3.x**: These are manual verification tasks requiring a live database and browser. They are out of scope for the apply phase and remain `[ ]`.
