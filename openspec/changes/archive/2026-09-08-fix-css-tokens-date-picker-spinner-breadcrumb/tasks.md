# Tasks: CSS Token Migration

**Change**: `2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb`

## Implementation Checklist

### Phase 1: CSS Token Replacement

- [x] T.1.1 — Replace `--primary-color` with `--color-brand-primary` in date-picker.component.css (5 occurrences)
- [x] T.1.2 — Replace `--secondary-color` with `--color-border-subtle` in date-picker.component.css (1 occurrence)
- [x] T.1.3 — Replace `--primary-color` with `--color-brand-primary` in spinner.component.css (1 occurrence)
- [x] T.1.4 — Replace `--dark-text` with `--color-on-tint-graphite` in breadcrumb.component.css (1 occurrence)

### Phase 2: Verification

- [x] T.2.1 — Run `pnpm test` — verify 0 new failures
- [x] T.2.2 — Run `pnpm run lint` — verify 0 new errors
- [x] T.2.3 — Run `ng build` — verify build succeeds
- [ ] T.2.4 — Run `pnpm test:e2e` (with credentials) — verify css-tokens-policy.e2e.ts now passes all 6 tests (was 3 failures) [pending CI]

### Phase 3: Archive

- [x] T.3.1 — Update tasks.md with completion status
- [x] T.3.2 — Create apply-progress.md
- [ ] T.3.3 — Run sdd-verify
- [ ] T.3.4 — Archive change

---

**Total**: 11 tasks (4 implementation, 4 verification, 3 admin)
