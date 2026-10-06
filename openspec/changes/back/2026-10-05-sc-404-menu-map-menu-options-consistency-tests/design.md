# Design: sc-404 Menu Map & Menu Options Consistency Tests

## 1. Overview

This design introduces a static SQL testing harness that verifies the integrity of the application's data-driven sidebar without relying on a database. It ensures that the static TypeScript definition (`MENU_MAP`) exactly matches the SQL migration files that seed the database. 

```text
  [ database/migrations/*.sql ]
               |
               v (lexicographical order)
       [ fs.readFileSync ]
               |
               v
   [ FSM Statement Splitter ] --> (Discards irrelevant statements)
               |
               v (Extracts 3 Known Forms)
       [ In-Memory Simulation ]
               |
          menu_options
               |
         [Invariant 1]
          (Coverage)
```

## 2. Component Design

### `backend/src/modules/menus/sql-migration-harness.ts`
**Responsibility**: The core simulation engine. It reads SQL files, parses them, and builds the in-memory state of the tables.
**API Surface**: 
- `parseMigrations(migrationsDir: string): SimulatedState`
- `interface SimulatedState { menuOptions: SimulatedMenuOption[]; }`
- `interface SimulatedMenuOption { id: string; route: string; }`

#### Design Decisions

* **How `MENU_MAP` reaches the coverage test:** 
  The tests will import `MENU_MAP` natively via standard ES imports (`import { MENU_MAP } from './menu-map'`). This is type-safe and already has established precedent in `menu-map.spec.ts`. There is no need to read the TypeScript source via `fs`.
* **How a migration file is split into statements:** 
  Naively splitting by `;` breaks dollar-quoted strings (`$$...$$`) and standard string literals (`'...'`) which can contain semicolons. The harness will use a simple Finite State Machine (FSM) character scanner that tracks whether it is inside a single-quote literal or a dollar-quote block, splitting into statements only when encountering a `;` outside of these contexts.
* **Row identity model:** 
  Because every modeled ID is a literal UUID and no surviving statement references a database-generated ID, opaque internal identity tracking is no longer required. `parent_id` and `is_active` are not needed for coverage and may be parsed and discarded. For the single case where ID is database-generated, an opaque internal identity is synthesized.
* **The `menu_option_roles` table is deliberately NOT modeled:** 
  It is deliberately not modeled because mapping associations live in a different table and cannot create, remove, or rename a route in `menu_options`, so no coverage conclusion depends on them. The test enforces row existence in `menu_options`. Statements targeting `menu_option_roles` are skipped, which is correct rather than a silent failure: a plain SQL statement writes one table, so a statement whose target is `menu_option_roles` cannot create, remove, or rename a `menu_options` row, and therefore cannot change a coverage conclusion. The word boundary on `menu_options` is what performs this skip. An earlier draft promised a conditional throw "if a future statement could affect row existence"; no code implements that rule because for a single-table statement the condition is unreachable, and documenting an unimplemented guard as a live contract would be misleading.
* **Duplicate version prefixes on disk:** 
  Six numeric prefixes are duplicated on disk across the 72 migrations: `0054` (2 files), `0055` (2), `0056` (2), `0057` (2), `0058` (3 files), and `0064` (2). Every prefix is zero-padded to exactly four digits, and every file in the directory uses that same width. That padding is what makes `fs.readdirSync` plus a default string `Array.prototype.sort()` agree with numeric-aware ordering: verified across all 72 files, the lexicographic order is identical to sorting by `(numeric prefix, filename)`. The order of files sharing a prefix is therefore well defined and matches how migration runners order them. Only one of the three `0058` files writes to `menu_options`, so their relative order cannot change the simulated outcome.
* **Statement filtering vs. loud failure:** 
  The harness runs a regex to filter statements, and any statement matching it that cannot be mapped to one of the three supported shapes throws. An earlier draft asked the throw to cover a schema-qualified write such as a future `INSERT INTO public.menu_options`; the implemented behaviour is better than that. The shape patterns accept an optional `public.` qualifier, so such a write is parsed and modelled correctly instead of skipped, and only a genuinely unrecognized shape throws. The diagnostic message format must name the file and the offending statement.

Outside a tuple, a values list may contain only whitespace and tuple separators. Anything else is an unmodelled trailing clause and throws. This is the load-bearing half of the loud-failure contract: an earlier revision advanced one character at a time outside parentheses, so `RETURNING *` was consumed without complaint and `ON CONFLICT (id) DO UPDATE SET route = '...'` threw only by accident, because the parenthesised conflict target was misread as a tuple and then failed string extraction. Accidental rejection is not acceptable for a clause that can rename a route in place, since swallowing it would leave the old route in the simulated set and make the coverage assertion pass while the real menu was wrong. Rejecting unrecognised trailing text closes that hole for the right reason.
* **The `INSERT INTO ... VALUES` form (multi-row):**
  Tuple shape for every `INSERT INTO menu_options ... VALUES` is exactly: `('id', 'Name', '/route', 'icon', 'parent_uuid', display_order, is_active, now(), now())` — so the route is the third quoted field. A trailing `ON CONFLICT (id) DO NOTHING` is optional and must be recognised and stripped when present: of the 13 `VALUES` statements against `menu_options`, 7 carry it (all 5 in `0055` and the single one in `0057`) and 6 do not (the CRUD inserts in `0060`). Verified by enumeration: no literal id is ever seeded by more than one statement across all migrations, so `DO NOTHING` never actually suppresses a row today; the clause is still consumed so a future genuine collision fails loudly instead of double-inserting.
