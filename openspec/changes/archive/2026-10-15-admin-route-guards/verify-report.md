```yaml
change: front/2026-10-14-admin-route-guards
verifier: sdd-verify (claude-sonnet-4-6)
date: 2026-10-15
verdict: PASS WITH WARNINGS
role_double_conflict: >
  DECLARED: The spec, design, and tasks for this change were authored by the
  same agent instance running this verification. Per docs/agents/claude-qa.md
  §"Rol doble", independence is partial. All findings stand regardless — burden
  of proof for any challenged finding is on the author, not this report.
requirements_count: 5
scenarios_count: 22
criticals: 0
warnings: 4
suggestions: 1
```

---

## Role-Double Conflict Declaration

This change was designed and specified by the same agent running this verify.
The sub-agent read only the artifact files and the code — no prior reasoning or
intent was injected. Any finding that contradicts a design decision stands; the
author defends with argument or corrects. See `docs/agents/claude-qa.md` §3.

---

## Gates Executed

| Gate | Command | Exit | Result |
|------|---------|------|--------|
| Unit tests (focused) | `npx jest --testPathPatterns="app.routes\|permission.guard" --no-coverage` | 0 | 32 passed / 0 failed (6 suites) |
| Unit tests (full suite) | `npx jest --no-coverage` | 0 | 946 passed / 0 failed (105 suites) |
| Frontend build | `npx ng build` | 0 | Bundle generation complete (2 pre-existing NG8113 warnings, unrelated to this change) |
| Migration files | Filesystem check for `0070_system_config_permission.sql` | N/A | **FILE DOES NOT EXIST** — see WARNING-1 |
| Migration DB run | Docker container — could not execute, Docker not running | BLOCKED | See WARNING-2 |
| Backend typecheck | Not in scope — no backend files touched | SKIP | — |

---

## Spec Compliance Matrix

### Requirement: Admin List Routes MUST enforce permissionGuard

| Scenario | Status | Evidence |
|----------|--------|----------|
| Authorized role accesses users list | PASS (structural) | `app.routes.spec.ts` line 45-51: `usersListRoute.canActivate` contains `permissionGuard`, `data.permission === 'READ users'`; test passes |
| Unauthorized role redirected from users list | PASS (structural) | Guard logic verified in `permission.guard.ts` lines 26-43: missing permission → `router.navigate(['/app/dashboard'])`; covered by `permission.guard.spec.ts` |
| Authorized role accesses roles list | PASS (structural) | `app.routes.spec.ts` line 57-66: `rolesRoute.canActivate` contains `permissionGuard`, `data.permission === 'READ roles'`; test passes |
| Unauthorized role redirected from roles list | PASS (structural) | Same guard logic covers all routes |
| Authorized role accesses departments list | PASS (structural) | `app.routes.spec.ts` line 84-97: `deptListRoute.canActivate` contains `permissionGuard`, `data.permission === 'READ departments'`; test passes |
| Unauthorized role redirected from departments list | PASS (structural) | Guard logic applies |
| Authorized role accesses organizations list | PASS (structural) | `app.routes.spec.ts` line 100-113: `orgListRoute.canActivate` contains `permissionGuard`, `data.permission === 'READ organizations'`; test passes |
| Unauthorized role redirected from organizations list | PASS (structural) | Guard logic applies |
| Authorized role accesses audit log list | WARNING | `audit-logs` route has guard (`app.routes.ts` lines 193-200, `permission: 'READ audit-logs'`). However this was pre-existing and not covered by the 10 new tests. Route path is `audit-logs` not `auditoria`. Spec's route table lists `/app/admin/auditoria` — **path discrepancy** (see WARNING-3) |
| Unauthorized role redirected from audit log list | WARNING | Same path discrepancy as above |
| Authorized role accesses geo-zones list | UNTESTED | No `admin/geo-zonas` route exists in `app.routes.ts`. The spec lists this route but neither proposal, design, nor tasks include it. Out-of-scope omission. |
| Unauthorized role redirected from geo-zones list | UNTESTED | Same: route does not exist |

### Requirement: Broken /admin/config guard MUST be fixed

| Scenario | Status | Evidence |
|----------|--------|----------|
| operador_sistema accesses config page after fix | PASS (structural) | `app.routes.spec.ts` line 72-82: `configRoute.canActivate` contains `permissionGuard`, `data.permission === 'READ system-config'`; test passes. `agent_system` (current name of operador_sistema) holds `READ system-config` in `0009` |
| reporter is blocked from config page after fix | PASS (structural) | Guard denies when `user.permissions` does not include `READ system-config`; reporter role has no such permission per `0009` |
| config page was previously bypassed (pre-fix state) | PASS | Design D5 correctly identifies the root cause: `permission.guard.ts` line 28-29 returns `true` when `requiredPermission` is undefined. The fix adds `permission: 'READ system-config'` to the data object, resolving the bypass |

