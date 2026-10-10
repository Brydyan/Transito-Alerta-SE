```yaml
change: back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests
verdict: PASS
timestamp: "2026-10-10"
verifier: sdd-verify (claude-sonnet-4-6)
strict_tdd: true

gates:
  typecheck:
    command: "cd backend && npm run typecheck"
    exit_code: 0
    result: ok

  lint:
    command: "cd backend && npm run lint"
    exit_code: 0
    result: "0 errors, 18 warnings — all pre-existing, none from the new files"

  build:
    command: "cd backend && npm run build"
    exit_code: 0
    result: ok

  test_subset:
    command: "cd backend && npx jest --testPathPattern='menu-map-coverage'"
    exit_code: 0
    suites: 1
    tests_passed: 9
    tests_skipped: 0
    tests_failed: 0

  test_full:
    command: "cd backend && npx jest"
    exit_code: 0
    suites_total: 131
    tests_passed: 1365
    tests_skipped: 11
    tests_failed: 0
    note: >
      Branch-level total is 131 suites / 1365 passed / 11 skipped because this
      branch (brydyan/sc-316) includes ~50 commits beyond main that add suites
      unrelated to sc-404 (Telegram, MinIO, e2e improvements, etc.).
      The sc-404 delta is exactly +1 suite / +9 tests vs the pre-sc-404 baseline
      for this branch, consistent with tasks.md T4 observed result of
      124/1280/11/1291 (measured from a different branch state without those extras).
      Skipped count is exactly 11 — unchanged, satisfying the hard requirement.
```

## Completeness Table

| Artifact | Present | Notes |
|---|---|---|
| spec.md | yes | 3 requirements, 3 scenarios |
| design.md | yes | Full component design |
| tasks.md | yes | T1–T4 all checked |
| apply-progress.md | yes | All 4 tasks complete |

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T1: FSM Parser + Types | complete (checked) | `SimulatedState`, `SimulatedMenuOption`, `splitStatements` present in harness |
| T2: Simulation Engine | complete (checked) | `parseMigrations` exported, 3 shapes implemented |
| T3: Coverage + Regression Test | complete (checked) | 9 tests passing in `menu-map-coverage.spec.ts` |
| T4: Full Green-Gate Verification | complete (checked) | All 4 commands exit 0 |

## Spec Compliance Matrix

### Requirement: Coverage

#### Scenario: All defined routes are seeded
- **Status**: PASS
- **Evidence**: `coverage: every route in MENU_MAP must exist in the simulated migration set` — PASS (9/9 tests)
- **Covering test**: `it('coverage: every route in MENU_MAP must exist in the simulated migration set', ...)`

### Requirement: Regression Protection

#### Scenario: Missing migration causes a failure
- **Status**: PASS
- **Evidence**: `regression seam: assertion fails when an injected route is missing from migrations` — PASS
- **Covering test**: `it('regression seam: assertion fails when an injected route is missing from migrations', ...)`

### Requirement: Harness Contract

#### Scenario: Unrecognized statement form fails the parser
- **Status**: PASS (6 subtests)
- **Evidence**: `loud-failure contract` describe block with 6 tests — all PASS
- **Covering tests**:
  - `throws on an ON CONFLICT DO UPDATE that renames a route`
  - `throws on any other unmodelled trailing clause`
  - `throws on DELETE and TRUNCATE against menu_options`
  - `accepts a schema-qualified insert instead of skipping it`
  - `accepts a modelled insert with the optional ON CONFLICT DO NOTHING`
  - `skips menu_option_roles, which cannot create or rename a menu_options row`

## Design Coherence

| Design Decision | Implementation | Status |
|---|---|---|
| FSM character scanner for statement splitting | `splitStatements()` in harness — single-quote + `$$` tracking confirmed | PASS |
| Shape 1: INSERT ... VALUES (route = 3rd quoted field) | `shape1Regex` + `parseValuesList` — tuple[2] is the route | PASS |
| Shape 2: INSERT ... SELECT from 0064, NOT EXISTS guard | `shape2Regex` with guard check | PASS |
| Shape 3: UPDATE ... SET route with both predicates | `shape3Regex` — evaluates id AND route predicates | PASS |
| ON CONFLICT DO NOTHING stripped, DO UPDATE throws | `onConflictRegex` strip + `parseValuesList` trailing-clause rejection | PASS |
| Loud failure for unrecognized forms | `throw new Error(...)` with file + statement diagnostic | PASS |
| Schema-qualified `public.` prefix accepted | `(?:public\.)?` in all three shape regexes | PASS |
| `menu_option_roles` skipped via word boundary | `\b` in `isMenuOptionsWrite` regex | PASS |
| Lexicographic sort | `Array.prototype.sort()` — design confirms this matches numeric order given 4-digit padding | PASS |
| No Docker / Testcontainers / new deps | `fs` and `path` only — both are Node built-ins | PASS |
| Directional coverage: MENU_MAP ⊆ seeded | `checkCoverage` iterates `MENU_MAP` entries, not the seeded set | PASS |
| Trivially-empty guard | `expect(simulatedState.menuOptions.length).toBeGreaterThan(0)` | PASS |
| Regression seam via injected MENU_MAP | `fakeMap = { ...MENU_MAP, FakeItem: { route: '/admin/missing-route' } }` | PASS |

## Issues

None.

## Specific Verification Points Checklist

| Point | Result |
|---|---|
| `sql-migration-harness.ts` exports `SimulatedState`, `SimulatedMenuOption`, `parseMigrations` | PASS |
| FSM splitter handles single-quote and `$$ ... $$` | PASS (confirmed in `splitStatements`) |
| 3 supported forms: VALUES, SELECT (0064), UPDATE SET route | PASS |
| Loud failure on DELETE, TRUNCATE, unrecognized clauses | PASS (3 dedicated test cases) |
| `menu-map-coverage.spec.ts`: trivially-empty guard + coverage + regression seam | PASS (3 tests) |
| 6 loud-failure cases in spec | PASS (6 tests) |
| Directional coverage `MENU_MAP ⊆ seeded` (not inverse) | PASS |
| No Docker, Testcontainers, new dependencies | PASS |
| Skipped count stays at exactly 11 | PASS (11 skipped confirmed) |

## Summary

CRITICAL: 0  
WARNING: 0  
SUGGESTION: 0  

**Verdict: PASS** — All 4 gates exit 0, all 9 new tests pass, skipped count unchanged at 11,
all 3 spec scenarios covered by runtime evidence, design decisions fully implemented.
