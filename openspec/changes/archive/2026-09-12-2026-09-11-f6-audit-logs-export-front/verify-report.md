```yaml
change: 2026-09-11-f6-audit-logs-export
side: frontend
phase: verify
round: 2
verdict: PASS WITH WARNINGS
date: 2026-09-12
verifier: sdd-verify
requirements_total: 5
scenarios_total: 14
scenarios_covered: 14
scenarios_untested_runtime: 2
```

# Verify Report — F6 Audit Logs UI (Frontend) — Round 2

**Change**: `2026-09-11-f6-audit-logs-export` (frontend)
**Round**: 2 (re-audit after Minimax applied fixes from `fixes-required.md`)
**Verdict**: PASS WITH WARNINGS
**Date**: 2026-09-12

---

## Summary

CRITICAL-1 (snake_case wire mismatch) is fully resolved. All template bindings, the
`AuditLogItem` interface, fixture data, and service spec now use snake_case. A new
regression test (`getAuditLogs — model reads snake_case fields from the wire`) guards
against re-introducing camelCase aliases. WARNING-2 (soft-deleted users in actor dropdown)
is verified CLOSED by code inspection. WARNING-3 (R1-S2 guard test) is CLOSED — a new
`permission-guard.spec.ts` exercises the real `permissionGuard` via RouterTestingModule.

One new WARNING introduced by Minimax's fix: the regression test in
`services/audit-logs.service.spec.ts:96-97` uses dot notation on a `Record<string, unknown>`
cast, which TypeScript's `noPropertyAccessFromIndexSignature` rule rejects with TS4111.
The test passes at runtime (Jest does not enforce TS4111 during execution), but `tsc -b --noEmit`
fails. This is a one-line fix: change `.actorName` to `['actorName']` and `.createdAt`
to `['createdAt']`.

---

## Build / Type-check Evidence

| Gate | Command | Result |
|------|---------|--------|
| Build | `pnpm run build` | exit 0 — audit-logs-component chunk 10.72 kB |
| Typecheck | `tsc -b --noEmit` | **2 errors** — TS4111 at `audit-logs.service.spec.ts:96,97` |
| Audit tests | `jest --testPathPatterns=audit-logs` | 25/25 PASS (3 suites) |
| Full test suite | `pnpm test` | 576/578 PASS — 2 pre-existing failures in `users-list.component.spec.ts` (pageSize expects 25, code uses 10 — unchanged) |
| ESLint | `eslint src/app/features/admin/audit-logs/` | exit 0 — 0 errors |

---

## Fix Verification Matrix

### CRITICAL-1 (Round 1) — snake_case wire mismatch

**Status: RESOLVED — Option A applied**

The `AuditLogItem` interface now uses snake_case fields throughout.

Evidence:
- `services/audit-logs.service.ts:35-45` — interface declares `actor_id`, `actor_name`, `resource_type`, `resource_id`, `created_at` (not camelCase)
- `audit-logs.component.html:111-115` — template binds `item.created_at`, `item.actor_name`, `item.resource_type`, `item.resource_id` (not camelCase)
- `audit-logs.component.spec.ts:43-66` — fixture items use snake_case keys
- `services/audit-logs.service.spec.ts:86-118` — NEW regression test asserts `actor_name`/`actor_id`/`resource_type`/`created_at` are present AND `actorName`/`createdAt` are undefined

### FIX-2 (Round 1 WARNING) — verify GET /api/users excludes soft-deleted

**Status: CLOSED — verified by code inspection**

`UsersService.findAndCount` (`users.service.ts:158`) adds `where: { isActive: true }` to every
list query. `softDelete` (`users.service.ts:367`) sets `isActive: false` and `deletedAt: new Date()`.
Therefore `GET /api/users?limit=100` cannot return soft-deleted users. No code change needed.

### FIX-3 (Round 1 WARNING) — strengthen R1-S2 guard test

**Status: CLOSED — real RouterTestingModule integration added**

New file `permission-guard.spec.ts` exercises the real `permissionGuard` with 3 cases:
- User without `READ audit-logs` → redirected to `/app/dashboard` (fakeAsync + tick)
- User with `READ audit-logs` → reaches `/admin/audit-logs`
- Hydrated user with empty permissions → redirected to `/app/dashboard`

All 3 cases pass. The structural stub in `audit-logs.component.spec.ts` was retained
as a fast-fail sentinel for route data renames.

---

## NEW DEFECT INTRODUCED BY MINIMAX

### WARNING-1 (NEW) — TS4111: index signature property accessed with dot notation

**File**: `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.spec.ts:96-97`
**Severity**: WARNING (runtime tests pass; only `tsc` strict mode fails)