### Requirement: READ system-config permission MUST exist in the catalog

| Scenario | Status | Evidence |
|----------|--------|----------|
| master holds READ system-config after migration | PASS (via 0009) | `0009_roles_permissions.sql` line 131: `admin_sistema` (renamed to `master` by `0023`) has `"READ system-config"` in its permissions jsonb |
| operador_sistema holds READ system-config after migration | PASS (via 0009) | `0009_roles_permissions.sql` line 147: `agent_system` (renamed from `operador_sistema`) has `"READ system-config"` |
| reporter does NOT hold READ system-config | PASS (via 0009) | `reporter` role permissions at line 104-108 of `0009`: no `READ system-config` |
| migration rolls back cleanly | WARNING | Standalone `0070_system_config_permission.sql` and its `.DOWN.sql` were never created. Permission is embedded in the consolidated `0009` migration (2026-10-14 Group A consolidation). Tasks 1.1 and 1.2 are marked `[x]` but no files exist at expected paths. See WARNING-1 |

### Requirement: READ organizations permission MUST exist in the catalog

| Scenario | Status | Evidence |
|----------|--------|----------|
| master holds READ organizations after migration | PASS | `0009` line 122: `admin_sistema` has `"READ organizations"`. `0015` also independently grants it |
| admin_org holds READ organizations after migration | PASS | `0009` line 161: `admin_organizacion` has `"READ organizations"`. `0015` grants it too |
| reporter does NOT hold READ organizations | PASS | reporter role has no `READ organizations` |
| migration rolls back cleanly | N/A | This permission pre-exists in 0015. The design (D3) correctly identified it as already present — no new migration needed. No rollback required |

### Requirement: reporter MUST NOT reach any admin route

