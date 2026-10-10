# Apply Progress: sc-404 Menu Map & Menu Options Consistency Tests

**Change**: `back/2026-10-05-sc-404-menu-map-menu-options-consistency-tests`
**Status**: All four tasks complete. Green gate passed.

## Scope actually applied

One invariant only: **coverage**. Every route declared in `MENU_MAP` must exist as a
seeded `menu_options` row across `database/migrations/`. A missing route fails the build.

Out of scope by maintainer decision: zombie grants, orphan parents, `menu_option_roles`,
grants, capabilities (`can_read` / `can_write`), and `ON CONFLICT ... DO UPDATE` modelling.

## Files created

| File | Lines |
| --- | --- |
| `backend/src/modules/menus/sql-migration-harness.ts` | 239 |
| `backend/src/modules/menus/menu-map-coverage.spec.ts` | 66 |

Total 305 added lines, against a forecast of 240 and a 400-line budget. No source file was
modified, no dependency was added, and nothing under `database/migrations/` was touched.

## Harness

Exports `parseMigrations(migrationsDir): SimulatedState`, plus `SimulatedState`
(`menuOptions`) and `SimulatedMenuOption` (`id`, `route`). Models `menu_options` only.

- Statement splitting is an FSM scanner that tracks single-quote literals and `$$ ... $$`
  blocks, so semicolons inside them do not split a statement. `--` comments are stripped.
- Files are ordered with a plain lexicographic `Array.prototype.sort()`. Every prefix on disk is
  zero-padded to four digits, so lexicographic order was verified to be identical to
  numeric-aware order across all 72 migrations. Six prefixes are duplicated (`0054`, `0055`,
  `0056`, `0057`, `0058`, `0064`), and `0058` has three files; only one of them writes to
  `menu_options`, so their relative order cannot change the result.
- Three supported shapes: multi-row `INSERT ... VALUES` (route is the third quoted field),
  the single `INSERT ... SELECT` from `0064` honouring its `NOT EXISTS` guard, and
  `UPDATE ... SET route` evaluating **both** predicates.
- A trailing `ON CONFLICT (id) DO NOTHING` is optional and is recognised and stripped when
  present. Of the 13 `VALUES` statements against `menu_options`, 7 carry the clause and 6 do
  not — the six CRUD inserts in `0060`. An earlier draft of this document claimed every
  statement carried it, which was wrong. Verified by enumeration that no literal id is seeded
  twice anywhere, so `DO NOTHING` never suppresses a row today; it is still consumed so a
  future genuine collision fails loudly instead of double-inserting.
- `gen_random_uuid()` yields a synthetic internal id; no surviving statement references a
  database-generated id, so provenance tracking is unnecessary.
- Loud failure: a statement matching `INSERT INTO | UPDATE | DELETE FROM | TRUNCATE` against
  `menu_options` that matches none of the three shapes throws, naming the file and the
  offending statement. Confirmed by probe against `DELETE FROM menu_options`,
  `TRUNCATE menu_options`, and `UPDATE ... SET name`.
- Schema-qualified writes are *supported*, not thrown: the shape patterns accept an optional
  `public.` qualifier, so `INSERT INTO public.menu_options` is parsed and modelled correctly.
  An earlier draft of this document said such a form would throw, which was wrong.
- `menu_option_roles` is skipped via the word boundary on `menu_options`. This is correct
  rather than a silent failure: a single-table statement cannot change `menu_options` row
  existence, so it cannot change a coverage conclusion. An earlier draft of this document
  claimed that table "retains its own loud-failure rule"; no such rule exists in code and none
  is needed.
- Trailing content after the values list is rejected. Outside a tuple only whitespace and
  tuple separators are legal, so `RETURNING *` and
  `ON CONFLICT (id) DO UPDATE SET route = '...'` both throw, naming the file and the
  statement. This was the one real blind spot found in review: the parser previously advanced
  one character at a time outside parentheses, which swallowed `RETURNING` and rejected
  `ON CONFLICT ... DO UPDATE` only by accident, because the conflict target's parentheses were
  misread as a tuple. Swallowing a clause that can rename a route in place would leave the old
  route in the simulated set and let the coverage assertion pass while the real menu was
  wrong, so the rejection now happens for the correct reason.
- The spec covers this contract with six cases written to throwaway directories: the modelled
  insert with `ON CONFLICT (id) DO NOTHING` is accepted, the renaming `ON CONFLICT ... DO
  UPDATE` throws, any other trailing clause throws, `DELETE` and `TRUNCATE` throw, a
  schema-qualified insert is parsed rather than skipped, and `menu_option_roles` is skipped.

## Test

`menu-map-coverage.spec.ts` imports `MENU_MAP` natively and resolves the migrations directory
from `__dirname`, so it is cwd-independent. It throws if the directory is unreadable rather
than degrading to an empty set. Three tests:

1. Trivially-empty guard on the simulated set.
2. Coverage: `MENU_MAP` routes compared against the simulated route **set**.
3. Regression seam: an injected `/admin/missing-route` is detected as missing.

Coverage is deliberately **directional** — `MENU_MAP ⊆ seeded`. Extra seeded routes are
correct and must not fail: the six CRUD children from `0060` plus `/admin/controles` are
seeded but absent from `MENU_MAP`. Routes are **not** unique (`0060` seeds
`/admin/organizaciones` twice, parent at line 34 and a child at line 59, plus three more
duplicate routes), so the assertion compares sets and never counts.

## Verification observed

| Command | Result |
| --- | --- |
| `cd backend && npm test` | exit 0 — 124 suites, 1280 passed, 11 skipped, 1291 total |
| `cd backend && npm run typecheck` | exit 0 |
| `cd backend && npm run lint` | exit 0 — 18 pre-existing warnings, none from the new files |
| `cd backend && npm run build` | exit 0 |

Baseline was 123 suites / 1271 passed / 11 skipped / 1282 total. Delta is +1 suite and
+3 tests, and the skipped count stayed at exactly 11.

Coverage result: **12 of 12** `MENU_MAP` routes present, from 28 simulated rows. An
independent re-enumeration of the migrations by a separate parser agrees on 28 rows and 21
distinct non-empty routes (the 22nd distinct value counted by the harness is the empty route
string), so the harness is not over- or under-counting.

## Notes and honest caveats

- No assertion was weakened, skipped, or relaxed to obtain the green suite.
- The trivially-empty guard asserts the simulated **row** set (`menuOptions.length > 0`), which
  matches `design.md` wording. A stricter variant would assert non-empty **routes**; with 3 of
  28 rows carrying an empty route this is a real difference, though not load-bearing — if every
  route were empty the coverage assertion itself would fail, so the build still goes red.
- The regression seam proves `checkCoverage` detects an absent route; combined with the
  `toEqual([])` assertion on the real `MENU_MAP`, a missing route does fail the suite.
- `/admin/categorias` and `/admin/ubicaciones` are seeded but absent from `MENU_MAP`. That is
  outside the directional coverage invariant and was not treated as a defect.