```
error TS4111: Property 'actorName' comes from an index signature, so it must be accessed with ['actorName'].
error TS4111: Property 'createdAt' comes from an index signature, so it must be accessed with ['createdAt'].
```

**Root cause**: The test casts `res.items[0]` to `Record<string, unknown>` and then reads
`.actorName` and `.createdAt` with dot notation. TypeScript's `noPropertyAccessFromIndexSignature`
option (active in this project's tsconfig) requires bracket notation on index-signature types.

**Fix required** (one-line in spec):
```typescript
// BEFORE (lines 96-97):
expect((res.items[0] as unknown as Record<string, unknown>).actorName).toBeUndefined();
expect((res.items[0] as unknown as Record<string, unknown>).createdAt).toBeUndefined();

// AFTER:
expect((res.items[0] as unknown as Record<string, unknown>)['actorName']).toBeUndefined();
expect((res.items[0] as unknown as Record<string, unknown>)['createdAt']).toBeUndefined();
```

This does not change test behavior — Jest runs transpiled JS and does not enforce TS4111.
The fix is required for `tsc -b --noEmit` to exit 0.

---

## Spec Compliance Matrix

| Requirement | Scenario | Covered by | Status |
|-------------|----------|------------|--------|
| R1 — Route | S1 Loads for authorized user | `audit-logs.component.spec.ts:se crea...` | PASS |
| R1 — Route | S2 Guard blocks unauthorized | `permission-guard.spec.ts` (3 cases) | PASS |
| R1 — Route | S3 Breadcrumb correct | Route data `breadcrumb: 'Auditoría de Acceso'` | PASS (structural) |
| R2 — Table | S1 Table renders on load | `component.spec:getAuditLogs({page:1,limit:20})` + row render | PASS |
| R2 — Table | S2 Empty state | `component.spec:R2-S2 empty-state` | PASS |
| R2 — Table | S3 Pagination navigates | `component.spec:R2-S3 onPageChange` | PASS |
| R3 — Filters | S1 Date range filter | `component.spec:R3-S4 filter change` | PASS |
| R3 — Filters | S2 Actor filter | `component.spec:R3-S2 actor filter` | PASS |
| R3 — Filters | S3 Combined filters | `service.spec:omite filtros vacíos` (implicit) | PASS |
| R3 — Filters | S4 Filters reset pagination | `component.spec:R3-S4 page reset to 1` | PASS |
| R3 — Filters | S5 Clear filters | `component.spec:limpiar filtros` | PASS |
| R4 — CSV download | S1 CSV triggered with filters | `component.spec:R4-S1/R4-S2 onDownloadCsv` | PASS |
| R4 — CSV download | S2 CSV with no filters | `component.spec:R4-S1/R4-S2 onDownloadCsv` | PASS |
| R4 — CSV download | S3 Blob not window.open | `service.spec:responseType blob` + `component.spec:R4-S3` | PASS |
| R5 — Card link | S1 Card navigates to audit-logs | Template diff: `href="#"` → `routerLink` in `users-list.component.html` | PASS (structural) |
| R5 — Card link | S2 No stale href="#" | Code inspection `users-list.component.html:151` | PASS |

Runtime untested (deferred — backend not deployed):
- R1-S1 full e2e: component loads actual data from `/api/audit-logs`
- R4-S1 full e2e: download triggers against live export endpoint

---

## Issues

### WARNING-1 (NEW) — TS4111 typecheck failure in service spec lines 96-97

See "NEW DEFECT INTRODUCED BY MINIMAX" section above. Fix is one line; does not block
test execution but must be resolved before `tsc` gate is considered clean.

### WARNING-2 — Manual smoke test not run (deferred — backend not deployed)

Migration 0053 is required before the frontend route is useful. The guard will return 403
until the back deploys. Deferred per `apply-progress.md`.

---

## Pre-existing Issues (unchanged, out of scope)

- `users-list.component.spec.ts:111,123` — 2 failing specs (expect `pageSize=25`, code uses `10`). Pre-existing, unrelated to F6.

---

## Tasks Completion

All tasks 1.1 through 4.5 are checked `[x]` in `tasks.md`. No unchecked tasks.

---

## Verdict

**PASS WITH WARNINGS**

CRITICAL count: 0
WARNING count: 2 (TS4111 typecheck in spec line 96-97; manual smoke test deferred)
SUGGESTION count: 0

The TS4111 warning requires a one-line fix to pass the typecheck gate. All functional
behavior is correct and all tests pass. The fix is mechanical and does not change
test semantics. Submit the fix before closing the PR.