| Scenario | Status | Evidence |
|----------|--------|----------|
| reporter cannot access any admin route via direct URL | PASS (partial) | 5 of the 8 routes listed in the spec have structural test coverage. Routes `auditoria`, `geo-zonas`, `reportes` not covered (last two don't exist; `auditoria` path discrepancy) |
| no redirect loop for reporter | PASS | Guard redirects to `/app/dashboard` (line 43 of `permission.guard.ts`). Dashboard route exists and is accessible without a permission guard |

### Requirement: No guard changes for master role access

| Scenario | Status | Evidence |
|----------|--------|----------|
| master accesses all guarded admin routes without redirect | PASS (structural) | `master` holds all 5 permissions verified in spec. Guard's fast path (`current !== null`) decides synchronously |

---

## Task Completion

| Task | Status | Notes |
|------|--------|-------|
| 1.1 Create `0070_system_config_permission.sql` | CLAIMED `[x]` / ACTUALLY INCOMPLETE | File not found at `database/migrations/0070_system_config_permission.sql` or anywhere in repo. Permission was absorbed into `0009` consolidation instead. |
| 1.2 Create `0070_system_config_permission.DOWN.sql` | CLAIMED `[x]` / ACTUALLY INCOMPLETE | Same — no file at `database/rollback/0070_system_config_permission.DOWN.sql` |
| 1.3 Verify migration applies/rolls back | `[ ]` | Correctly marked incomplete (manual) |
| 2.1 Guard + data on admin/users list | `[x]` | Confirmed in code and tests |
| 2.2 Guard + data on admin/roles list | `[x]` | Confirmed in code and tests |
| 2.3 Fix admin/config data.permission | `[x]` | Confirmed in code and tests |
| 2.4 Guard + data on admin/departamentos list | `[x]` | Confirmed in code and tests |
| 2.5 Guard + data on admin/organizaciones list | `[x]` | Confirmed in code and tests |
| 3.1–3.6 Manual browser verification | `[ ]` | Correctly marked incomplete |

---

## Issues

### WARNING-1: Tasks 1.1/1.2 marked complete but standalone migration files do not exist

**Severity**: WARNING

**What happened**: The design (D4) specifies `database/migrations/0070_system_config_permission.sql` and `database/rollback/0070_system_config_permission.DOWN.sql`. The apply-progress marks both as `[x]`. Neither file exists. The `READ system-config` permission was instead absorbed into the 2026-10-14 Group A consolidation of `0009_roles_permissions.sql` (commit `1bbccfec3`, comment: `fused catalog gaps from ... 0070_system_config_permission`).

**Why it matters**: The tasks document a contract with downstream readers of the migration log. Marking incomplete items as complete breaks auditability. The migration _works_ (the permission is in 0009), but the standalone deliverable was not produced. The `.DOWN.sql` file for 0070 also cannot exist, so the rollback path for this specific permission change has no standalone artifact.

**Functional impact**: None at runtime — the permission exists. The MIGRATION_LOG.md should reflect that 0070 was consolidated rather than created standalone.

**Recommendation**: Update `apply-progress.md` tasks 1.1/1.2 to note the consolidation rather than marking them as completed standalone files. Update `MIGRATION_LOG.md` to document that 0070 was absorbed into the 0009 consolidation.

---

### WARNING-2: Migration DB verification blocked — Docker not running

**Severity**: WARNING (per claude-qa.md Regla 3 — a check that cannot run is NOT non-blocking)

**What happened**: The migration UP/DOWN cycle (claude-qa.md Regla 2) could not be executed because Docker is not available in this environment. Since the standalone `0070_*.sql` files also don't exist, there is nothing new to verify migrationally anyway — but this should be noted as a gate that was not run.

**Functional impact**: Unknown. The permission data in `0009` was already in production before this change (per `1bbccfec3` which predates this branch). No new SQL was introduced by this change.

**Recommendation**: When Docker is available, verify that `0009` applies cleanly from scratch and that the `system-config` permission lands correctly with role and user denormalization.

---

### WARNING-3: Spec route table includes `/app/admin/auditoria` and `/app/admin/geo-zonas` not in scope

**Severity**: WARNING

**What happened**: The spec's requirement table (`spec.md` lines 30-38) lists 8 routes including `/app/admin/auditoria`, `/app/admin/geo-zonas`, and `/app/admin/reportes`. The proposal, design, and tasks explicitly scope this change to 5 routes. The `audit-logs` route already had its guard before this change (in route `audit-logs`, not `auditoria`). Routes for `geo-zonas` and `reportes` do not exist in `app.routes.ts` at all.

**Why it matters**: The spec document over-promises relative to the design and tasks. Future auditors reading the spec will see unguarded/missing routes as failures. The spec should accurately reflect what this change delivers, not a superset.

**Recommendation**: Narrow the spec's route table to the 5 routes actually addressed. Add a note that `audit-logs` was already guarded before this change. Explicitly list the 3 omitted routes as out-of-scope.

---

### WARNING-4: Spec authorized-roles table for READ roles does not match DB

**Severity**: WARNING

**What happened**: `spec.md` line 32 states that `/app/admin/roles` with `READ roles` is authorized for `master, operador_sistema` only. However `0009_roles_permissions.sql` line 159 grants `READ roles` to `admin_organizacion` (renamed `admin_org`). An `admin_org` user can access `/app/admin/roles` in the current system even though the spec does not list them as authorized.

**Why it matters**: The spec is the contract. If `admin_org` seeing the roles list is intentional (the DB was designed that way), the spec should say so. If it is not intentional, the DB grant needs removal.

**Recommendation**: Reconcile the spec with the DB: either document `admin_org` as an authorized role, or create a separate change to revoke the grant.

---

### SUGGESTION-1: Add integration-level test for the reporter → redirect scenario

**Severity**: SUGGESTION

**What**: The 10 structural tests verify route metadata (canActivate, data.permission) but do not exercise the live guard logic — they don't create a user, inject AuthService, or verify the actual redirect. A Playwright or TestBed integration test covering `reporter → /app/admin/users → redirect to /app/dashboard` would close the gap between "route declares the guard" and "guard actually redirects unauthorized users."

**Why**: The `permissionGuard` unit tests cover the guard logic in isolation; a test that wires both together (route + guard + AuthService) would prevent a regression where the guard is present but misconfigured.

---

## Design Coherence

| Decision | Code | Status |
|----------|------|--------|
| D1: Per-route guard pattern | All 5 routes use per-route `canActivate: [permissionGuard]` | MATCHES |
| D2: Permission strings per route | All 5 strings match the design table | MATCHES |
| D3: Only one migration needed | No `READ organizations` migration created — confirmed pre-existing | MATCHES |
| D4: Migration 0070 filename | No standalone file created — backported to 0009 | DEVIATES (see WARNING-1) |
| D5: Config route fix mechanism | `data.permission: 'READ system-config'` added to existing data object | MATCHES |

---

## Verdict: PASS WITH WARNINGS

The frontend route guard implementation is complete and correct. All 946 tests pass. The build succeeds. The 5 target routes now enforce `permissionGuard` with correct `data.permission` strings. The `READ system-config` permission exists in the DB catalog and is correctly granted to `master` and `agent_system` (operador_sistema).

Four warnings prevent a clean PASS:
1. Tasks 1.1/1.2 are marked complete but the standalone migration files were never created (absorbed into 0009 consolidation).
2. Docker-based migration verification was not run.
3. The spec over-promises (lists routes not in scope).
4. The spec's authorized-roles table for `READ roles` does not match the DB grants.

No functional defects were found. The security vulnerability (authenticated users reaching admin pages without permission) is closed for all 5 target routes.
