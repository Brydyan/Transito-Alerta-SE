# Design: CSS Token Migration

**Change**: `2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb`

## Approach

Simple find-and-replace in 3 CSS files using the token mapping table below.

## Token Mapping

| Legacy Variable | F0 Token | Used For |
|---|---|---|
| `--primary-color` | `--color-brand-primary` | Accent/interactive colors (text, backgrounds, borders) |
| `--secondary-color` | `--color-border-subtle` | Subtle borders and dividers |
| `--dark-text` | `--color-on-tint-graphite` | Dark text on light backgrounds |

## File Changes

| File | Usages | Change |
|---|---|---|
| `frontend/src/app/shared/components/date-picker/date-picker.component.css` | 5 (`--primary-color`, `--secondary-color`) | Replace with F0 equivalents |
| `frontend/src/app/shared/components/spinner/spinner.component.css` | 1 (`--primary-color`) | Replace with `--color-brand-primary` |
| `frontend/src/app/shared/components/breadcrumb/breadcrumb.component.css` | 1 (`--dark-text`) | Replace with `--color-on-tint-graphite` |

## No Logic Changes

- HTML structure unchanged
- Component TypeScript logic unchanged
- CSS behavior preserved (tokens map to same color values as legacy variables)
- No breaking changes to consumers

## Verification

After replacement, run `pnpm test:e2e` (with `BASE_URL`/`E2E_PASSWORD` set) to confirm `css-tokens-policy.e2e.ts` now passes all 6/6 tests (was 3 failures).
