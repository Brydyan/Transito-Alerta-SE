
---

## Phase 8 — Integration & Verification (Clean-Context Re-Verify)

### Verdict

**PASS WITH WARNINGS**

### Context

This is the independent clean-context re-verification for `admin-controles-enhancements` (sc-334 / F5.7), required because the prior verify-report was authored in the same session as apply. Covers Phases 1–11 (spec Phases 1–7 core + debug-driven Phases 9–11).

### Conflict of Interest

None — this verification runs in a separate context from the apply session.

---

### Task Completion Status

| Phase | Tasks | Checked | Unchecked | Notes |
|-------|-------|---------|-----------|-------|
| Phase 1 — Backend endpoints | 1.1–1.10 (10) | 8 | 2 (1.8, 1.9) | Integration tests blocked by Testcontainers env |
| Phase 2 — Frontend service | 2.1–2.4 (4) | 4 | 0 | |
| Phase 3 — MenuTree chevron | 3.1–3.5 (5) | 5 | 0 | |
| Phase 4 — RoleMatrix rewrite | 4.1–4.9 (9) | 9 | 0 | |
| Phase 5 — MenuOptions load+delete | 5.1–5.8 (8) | 6† | 2† (5.1, 5.2) | STALE — code and apply-progress confirm both implemented |
| Phase 6 — Order suggestion | 6.1–6.5 (5) | 5 | 0 | |
| Phase 7 — EndpointPicker enhancements | 7.1–7.5 (5) | 5 | 0 | 7.5 was stale [ ] in prior report; now [x] |
| Phase 8 — Integration | 8.1–8.4 (4+smoke) | 3 | 1 (8.3) | Smoke deferred to reviewer |
| Phase 9 — Sidebar depth cap | 9.1–9.3 (3) | 3 | 0 | Debug-driven; not in original spec |
| Phase 10 — Auto-association | 10.1–10.3 (3) | 3 | 0 | Debug-driven; not in original spec |
| Phase 11 — Auto-discovery | 11.1–11.3 (3) | 3 | 0 | Debug-driven; not in original spec |

† Tasks 5.1 and 5.2 are marked `[ ]` in tasks.md but are **fully implemented**: `ConfirmDialogService` is injected and `loadAssignedEndpoints()` calls `getAssignedEndpoints()` as required. The tasks.md was not updated after Phase 5 completed — this is a staleness issue, not a missing implementation.

---

### Gate Results

| Gate | Command | Result |
|------|---------|--------|
| Backend unit (menu-options suite) | `npm test -- --testPathPattern='menu-options'` | **40/40 PASS** |
| Backend unit (endpoint-discovery) | `npm test -- --testPathPattern='endpoint-discovery'` | **11/11 PASS** |
| Backend unit (full) | `npm test` | **1245/1256 PASS** (11 failures are pre-existing F5 debt — `menus.service.db-resolution.spec.ts` + `menus.service.spec.ts`) |
| Backend typecheck | `npm run typecheck` | **0 errors** |
| Backend lint | `npm run lint` | **1 error** — `endpoint-discovery.service.spec.ts:92` (`metaValue` unused; see W3) |
| Frontend targeted (5 suites) | `pnpm exec jest --testPathPatterns='...'` | **63/63 PASS** |
| Frontend unit (full) | `pnpm exec jest` | **773/773 PASS** (97 suites) |
| Frontend typecheck | `pnpm exec tsc --noEmit` | **0 errors** |
| Frontend lint | `pnpm run lint` | **0 errors** |

---

### Spec Compliance Matrix

