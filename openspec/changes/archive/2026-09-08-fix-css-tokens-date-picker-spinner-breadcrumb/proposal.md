# Proposal: Fix CSS Token Usage in Legacy Components

**Change**: `2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb`  
**Date**: 2026-09-08  
**Priority**: P2 (deferred from F6, discovered in CI e2e)

## Problem

Three shared components still use legacy F0 compatibility variables (`--primary-color`, `--secondary-color`, `--dark-text`) that should have been removed as part of F6.5.3 cleanup. This triggers e2e test failures in `css-tokens-policy.e2e.ts` (3 failing tests in CI):

- `date-picker.component.css` (5 usages: `--primary-color`, `--secondary-color`)
- `spinner.component.css` (1 usage: `--primary-color`)
- `breadcrumb.component.css` (1 usage: `--dark-text`)

These are internal components (not touched by F6 feature work) that need to be migrated to F0 tokens before the redesign PR can merge cleanly.

## Scope

**In scope**: Replace legacy variables with F0 token equivalents in the 3 CSS files.  
**Out of scope**: Refactor component logic, change HTML structure, or modify other components.

## Approach

1. Map legacy variables to F0 tokens:
   - `--primary-color` → `--color-brand-primary` (primary accent color)
   - `--secondary-color` → `--color-border-subtle` (subtle borders/dividers)
   - `--dark-text` → `--color-on-tint-graphite` (dark text on light backgrounds)

2. Replace all usages in the 3 CSS files.

3. Run `pnpm test:e2e` locally (with `BASE_URL`/`E2E_PASSWORD`) to verify all 3 test failures resolve.

4. Build + unit tests should remain green (no logic changes).

## Definition of Done

- ✅ All 3 CSS files updated with F0 tokens
- ✅ `css-tokens-policy.e2e.ts` shows 0 failures (3/3 tests pass)
- ✅ `pnpm test` and `pnpm run lint` remain 0 errors
- ✅ `ng build` clean
- ✅ Change archived and ready for PR
