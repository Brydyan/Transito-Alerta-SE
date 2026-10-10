# Archive Report: sc-404 Menu Map & Menu Options Consistency Tests

**Change**: `back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests`
**Archived**: 2026-10-10
**Archive Location**: `openspec/changes/archive/2026-10-10-sc-404-menu-map-menu-options-consistency-tests/`
**Verifier**: sdd-verify (claude-sonnet-4-6)
**Status**: PASS — All gates green, all tasks complete, spec synced, change archived

## Executive Summary

This change has been fully implemented, verified, and archived. A static SQL parsing harness was created to validate that all routes declared in `MENU_MAP` are seeded in the `menu_options` table across the migration files. The change prevents silent UI rendering failures caused by route declaration–migration misalignment, enforced via a CI-time coverage test that runs in-memory without any database dependency. All 4 tasks completed, all verification gates passed (typecheck, lint, build, test), and the spec has been synced to the canonical specs directory.

## Final State Authority

This archive report describes the state of the change AT CLOSE. Per the Final-State Authority contract:

- **Highest rank**: Persisted tasks artifact (tasks.md) — all implementation tasks marked complete (checked).
- **Second rank**: Explicit final-state facts from verification report (verify-report.md, observation recorded 2026-10-10) — all gates passed, no regressions from baseline, skipped count stable at 11.
- **Third rank**: Intermediate snapshots (apply-progress.md) — for historical context only, already superseded by verification.

When sources disagree, the tasks artifact is authoritative for completion visibility. The verify-report describes the state at the time verification ran and confirms all gates passed. No stale claims are reported as current facts.

## Specifications Synced

| Domain | Action | Details |
|--------|--------|---------|
| `menu-map-menu-options-consistency` | Created | Spec moved from `openspec/changes/back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests/specs/menu-map-menu-options-consistency/spec.md` to canonical location `openspec/specs/menu-map-menu-options-consistency/spec.md` |

**Spec Details**:
- **Location**: `openspec/specs/menu-map-menu-options-consistency/spec.md`
- **Requirements**: 3 (Coverage, Regression Protection, Harness Contract)
- **Scenarios**: 3 (All defined routes seeded, Missing migration fails, Unrecognized statement form fails)
- **Coverage**: 100% — all requirements covered by implementation and verified by test scenarios

## Archive Contents Verified

All artifacts present in archive:

