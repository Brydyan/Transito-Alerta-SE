# Proposal: Retire legacy bridge tokens (sc-323)

## Intent

F0 design-system spec (D11) declared 9 bridge CSS variables (`--color-brand-navy*`, `--color-brand-hivis*`, `--color-status-critical/pending/info/success`) as temporary aliases pointing to the canonical violet palette, scheduled for removal in F6. All aliases resolve to the same color as their canonical counterparts -- zero visual change on removal. The debt blocks further design-system evolution by keeping dead indirection in the token layer.

## Scope

### In Scope
- Remove Block 2 (4 dead `--color-status-*` vars) and their unused `_badges.css` classes
- Migrate 4 CSS files using `@apply brand-navy` to canonical `brand-primary` tokens (~8 lines)
- Bulk-replace ~106 inline HTML class occurrences across ~12 files (`brand-navy` -> `brand-primary`, `brand-hivis-text` -> `white`, `status-critical` -> `prio-high`, `status-success` -> `status-resuelto`)
- Remove Block 1 (5 `--color-brand-navy/hivis*` vars) from `_variables.css`
- Expand `layout-tokens.regression.spec.ts` scan scope to `frontend/src/` and add `brand-navy` to BANNED list
- Clean up dead `_old_user-management/` references (no migration, just confirm exclusion)

### Out of Scope
- Refactoring component logic or templates beyond token class renames
- Changing canonical token values or the `@theme` block structure
- Deleting `_old_user-management/` directory (separate cleanup)
- Backend changes (none needed -- purely frontend CSS/HTML)

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `design-system`: The bridge-alias retirement fulfills the scenario "El alias de puente tiene ticket asignado a F6 (sc-323)" by removing all aliases. The regression test expands to enforce the ban across `frontend/src/`.

## Approach

Bottom-up removal in strict dependency order to avoid Tailwind 4 build breakage:

1. **Remove dead Block 2** -- 4 `--color-status-*` vars and unused `.badge-status-{pending,critical,info}` classes. Zero consumers, zero risk.
2. **Migrate @apply consumers** -- 4 CSS files replace `brand-navy` with `brand-primary` in `@apply` directives. This is the critical-path step; Tailwind 4 hard-fails on unknown tokens in `@apply`.
3. **Bulk-replace HTML classes** -- `brand-navy*` -> `brand-primary*`, `brand-hivis-text` -> `white`, `status-critical` -> `prio-high`, `status-success` -> `status-resuelto`. All inline (tolerant), same color values.
4. **Remove Block 1** -- 5 `--color-brand-navy/hivis*` vars from `_variables.css`. Safe because steps 2-3 eliminated all consumers.
5. **Expand regression test** -- widen scan path to `frontend/src/`, add `brand-navy` to BANNED list, verify zero occurrences.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/styles/_variables.css` | Modified | Remove 9 bridge vars (lines 24-29, 95-98) |
| `frontend/src/styles/_badges.css` | Modified | Remove 3 unused `.badge-status-*` classes |
| `frontend/src/styles/pages/clients-list.css` | Modified | @apply brand-navy -> brand-primary |
| `frontend/src/app/**/system-config.component.css` | Modified | @apply brand-navy -> brand-primary |
| `frontend/src/app/**/user-form.component.css` | Modified | @apply brand-navy -> brand-primary |
| `frontend/src/app/**/role-editor.component.css` | Modified | @apply brand-navy -> brand-primary |
| `frontend/src/app/**/*.component.html` (~10 files) | Modified | Inline class renames (~106 occurrences) |
| `frontend/src/app/layout/layout-tokens.regression.spec.ts` | Modified | Expand scope + add brand-navy to BANNED |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tailwind 4 build break if Block 1 removed before @apply migration | High (if misordered) | Strict task ordering: step 2 before step 4 |
| `text-brand-hivis-text` -> `text-white` loses styling silently | Low | Inline classes are tolerant; replacement is same visual output (#FFFFFF) |
| Missed consumer in unexplored file | Low | Regression test expansion (step 5) catches any remaining occurrence |
| `pending` vs `pendiente` confusion during review | Low | `--color-status-pending` (amber) is dead code with zero consumers; `--color-status-pendiente` (slate) is canonical and untouched |

## Rollback Plan

All changes are CSS class renames and variable deletions. Revert the single commit (or PR) to restore bridge tokens. No data migration, no API change, no state to unwind.

## Dependencies

- None. The canonical tokens (`brand-primary*`, `prio-high`, `status-resuelto`) already exist and are the source-of-truth values the bridge aliases point to.

## Success Criteria

- [ ] `pnpm build` passes (Tailwind 4 compiles without bridge tokens)
- [ ] `pnpm test` passes (expanded regression test included)
- [ ] Zero occurrences of `brand-navy`, `brand-hivis`, `status-critical`, `status-pending`, `status-info`, `status-success` in `frontend/src/` (excluding test BANNED list)
- [ ] No visual regression (all replacements map to identical color values)