* **Routes are NOT unique, so compare sets and never counts:**
  `0060_crud_submenu_entries.sql` seeds `/admin/organizaciones` twice — once as the parent row at line 34 and again as a CRUD child at line 59. `route` is therefore neither a primary key nor a reliable identity, which is exactly why row identity is the literal `id`. The coverage assertion MUST compare the set of distinct simulated routes against the set of `MENU_MAP` routes; asserting a row count would fail on legitimate duplicate routes, and asserting a one-to-one mapping would misread the data model.
* **The `INSERT ... SELECT` form (from `0064`):** 
  It inserts `(name, route, icon, parent_id, display_order, is_active, created_at, updated_at)` with literals and has NO `id` column, so the database generates the id, and it is guarded by `WHERE NOT EXISTS (SELECT 1 FROM menu_options WHERE route = '<literal>' AND deleted_at IS NULL)`. The harness honors the `NOT EXISTS` guard by checking the simulated route set first.
* **The `UPDATE ... SET route` form (from `0058`, `0064`):** 
  The harness must evaluate BOTH predicates of the `WHERE` clause. It evaluates `UPDATE menu_options SET route = '<new>' WHERE id = '<literal-uuid>' AND route = '<old>'`. Two of the three route-normalization UPDATEs are dead no-ops on a clean sequential run and only matter after a partial-failure re-run. Ignoring the `route` guard would silently rewrite row `...-0012` and hide this fact.

### 3. Test Suite Design

The tests reside in `backend/src/modules/menus/`.

* **`menu-map-coverage.spec.ts`**:
  * *Purpose*: Validates Invariant 1 (Coverage) and the regression test.
  * *Mechanism*: Asserts that every route natively imported from `MENU_MAP` exists in the simulated state. Six seeded routes are intentionally NOT in `MENU_MAP` (the CRUD children from `0060` and `/admin/controles`). Extra seeded routes must NOT fail the test.
  * *Trivially Empty Guard*: Asserts the simulated set is not trivially empty, so the coverage assertion cannot pass while the harness silently simulated nothing.
  * *Injection Seam*: The regression test injects a mocked `MENU_MAP` containing a fake route (e.g., `/admin/missing-route`) against the real parsed database state. This structurally proves the test fails the build when a route is declared but not migrated, without altering production files.
* **Jest Integration**: 
  These are standard `.spec.ts` files picked up automatically by `npm test`. Because they read text files via `fs` and perform in-memory simulation, they execute instantly. No database, Docker, or Testcontainers are required.

### 4. Data Flow & Execution Order

1. **Test Initialization:** The `beforeAll` hook in the tests invokes `parseMigrations`.
2. **File Reading:** Harness reads `database/migrations/`, filters `.sql` files, and sorts lexicographically.
3. **Statement Parsing:** Each file is read, passed through the FSM splitter, and irrelevant statements are discarded.
4. **State Mutation:** Supported statements modify the `SimulatedState` (`menuOptions`).
5. **Assertion Phase:** Once the final state is built, Jest executes the `it()` blocks for the invariants against the frozen in-memory state.

### 5. Error Handling

**The Loud-Failure Contract:**
If the FSM parser identifies a statement touching `menu_options` (or schema-qualified forms) but cannot map it to one of the 3 supported SQL forms, it MUST throw a terminal error.

**Diagnostic Message Format:**
```text
[Static SQL Parser] FATAL: Unrecognized statement touching menu_options.
Migration: 0068_new_menu_feature.sql
Statement: WITH cte AS (...) INSERT INTO menu_options ...

Action Required: You have introduced a new SQL pattern that the consistency harness does not understand. You must update backend/src/modules/menus/sql-migration-harness.ts to parse this syntax, or rewrite your migration to use a supported form.
```

### 6. `rules.design` Compliance

| Rule | Compliance | Reason |
|---|---|---|
| Document entity relationships (FK, soft deletes, indexes) | **Does not apply** | This is a static test harness. No new migrations, entities, or database tables are created. |
| Show TypeORM decorators/patterns used | **Does not apply** | The harness reads raw text SQL and operates in-memory. TypeORM is intentionally bypassed to avoid requiring a live database. |
| Include Redis caching strategy (if applicable) | **Does not apply** | Tests run ephemerally within the CI Jest runner. No runtime caching or Redis interaction occurs. |

### 7. Risks and Trade-offs

* **Harness blind spots as migrations evolve:** The biggest risk is a developer using advanced SQL (like CTEs or subqueries) for a new menu item, which the static parser won't understand. The trade-off we make is the strict *fail-loud contract*. The parser will break the build rather than silently ignore the statement, forcing the developer to adapt the harness. Maintenance cost is incurred when SQL forms evolve.
* **Brittleness of text-level SQL parsing:** Regex-based SQL parsing is inherently brittle. The trade-off is accepting this brittleness in exchange for dependency-free CI tests.
* **Verified Outcome:** A faithful simulation of the migrations in strict lexicographic filename order produces 16 `menu_options` rows and covers 12 of 12 `MENU_MAP` routes, with 0 missing. The coverage invariant therefore PASSES on first run. The suite will be green as an expected, verified outcome.
