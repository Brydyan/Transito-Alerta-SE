# Tasks: sc-404 Menu Map & Menu Options Consistency Tests

**Change**: `back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests`
**Strict TDD**: ACTIVE (`openspec/config.yaml` -> `testing.strict_tdd: true`).

**Phase Exclusion Notice**: As per `rules.tasks`, this change requires only the **Tests** group. The `Entity`, `Migration`, `Service`, and `Controller` groups do not apply and are intentionally omitted because this is a purely static test harness. There are no new entities, database schema changes, services, or controllers being introduced or modified.

## Tests

- [x] **T1: SQL Migration Harness - Types & FSM Parser**
  - **Dependencies**: None.
  - **Builds**: The foundational types and the Finite State Machine (FSM) SQL parser.
  - **Files**: Create `backend/src/modules/menus/sql-migration-harness.ts`.
  - **Symbols**: Export interfaces `SimulatedState` (with `menuOptions`), `SimulatedMenuOption` (`id`, `route`). Implement internal FSM statement splitter.
  - **Done means**: The file exports the exact required interfaces. The internal FSM can successfully take a raw SQL string and split it into an array of statements by tracking single-quote literals and dollar-quoted `$$...$$` blocks, ensuring semicolons inside these contexts do not trigger a split.
  - **Verify command**: `cd backend && npm run typecheck`

- [x] **T2: SQL Migration Harness - Simulation Engine**
  - **Dependencies**: Requires T1.
  - **Builds**: The core simulation logic to build the in-memory state from migration files.
  - **Files**: Modify `backend/src/modules/menus/sql-migration-harness.ts`.
  - **Symbols**: Export `parseMigrations(migrationsDir: string): SimulatedState`.
  - **Done means**: `parseMigrations` reads `.sql` files with strict lexicographic filename ordering (handling duplicated prefixes). It throws the specified diagnostic error format for unrecognized forms touching modeled tables (including schema-qualified forms like `public.menu_options` and keeping the loud-failure contract for `menu_option_roles`). It successfully parses the three required forms: `INSERT INTO menu_options (...) VALUES` (multi-row, route is the third quoted field), idempotent `INSERT ... SELECT` (from `0064` synthesizing opaque internal identity and checking `NOT EXISTS` guard), and `UPDATE ... SET route` (evaluating both predicates). Identity tracking is not otherwise required.
  - **Verify command**: `cd backend && npm run typecheck`

- [x] **T3: Coverage and Regression Test**
  - **Dependencies**: Requires T2.
  - **Builds**: Test for Invariant 1 (Coverage) and the regression test seam (`0064` regression case).
  - **Files**: Create `backend/src/modules/menus/menu-map-coverage.spec.ts`.
  - **Symbols**: Jest `describe` and `it` blocks.
  - **Done means**: The test invokes `parseMigrations` once in `beforeAll`. It asserts that every route natively imported from `MENU_MAP` exists in the simulated state. It asserts the simulated set is not trivially empty. The regression test injects an overridden `MENU_MAP` containing a fake route (`/admin/missing-route`) and proves it fails the coverage assertion without altering production migrations or data. The suite requires no database, Docker, Testcontainers, or new dependencies, running under the existing `npm test`.
  - **Verify command**: `cd backend && npm test -- menu-map-coverage`

## Baseline & Toolchain (measured on the untouched base)

Verified before planning, so a later regression is distinguishable from pre-existing state:

- Full backend suite: **123 suites passed, 1271 passed, 11 skipped, 1282 total** (~38s). Those 11 skips are pre-existing and must stay at 11; sc-404 must not add skips.
- `npm run typecheck` (`tsc --noEmit -p tsconfig.json`): **exit 0**, clean. There is no pre-existing backend type debt, so a typecheck failure during this change is caused by this change.
- The repo installs and locks with **pnpm 11.20.0** (`pnpm-lock.yaml` at the repo root and in `backend/`), while `openspec/config.yaml` declares the runner as `npm test`. Both resolve the same local `node_modules/.bin/jest`. Keep the `npm` form in the verify commands to match the declared runner, and do not regenerate, convert, or delete any lockfile.
- `npm test -- <filter>` maps to jest path filtering and already behaves correctly: before a file exists it reports `Pattern: <name> - 0 matches`. Use `--passWithNoTests` only for a deliberately empty state, never to hide a file this change was supposed to create.

- [x] **T4: Full Green-Gate Verification (session-close gate)**
  - **Dependencies**: Requires T3.
  - **Builds**: Nothing new. This is the gate `AGENTS.md` section 5 requires before the change may be declared implemented.
  - **Files**: None modified. Verification only.
  - **Done means**: All four commands exit 0 from `backend`, the full suite reports zero failed tests, the skipped count stays at exactly 11, and the new spec file contributes its tests (expect 124 suites / ~1283 tests).
  - **Observed result**: `npm test` exit 0 — 124 suites passed, 1280 passed, 11 skipped, 1291 total (+1 suite, +9 tests vs the 123/1271/11/1282 baseline; skipped unchanged at 11). `npm run typecheck` exit 0. `npm run lint` exit 0 with 18 pre-existing warnings, none from the new files. `npm run build` exit 0. Coverage: 12 of 12 `MENU_MAP` routes present in 28 simulated rows (independently re-enumerated from the SQL by a separate parser, which agrees on 28 rows, 25 non-empty routes and 21 distinct non-empty routes). Nine tests in the spec: the trivially-empty guard, the coverage assertion, the regression seam, and six loud-failure cases covering trailing-clause rejection, `DELETE`, `TRUNCATE`, schema-qualified inserts and `menu_option_roles` skipping.
  - **Verify commands** (run from `backend`):
    - `npm test` — full suite, not filtered. Hard rules: 0 failed, skipped stays 11, suites >= 124.
    - `npm run typecheck` — exit 0.
    - `npm run lint` — exit 0, with no new warnings from the new files.
    - `npm run build` — exit 0 (`nest build`).
  - **Note**: never add `--passWithNoTests` to the full run. A suite count below 123 means a regression, not a pass.

## Review Workload Forecast

- Chained PRs recommended: No
- 400-line budget risk: Low
- Estimated changed lines: 240 (backend/src/modules/menus/sql-migration-harness.ts: ~180, backend/src/modules/menus/menu-map-coverage.spec.ts: ~60)
- Decision needed before apply: No

T4 contributes 0 changed lines (verification only), so the estimate above is unaffected. Expected shape: harness roughly 170-200 lines, coverage spec roughly 55-70 lines, total roughly 230-270 added lines, comfortably under the 400-line budget.