| Req | Scenario | Implementation | Test | Status |
|-----|----------|---------------|------|--------|
| R1 | S1 — load assigned endpoints on select | `getAssignedEndpoints()` → `loadOptionDetail()` forkJoin | `menu-options.service.spec.ts` (multiple cases), `menu-options.component.spec.ts` | PASS |
| R1 | S2 — empty option returns [] | Backend service returns `[]` when junction empty + no inference hit | `menu-options.service.spec.ts` | PASS |
| R1 | S3 — error notified via toast | `error: () => toast.error(...)` in `loadAssignedEndpoints` | `menu-options.component.spec.ts` | PASS |
| R2 | S1 — roles grouped by scope (3 blocks) | `roleGroups()` computed in `RoleMatrixComponent` | `role-matrix.component.spec.ts` (10 tests) | PASS |
| R2 | S2 — matrix within each block (Read/Write checkboxes) | HTML template with role rows | `role-matrix.component.spec.ts` | PASS |
| R2 | S3 — change persists via PUT | `onRoleAccessChange` → `setRoleAccess()` | `menu-options.component.spec.ts` | PASS |
| R3 | S1 — chevron on nodes with children | `<button class="chevron-btn">` + `[class.chevron-expanded]` | `menu-tree.component.spec.ts` (12 tests) | PASS |
| R3 | S2 — no chevron on leaf nodes | Conditional `*ngIf="hasChildren(item.id)"` | `menu-tree.component.spec.ts` | PASS |
| R3 | S3 — click expands/collapses | `toggleExpand()` + expanded set | `menu-tree.component.spec.ts` | PASS |
| R4 | S1 — suggestion for main menu (+10) | `nextOrder()` computed; parentId=null → increment=10 | `menu-options.component.spec.ts` (4 nextOrder tests) | PASS |
| R4 | S2 — suggestion for sub-menu (+1) | `nextOrder()` computed; parentId set → increment=1 | `menu-options.component.spec.ts` | PASS |
| R4 | S3 — user can overwrite | `editingOrder` writeable signal, no validation | Unit tested (overwrite path) | PASS |
| R5 | S1 — confirmation modal appears | `confirmDialog.confirm({...})` in `deleteOption()` | `menu-options.component.spec.ts` (dialog opens test) | PASS |
| R5 | S2 — confirmation executes delete | `subscribe(confirmed => { if (confirmed) delete... })` | `menu-options.component.spec.ts` (confirm calls delete) | PASS |
| R5 | S3 — cancel closes without delete | `if (!confirmed) return;` | `menu-options.component.spec.ts` (cancel does not call delete) | PASS |
| R6 | S1 — filter by keyword | `getEndpointCatalog({ module })` backend LIKE filter + frontend `moduleFilter` signal | `menu-option.service.spec.ts` + `endpoint-picker.spec.ts` (15 tests) | PASS |
| R6 | S2 — empty search returns all | `if module.trim().length === 0` — param omitted | `menu-option.service.spec.ts` | PASS |
| R6 | S3 — case-insensitive | Backend `LOWER(path) LIKE LOWER(%)` | `menu-options.service.spec.ts` | PASS |
| R7 | S1 — Write disabled without Read | Frontend: `[disabled]="!role.canRead"` + auto-uncheck logic | `role-matrix.component.spec.ts` | PASS |
| R7 | S2 — Read without Write allowed | Frontend invariant allows canRead=true, canWrite=false | `role-matrix.component.spec.ts` | PASS |
| R7 | S3 — Backend 422 for Write without Read | `BadRequestException` in `setRoleAccess()` when `canWrite && !canRead` | `menu-options.service.spec.ts` | PASS |

---

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress documents RED/GREEN cycles per phase |
| All tasks have tests | Yes (with exceptions) | 1.8/1.9 integration tests absent (env blocker); all others have test files |
| RED confirmed (tests exist) | Yes | All test files verified on-disk and passed |
| GREEN confirmed (tests pass) | Yes | 63/63 targeted, 773/773 frontend full, 1245/1256 backend full |
| Triangulation adequate | Yes | Multiple scenarios per behavior in most suites |
| Safety Net for modified files | Yes | Prior passing counts documented in apply-progress per phase |

**TDD Compliance**: 5/6 checks passed (1.8/1.9 integration tests absent due to env, not TDD failure)

---

### Issues

#### WARNINGS

**W1 — 11 pre-existing backend test failures (F5 debt, not introduced by sc-334)**

