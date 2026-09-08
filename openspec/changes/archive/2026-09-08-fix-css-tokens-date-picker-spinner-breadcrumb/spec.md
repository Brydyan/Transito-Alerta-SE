# Spec: CSS Token Migration (Legacy → F0)

**Change**: `2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb`

## Requirements

### Requirement: Legacy variables removed

**Scenarios**:

- **S1**: date-picker.component.css no longer uses `--primary-color`
  - Given: date-picker component CSS file
  - When: file is inspected
  - Then: all `var(--primary-color)` are replaced with `var(--color-brand-primary)`

- **S2**: date-picker.component.css no longer uses `--secondary-color`
  - Given: date-picker component CSS file
  - When: file is inspected
  - Then: all `var(--secondary-color)` are replaced with `var(--color-border-subtle)`

- **S3**: spinner.component.css no longer uses `--primary-color`
  - Given: spinner component CSS file
  - When: file is inspected
  - Then: all `var(--primary-color)` are replaced with `var(--color-brand-primary)`

- **S4**: breadcrumb.component.css no longer uses `--dark-text`
  - Given: breadcrumb component CSS file
  - When: file is inspected
  - Then: all `var(--dark-text)` are replaced with `var(--color-on-tint-graphite)`

- **S5**: E2E test css-tokens-policy.e2e.ts passes all 3 failing tests
  - Given: full frontend build
  - When: `pnpm test:e2e` runs with `BASE_URL` and `E2E_PASSWORD`
  - Then: 0 failures in `css-tokens-policy.e2e.ts` (previously 3 failures for `--primary-color`, `--secondary-color`, `--dark-text`)

- **S6**: No regressions
  - Given: changes applied
  - When: `pnpm test` and `ng build` run
  - Then: all tests pass, build succeeds, no new lint errors
