# Menu Map & Menu Options Consistency Tests

## Purpose
Introduce a static SQL parsing harness to simulate the `menu_options` table in memory, validating that the statically defined `MENU_MAP` perfectly aligns with the SQL migrations. This adds a fast CI check to prevent silent UI rendering failures where declared routes are missing from the database, without requiring a live PostgreSQL instance.

## Scope Summary

**In scope**
- A static SQL parsing harness located in `backend/src/modules/menus/` that reads from `database/migrations/`.
- In-memory modeling of `menu_options` using strict lexicographic file processing.
- A Coverage test (Invariant 1) asserting every `MENU_MAP` route is seeded, failing the build on errors.
- A Regression test ensuring a mocked missing-migration scenario fails the build.

**Out of scope**
- Any database connection, Docker, Testcontainers, or new dependencies for these static tests.
- Refactoring or coalescing existing migrations (e.g., `0060`, `0061`, `0063`).
- Adding `db:migrate --apply` functionality.
- Addressing bookkeeping debt (duplicate versions, `schema_migrations` inconsistencies, or `0030` naming mismatch).
- Expanding `MENU_MAP` to declare CRUD submenu rows.
- Any allowlist file.
- A comprehensive `MENU_MAP`-to-intentional-`menu_options` completeness check.

## Requirements

### Coverage
The harness MUST assert that every route declared in `MENU_MAP` (`backend/src/modules/menus/menu-map.ts`) exists as a seeded row in `menu_options` across the processed SQL migrations. This enforcement is an ERROR and MUST fail the build. The present-day state has all 12 `MENU_MAP` routes seeded, so this acts as pure prevention. Six seeded routes are intentionally NOT in `MENU_MAP` (CRUD children and `/admin/controles`); extra seeded routes are correct and must NOT fail the test. Also, the harness must assert the simulated set is not trivially empty, so the coverage assertion cannot pass while the harness silently simulated nothing.

#### Scenario: All defined routes are seeded
- **Given** the current state of `MENU_MAP` and the unedited SQL files in `database/migrations/`
- **When** the static coverage test runs
- **Then** the test passes successfully and exits with a zero status code

### Regression Protection
A test case MUST deliberately recreate a route present in `MENU_MAP` with no corresponding migration seeding it. This test MUST be verifiable statically without editing production data or actual migration files, and this enforcement is an ERROR that MUST fail the build.

#### Scenario: Missing migration causes a failure
- **Given** an overridden `MENU_MAP` mock containing a hypothetical route `/admin/missing-route`
- **When** the static coverage test runs against the actual, unmodified SQL migrations
- **Then** the harness detects that `/admin/missing-route` is absent from the simulated `menu_options` dataset
- **And** the test fails the build

### Harness Contract
The harness MUST reside within `backend/src/modules/menus/` and statically read SQL files via `fs.readFileSync` from `database/migrations/` in strict lexicographic filename order. It MUST model `menu_options` only. Because every modeled ID is a literal UUID and no surviving statement references a database-generated ID, opaque identity tracking is no longer required. `parent_id` and `is_active` are not needed for coverage and may be parsed and discarded. It MUST complete execution within 5 seconds without relying on database connections, Docker, Testcontainers, or any new dependencies.

The harness MUST handle exactly these three SQL statement forms:
1. `INSERT INTO menu_options (...) VALUES (<tuples>)` (multi-row, route is the third quoted field).
2. `INSERT INTO menu_options (...) SELECT <literals> WHERE NOT EXISTS (SELECT 1 FROM menu_options WHERE route = '<literal>')` (from `0064`, database-generated ID so synthesize an opaque internal identity, check `NOT EXISTS` guard against simulated route set first).
3. `UPDATE menu_options SET route = '<new>' WHERE id = '<literal>' AND route = '<old>'` (evaluate both predicates; two of three UPDATEs are dead no-ops on a clean sequential run).

To mitigate blind spots as migrations evolve causing false negatives, the harness MUST throw an error and fail loudly on any unrecognized statement form that touches `menu_options`. Make the loud throw cover BOTH a schema-qualified or otherwise unrecognized write form (for example a future `INSERT INTO public.menu_options`, which a naive regex would silently skip) and any unrecognized statement that touches a modeled table. Keep the loud-failure contract for `menu_option_roles` anyway: if a future statement ever targets it in a way that could affect row existence, throw rather than skip. A silent skip is strictly forbidden because it lets the invariant rot. This loud failure instructs the next developer to extend the harness.

#### Scenario: Unrecognized statement form fails the parser
- **Given** a mock migration file containing an unhandled SQL syntax pattern touching `menu_options`
- **When** the harness processes the migration files
- **Then** the harness immediately throws a parsing error instructing the developer to extend the parser
- **And** the test fails the build

## Non-Goals

- Refactoring or coalescing migrations `0060`, `0061`, `0063`.
- Adding `db:migrate --apply` (requires reconciling `schema_migrations` first — a separate infrastructure change).
- Bookkeeping debt: the 6 duplicated versions on disk, migrations that do not self-register in `schema_migrations`, and the `0030` backfill naming mismatch.
- Expanding `MENU_MAP` to declare CRUD submenu rows.
- Any allowlist file.
- A comprehensive `MENU_MAP`-to-intentional-`menu_options` completeness check — this is a follow-up needing intentionality modeling, and must be recorded as out of scope, not silently dropped.
