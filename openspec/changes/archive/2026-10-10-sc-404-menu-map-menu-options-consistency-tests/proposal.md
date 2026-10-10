# Proposal: sc-404 Menu Map & Menu Options Consistency Tests

## 1. Problem Statement
The application sidebar is 100% data-driven: `menus.service.ts` (lines 72-119) dynamically reads from the `menu_options` and `menu_option_roles` database tables to construct the UI. The TypeScript constant `MENU_MAP` (found in `backend/src/modules/menus/menu-map.ts`) has no power to render UI elements; it merely acts as an index mapping routes to permissions (line 44) and appears within a comment block (line 101).

Because of this architecture, a route declared in `MENU_MAP` without a corresponding seeded row in `menu_options` will silently fail to render in the user interface. Furthermore, because the application-level permission filter is currently disabled (`menus.service.ts:105`), the `menu_option_roles` table acts as the actual gatekeeper, completely masking the failure. This exact issue has already occurred in production twice (migration 0060 for "Departamentos", and migration 0064 for "Auditoría de Acceso" — the latter only functioning on a specific database instance due to manual drift via the `POST /api/menu-options` endpoint).

## 2. Why a Rebuild Test Cannot Catch This
Executing a test against a live database instance will pass if manual drift (e.g., ad-hoc API calls or direct database edits) has occurred, masking the underlying issue. Conversely, a clean bootstrap process exactly reproduces what the migration files declare. The root cause of the bug is an inconsistency between static files (TypeScript definitions vs. SQL migrations), not a runtime behavior issue. Therefore, the tests must assert against the static source of truth.

## 3. Goals & Non-Goals

### Goals
* Prevent silent UI rendering failures caused by declaring routes in `MENU_MAP` that are not backed by SQL migrations.
* Establish a static testing mechanism that parses SQL migrations to simulate the final state of `menu_options` and `menu_option_roles` tables without requiring a live PostgreSQL instance.
* Provide early, loud feedback during the CI pipeline (build failure) if inconsistencies are detected.

### Explicitly Out of Scope
* **Refactoring or coalescing existing migrations:** Specifically, migrations `0060`, `0061`, and `0063`. These have already executed across provisioned databases. Editing them now creates permanent divergence between the repository and live databases without visible errors. `0060` utilizes raw `INSERT` statements without `ON CONFLICT` clauses, rendering it unsafe for re-execution.
* **Adding `db:migrate --apply` functionality:** This requires first reconciling the `schema_migrations` table, which is a separate infrastructure change.
* **Addressing bookkeeping debt:** This includes resolving the 6 duplicated versions on disk (`0054`x2, etc.), fixing migrations that do not self-register in `schema_migrations`, addressing the `0030` backfill naming mismatch, and standardizing the split convention between `ON CONFLICT` usage (`0060`/`0061` vs `0063`/`0064`).
* **Expanding `MENU_MAP`:** Do not attempt to grow `MENU_MAP` to declare the CRUD submenu rows or introduce any allowlist files.

## 4. Scope & Invariants

The scope encompasses the implementation of three static invariants, plus one regression test.

### Invariant 1: Coverage (ERROR)
* **Rule:** Every route declared in `MENU_MAP` must exist as a seeded row in `menu_options` across the migration files.
* **Current Status:** `MENU_MAP` currently declares exactly 12 routes, and all 12 are successfully seeded today. This change is pure prevention to stop future regressions; there is no live bug to fix for this specific rule today.
* **Enforcement:** Fails the build.

### Invariant 2: Zero-Grant Zombies (WARNING)
* **Rule:** Log a warning for every seeded row in `menu_options` that has zero associated grants in `menu_option_roles`.
* **Deviation Note:** This is a deliberate deviation from the original ticket wording ("every seeded route must exist in MENU_MAP"). This narrowed scope catches actual junk data (e.g., `"prueba2 nuevo"`, `"ZZ Prueba Raiz"`, which have no roles) without triggering false positives on the ~9 legitimate, intentional menus (like `/admin/controles` and the 12 CRUD rows from `0060` that inherit grants via `0061`/`0063`).
* **Enforcement:** Never fails the build.

