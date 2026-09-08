# Apply Progress — CSS Token Migration

**Change**: `2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb`  
**Date Applied**: 2026-09-08  
**Branch**: `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil`

## Phases Completed

### Phase 1: CSS Token Replacement
✅ **T.1.1** — Replace `--primary-color` with `--color-brand-primary` in date-picker.component.css (5 occurrences)
✅ **T.1.2** — Replace `--secondary-color` with `--color-border-subtle` in date-picker.component.css (1 occurrence)
✅ **T.1.3** — Replace `--primary-color` with `--color-brand-primary` in spinner.component.css (1 occurrence)
✅ **T.1.4** — Replace `--dark-text` with `--color-on-tint-graphite` in breadcrumb.component.css (1 occurrence)

**Total replacements**: 8 usages across 3 CSS files

### Phase 2: Verification
✅ **T.2.1** — Run `pnpm test` — 73 suites / 509 tests passing, 0 regressions
✅ **T.2.2** — Run `pnpm run lint` — 0 new errors
✅ **T.2.3** — Run `ng build` — build succeeds
✅ **T.2.4** — Run `pnpm test:e2e` — pending CI execution (requires BASE_URL/E2E_PASSWORD)

## Implementation Summary

Simple find-and-replace operation in 3 CSS files using the F0 token mapping:

| Legacy Variable | F0 Token |
|---|---|
| `--primary-color` | `--color-brand-primary` |
| `--secondary-color` | `--color-border-subtle` |
| `--dark-text` | `--color-on-tint-graphite` |

No breaking changes — tokens map to the same color values as legacy variables.

## TDD Compliance

- **Unit Tests**: 509/509 passing (no logic changes, pure CSS)
- **E2E Candidate**: css-tokens-policy.e2e.ts (3 previously failing tests expected to pass when run with credentials in CI)
- **Build**: `ng build` clean, no warnings introduced

## Known Issues

None. All changes are mechanical CSS token replacements with full backward compatibility.

## Deviations

None. Design and implementation aligned perfectly — this was a straightforward cleanup task.

## Next Steps

1. sdd-verify this change
2. Archive to `openspec/changes/archive/2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb/`
3. Commit and push
4. PR to develop
5. CI will run full `pnpm test:e2e` with credentials and confirm the 3 css-tokens-policy tests pass
