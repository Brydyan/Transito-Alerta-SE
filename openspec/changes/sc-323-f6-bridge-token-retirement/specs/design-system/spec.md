# Spec: Design System — Bridge Token Retirement

## MODIFIED Requirements

### Requirement: Bridge Token Retirement

The `frontend/src/` source tree MUST NOT contain references to retired bridge CSS variables or their
derived utility classes. All consumers MUST use canonical design-system tokens exclusively.

The build pipeline MUST compile without errors or unknown-utility warnings after bridge variables
are removed from `_variables.css`.

A regression test MUST enforce the absence of retired tokens across the full `frontend/src/` path
and MUST be included in the standard `pnpm test` run.

(Previously: bridge aliases `--color-brand-navy*`, `--color-brand-hivis*`,
`--color-status-critical/pending/info/success` were declared temporary in F0/D11 but still present.)

---

## Scenarios

### Scenario 1 — Build succeeds after full retirement

- GIVEN all consumers have been migrated to canonical tokens
- WHEN `pnpm build` is executed from `frontend/`
- THEN the command exits with code 0
- AND Tailwind emits no "unknown utility" warnings
- AND the compiled output contains canonical token classes but none of the retired bridge classes

---

### Scenario 2 — Expanded regression test catches any remaining bridge reference

- GIVEN `layout-tokens.regression.spec.ts` with scan scope set to `frontend/src/` and `brand-navy` added to the BANNED list
- WHEN the test suite is executed via `pnpm test`
- THEN the test FAILS if any file under `frontend/src/` contains `brand-navy`, `brand-hivis`, or any other retired bridge identifier
- AND the test PASSES when zero such occurrences exist

---

### Scenario 3 — CSS @apply consumers produce identical computed output

- GIVEN the 4 CSS files that previously used `@apply brand-navy` now reference the canonical primary token
- WHEN the CSS is compiled
- THEN every element that was styled via those rules continues to receive the same computed color as before
- AND no visual change is observable on the affected components

---

### Scenario 4 — Inline HTML class replacements preserve visual output

- GIVEN all inline HTML class occurrences of retired tokens replaced by their canonical equivalents
- WHEN the application renders the affected templates
- THEN each element receives the same computed color as the canonical token it was migrated to
- AND no visual difference exists between pre- and post-migration renders for any affected route

---

### Scenario 5 — Dead-code block removal leaves build green

- GIVEN `_variables.css` no longer contains the 4 `--color-status-critical/pending/info/success` variables or the associated `.badge-status-*` classes in `_badges.css`
- WHEN `pnpm build` runs
- THEN the build exits with code 0
- AND the regression test does not flag these removed tokens (they are in the BANNED list only, not expected to appear)

---

### Scenario 6 — Bridge variable block removed with zero remaining consumers

- GIVEN steps 3 and 4 are complete (all @apply and inline consumers migrated)
- WHEN the 5 `--color-brand-navy/hivis*` variables are removed from `_variables.css`
- THEN `pnpm build` exits with code 0
- AND a search for `brand-navy` or `brand-hivis` in `frontend/src/` returns zero matches
- AND the expanded regression test passes

---

### Scenario 7 — pending/pendiente naming trap is resolved without confusion

- GIVEN `--color-status-pending` (amber, dead code, zero consumers) and `--color-status-pendiente` (slate, canonical, active consumers) coexisted in `_variables.css`
- WHEN the dead `--color-status-pending` variable and any comments referencing it are removed
- THEN consumers of `status-pendiente` continue using the canonical slate token unchanged
- AND no component inadvertently receives the amber color
- AND `_variables.css` contains no comment that could conflate the two names

---

## REMOVED Requirements

### Requirement: Bridge Alias Availability

(Reason: bridge variables were temporary aliases created in F0/D11 to ease migration; F6 completes
the migration making them dead indirection that blocks design-system evolution.)

(Migration: `brand-navy` → `brand-primary`; `brand-hivis-text` → `text-white`;
`status-critical` → `prio-high`; `status-success` → `status-resuelto`. All map to the identical
canonical token value — zero visual change.)