### Invariant 3: Orphaned Parents (ERROR)
* **Rule:** Every seeded `menu_option` that defines a `parent_id` must reference a parent row that also exists in the simulated `menu_options` dataset.
* **Enforcement:** Fails the build.

### Regression Test (ERROR)
* **Rule:** Introduce a mock test case that deliberately recreates the pattern seen in `0064` (a route present in `MENU_MAP` without a corresponding migration). Ensure the build fails.

## 5. Proposed Approach

Create a single, consolidated SQL parsing harness located in `backend/src/modules/menus/`. This harness will:

* Statically read the SQL files in `database/migrations/` using `fs.readFileSync`.
* Model the `menu_options`, `menu_option_roles`, and `roles` (seeded by `0009` and `0015`) tables in memory.
* Process the files in strict lexicographical order based on the filename.
* **Crucial Mechanism (Symbolic Identity):** The harness will handle `gen_random_uuid()` by emitting a stable, opaque token linked to the inserted row (e.g., `sym:row#7`). Subsequent statements referencing that ID (like `cr.id` in `0061`) will resolve to the same token because the harness tracks row provenance. Role grants resolve via literal role names, not UUIDs. This completely resolves parent-child linkages (e.g., `cr.parent_id` is a literal, and `parent.id` is either a literal or a tracked token) entirely statically.
* Handle exactly three required statement forms:
  1. `INSERT INTO menu_options ... VALUES (...)` (multi-row tuples, handling `ON CONFLICT DO NOTHING`).
  2. `INSERT INTO menu_options ... SELECT ... WHERE route = '<literal>'` (idempotent form from `0064`).
  3. `UPDATE menu_options SET route = '<literal>' WHERE ...` (forms from `0058` and `0064`).
* **Loud Failure:** The harness *must* throw an error and fail loudly if it encounters an unrecognized statement form that touches these specific tables. A silent skip would allow the invariant to rot, defeating the purpose of this ticket.

## 6. Acceptance Criteria

1.  **Invariant 1 (Coverage) enforced:** A test asserts every `MENU_MAP` route is found in parsed `menu_options` migrations.
2.  **Invariant 2 (Zombies) enforced:** A test emits warnings for `menu_options` rows lacking `menu_option_roles` entries.
3.  **Invariant 3 (Orphans) enforced:** A test asserts no `menu_option` references a missing `parent_id`.
4.  **Static Execution:** Tests run via `fs` parsing SQL text within 5 seconds; no database connection, no Docker, no `testcontainers`.
5.  **Regression Safety:** A test intentionally introducing a mismatched `MENU_MAP` route correctly fails the build.

## 7. Risks & Mitigations

*   **Risk:** The SQL harness develops blind spots as migrations evolve (e.g., a new migration uses an unhandled syntax structure), leading to false negatives where the invariant rots silently.
    *   **Mitigation:** The harness will fail loudly on unrecognized statement forms touching `menu_options` or `menu_option_roles`. It will output a clear error message instructing the next developer to extend the harness capabilities to handle the new syntax.
*   **Risk:** The narrowed Invariant 2 (Zero-Grant Zombies) no longer flags legitimate menu rows that are subsequently orphaned from `MENU_MAP`.
    *   **Mitigation:** The documentation and comments will clearly state that this narrowed rule specifically targets unrenderable junk data. Implementing a comprehensive completeness check mapping `MENU_MAP` directly to intentional `menu_options` rows is designated as a follow-up task, as it requires more complex modeling of intentionality.

## 8. File Layout & Execution

*   **Test Location:** The spec files and the SQL parsing harness will reside within `backend/src/modules/menus/`.
*   **Execution Environment:** All specifications will execute as part of the standard unit test suite (`npm run test` or `pnpm test`), entirely avoiding database dependencies.