- ✅ **proposal.md** (8202 bytes) — Problem statement, goals, scope, proposed approach, acceptance criteria
- ✅ **design.md** (11659 bytes) — Component design, SQL harness architecture, test suite design, data flow, error handling
- ✅ **specs/** — Domain spec directory with `menu-map-menu-options-consistency/spec.md`
- ✅ **tasks.md** (6688 bytes) — 4 tasks (T1–T4), all marked complete
- ✅ **apply-progress.md** (7216 bytes) — Records implementation completion
- ✅ **verify-report.md** (6028 bytes) — Verification verdict: PASS, all 4 gates green

## Task Completion

Per the Task Completion Gate:

| Task | Status | Evidence |
|---|---|---|
| **T1: SQL Migration Harness — Types & FSM Parser** | ✅ Complete | `SimulatedState`, `SimulatedMenuOption`, `splitStatements` in `sql-migration-harness.ts` |
| **T2: SQL Migration Harness — Simulation Engine** | ✅ Complete | `parseMigrations` exported and functional, three SQL statement forms implemented |
| **T3: Coverage and Regression Test** | ✅ Complete | 9 tests passing in `menu-map-coverage.spec.ts`, including coverage, regression seam, and 6 loud-failure cases |
| **T4: Full Green-Gate Verification** | ✅ Complete | All 4 verification commands passed with zero failures and stable skipped count (11) |

**Assertion**: All implementation tasks marked as checked (✅) in persisted `tasks.md`. No stale unchecked tasks remain for completed work.

## Implementation Summary

### Files Created

| File | Lines | Purpose |
|---|---|---|
| `backend/src/modules/menus/sql-migration-harness.ts` | 239 | Core SQL parsing harness: FSM statement splitter, SimulatedState builder, three supported statement forms |
| `backend/src/modules/menus/menu-map-coverage.spec.ts` | 66 | Jest spec: trivially-empty guard, coverage assertion, regression seam, 6 loud-failure cases |

**Total Added**: 305 lines (forecast was 240 lines; 400-line budget risk: **Low**)

### Files Modified

None. No source files were modified, no dependencies added, no migrations touched.

## Verification Results

Per verify-report.md (observation 2026-10-10):

| Gate | Command | Exit | Result |
|---|---|---|---|
| **typecheck** | `cd backend && npm run typecheck` | 0 | ✅ Clean |
| **lint** | `cd backend && npm run lint` | 0 | ✅ 0 errors, 18 warnings (all pre-existing, none from new files) |
| **build** | `cd backend && npm run build` | 0 | ✅ Clean |
| **test_subset** | `cd backend && npx jest --testPathPattern='menu-map-coverage'` | 0 | ✅ 1 suite, 9 tests passed, 0 failed, 0 skipped |
| **test_full** | `cd backend && npx jest` | 0 | ✅ **Baseline**: 123 suites / 1271 passed / 11 skipped / 1282 total → **Current branch**: 131 suites / 1365 passed / 11 skipped / 1394 total (includes ~50 commits from parallel feature work) → **SC-404 delta**: +1 suite / +9 tests |

**Verdict**: **PASS** — All gates green, zero failures, zero regressions. Skipped count stable at exactly 11 (hard requirement satisfied).

**Test Coverage**: 12 of 12 `MENU_MAP` routes confirmed present in 28 simulated `menu_options` rows across all migrations. Regression seam confirmed fails the build when route is missing. Loud-failure contract verified across six statement-form cases (trailing clauses, DELETE, TRUNCATE, schema-qualified inserts, ON CONFLICT DO UPDATE, and menu_option_roles skipping).

## Design Decisions Confirmed

| Decision | Implementation | Status |
|---|---|---|
| FSM character scanner for statement splitting | `splitStatements()` tracks single-quote and `$$` blocks | ✅ Implemented and tested |
| Shape 1: `INSERT ... VALUES`, route is 3rd quoted field | Regex + tuple parsing | ✅ Verified |
| Shape 2: `INSERT ... SELECT` from 0064, guard check | WHERE NOT EXISTS evaluation | ✅ Verified |
| Shape 3: `UPDATE ... SET route`, both predicates | Evaluates `id` AND `route` conditions | ✅ Verified |
| ON CONFLICT DO NOTHING optional, DO UPDATE throws | Clause recognized and stripped or rejected | ✅ Verified (6 test cases) |
| Loud failure for unrecognized forms | Named file + statement in error message | ✅ Verified |
| Schema-qualified `public.` prefix supported | Optional qualifier in all three shape regexes | ✅ Verified |
| `menu_option_roles` skipped via word boundary | Correct and verified | ✅ Verified |
| Lexicographic sort matches numeric order | Confirmed across all 72 migrations | ✅ Verified |
| No Docker / Testcontainers / new deps | Uses Node `fs` and `path` built-ins only | ✅ Verified |
| Coverage directional (MENU_MAP ⊆ seeded) | Test asserts MENU_MAP routes exist; ignores extra seeded routes | ✅ Verified |
| Trivially-empty guard | Row count assertion in spec | ✅ Verified |
| Regression seam via injected MENU_MAP | Faked `/admin/missing-route` in spec | ✅ Verified |

## Spec Compliance Matrix

### Requirement: Coverage
- **Assertion**: Every route declared in `MENU_MAP` must exist as a seeded row in `menu_options` across migrations.
- **Scenario**: All defined routes are seeded.
- **Result**: ✅ PASS — 9 tests passing, covering the coverage assertion and regression seam.
- **Evidence**: Test execution: `cd backend && npx jest --testPathPattern='menu-map-coverage'` → 1 suite, 9 tests passed.

### Requirement: Regression Protection
- **Assertion**: A mocked missing route must fail the build.
- **Scenario**: Missing migration causes a failure.
- **Result**: ✅ PASS — Regression seam test injects `/admin/missing-route` and confirms build failure.
- **Evidence**: Spec includes explicit regression test case that deliberately creates the 0064 pattern.

### Requirement: Harness Contract
- **Assertion**: Unrecognized statement forms must fail loudly with file + statement diagnostic.
- **Scenario**: Unrecognized statement form fails the parser.
- **Result**: ✅ PASS — Six dedicated test cases confirm loud-failure contract.
- **Evidence**: Test cases cover: ON CONFLICT DO UPDATE, trailing clauses, DELETE, TRUNCATE, schema-qualified inserts, and menu_option_roles skipping.

## Archive Readiness Checklist

- ✅ Structured status reviewed: dependencies ready, archive recommended
- ✅ Task Completion Gate passed: all implementation tasks checked in persisted tasks.md
- ✅ Specification sync completed: delta spec copied to canonical location
- ✅ Archive move completed: source removed, destination verified via diff
- ✅ Verification gates all green: typecheck, lint, build, test — zero failures
- ✅ No CRITICAL or WARNING issues in verify-report
- ✅ Spec coverage 100%: all 3 requirements, all 3 scenarios

## Mechanical Copy Verification

### Step 1: Spec Copy (delta to main)
```
Source: openspec/changes/back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests/specs/menu-map-menu-options-consistency/spec.md
Target: openspec/specs/menu-map-menu-options-consistency/spec.md
Status: ✅ Copied and verified (diff passed)
```

### Step 2: Archive Move (source to archive)
```
Source snapshot: openspec/changes/back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests
Destination: openspec/changes/archive/2026-10-10-sc-404-menu-map-menu-options-consistency-tests
Status: ✅ Moved (git mv attempted, fell back to mv when git index lock detected)
Readback diff: ✅ Identical (archive matches pre-move snapshot)
Source removal: ✅ Confirmed absent from active changes directory
```

**Verbatim diff output** (empty = only passing evidence):
```
(no differences)
```

## Source of Truth Updated

The canonical source of truth for this feature has been updated:

- **New spec**: `openspec/specs/menu-map-menu-options-consistency/spec.md`
- **Reflects**: Static SQL validation harness for MENU_MAP coverage
- **Authority**: This spec is now the single source of truth for the coverage requirement
- **Governance**: Future changes to coverage requirements must be applied to this canonical location

## SDD Cycle Complete

✅ **Proposal** → Problem statement and approach approved
✅ **Design** → Technical architecture and component design finalized
✅ **Tasks** → Implementation plan with 4 tasks defined
✅ **Apply** → All 4 tasks completed, code written and tested
✅ **Verify** → All verification gates passed, 100% spec coverage confirmed
✅ **Archive** → Specs synced, change folder archived, audit trail complete

The change is now closed and ready for ordinary repository delivery policy. All work products are archived; no change artifact remains in the active `openspec/changes/` directory.

## Notes

- This change introduces zero database migrations, zero new TypeORM entities, and zero new controllers. It is purely a static test harness that lives in the application codebase (`backend/src/modules/menus/`).
- The harness processes 72 migration files in lexicographic order, simulates 28 `menu_options` rows, and confirms all 12 `MENU_MAP` routes are present—all in memory, within 5 seconds, with no database connection.
- The loud-failure contract ensures the harness will reject any future SQL pattern it does not understand, forcing the next developer to extend the parser rather than silently allowing the invariant to rot.
- Six CRUD child routes and `/admin/controles` are correctly seeded but intentionally absent from `MENU_MAP`. The coverage assertion is directional: `MENU_MAP ⊆ seeded routes`. Extra routes do not fail.
- All 11 pre-existing skipped tests remain stable; no new skips were added. The change contributes +1 suite and +9 tests to the suite count, all passing.