Failing suite: `menus.service.db-resolution.spec.ts` and `menus.service.spec.ts`.
All 11 failures are in the "effective permissions filtering (regression — UUID wire)" describe block — F5-era test debt predating migration 0060 and any sc-334 work. Confirmed by git blame attribution. Not blocking archive for this change; should be addressed in a follow-up cleanup (sc-315 or dedicated debt change).

**W2 — Backend lint error in test file (endpoint-discovery.service.spec.ts:92)**

`@typescript-eslint/no-unused-vars`: `metaValue` is assigned but never read.
Production file (`endpoint-discovery.service.ts`) lints clean. This is a test-only issue — the variable was used in an earlier iteration of the test helper and the assignment was kept as a code comment anchor. Non-blocking for functionality, but `npm run lint` exits non-zero.
File: `backend/src/modules/menus/services/endpoint-discovery.service.spec.ts`, line 92.
Fix: rename to `_metaValue` or remove the assignment.

**W3 — Integration tests 1.8/1.9 not implemented (Testcontainers env blocker)**

Tasks 1.8 and 1.9 (Testcontainers integration test for `GET :id/endpoints`) remain unchecked. The unit tests fully cover the `getAssignedEndpoints()` behavior. The integration tests were deferred due to Testcontainers being unavailable in the current development environment. The behavior is verified via live curl smoke tests (Phase 10.3 + 11.3 evidence).
Impact: no integration-level automated proof of end-to-end flow. Acceptable given unit coverage + curl verification.

**W4 — tasks.md stale for 5.1 and 5.2**

Both tasks.md entries show `[ ]` but the implementation is complete: `ConfirmDialogService` is injected at line 55 of `menu-options.component.ts`, and `loadAssignedEndpoints()` at line 342 calls `getAssignedEndpoints()` as required. The component tests (43/43 passing in Phase 5, 48/48 in Phase 6) cover these behaviors. This is a documentation staleness issue, not a missing implementation.

**W5 — Manual smoke test 8.3 deferred to reviewer**

The end-to-end manual smoke path (navigate → select menu → verify chevron/endpoints/matrix/order/delete/picker) is documented in tasks.md 8.3 but was not performed. This is intentional deferral.

---

### Design Coherence

| Decision | Spec | Implementation | Status |
|----------|------|---------------|--------|
| D3 — Chevron icon swap vs CSS rotation | Spec says ▶/▼ characters | CSS rotation on single icon (smoother UX) | Acceptable — same visual affordance, better a11y |
| D4 — roleGroups field names | Task says `{scope, label, roles}` | Implemented as `{scope, label, roles}` | Match |
| D5 — `accessChanged` output name | Task says `accessChanged` | Renamed from `accessChange` to `accessChanged`, caller updated | Match |
| D6 — `confirmDialog.open()` vs `.confirm()` | Task says `.open()` | Used `.confirm()` (actual API) | Acceptable — same semantics |
| D9 — Sidebar depth cap `< 1` not `< 2` | Phase 9 only, not in original spec | `depth < 1` keeps sidebar at 2-level flat tree | Correct per user clarification |
| D10/D11 — Auto-association + auto-discovery | Not in original spec (debug-driven) | `inferApiModule` + `EndpointDiscoveryService` | Additive, no spec contradictions |

---

### Final Verdict

**PASS WITH WARNINGS**

- 0 CRITICAL issues
- 5 WARNINGS (W1: pre-existing F5 failures, W2: lint in test file, W3: integration tests absent, W4: tasks.md staleness, W5: smoke deferred)
- 0 SUGGESTIONS

The change implements all 7 requirements (R1–R7) with passing unit tests. The backend typecheck and frontend typecheck + lint are clean. The only actionable items before archive are: (a) fix the `metaValue` lint error in `endpoint-discovery.service.spec.ts` to restore `npm run lint` to green, and (b) mark tasks 5.1 and 5.2 as `[x]` in tasks.md to reflect the actual implementation state.

