# Tasks: Unified Frontend Logging

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180–240 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception (not triggered — under budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Infrastructure + Migration + ESLint rule | PR 1 | `rtk jest logger.service` then `rtk lint` | `ng build --configuration production` (verify no console output) | Revert single PR; all 17 changed files restore together |

---

## Phase 1: Infrastructure (20 min)

### Service skeleton — RED first (strict TDD)

- [ ] 1.1 Create `frontend/src/app/core/services/logger.service.spec.ts` — write failing tests for all 8 acceptance criteria (debug/log no-op in prod, warn/error Sentry forwarding in prod, all 4 methods pass through in dev, no throw when Sentry absent). Mock `environment.production` and `Sentry.*`. All tests must be RED before 1.2.
- [ ] 1.2 Create `frontend/src/app/core/services/logger.service.ts` — implement `@Injectable({ providedIn: 'root' })` with `debug`, `log`, `warn`, `error` methods; environment gate + Sentry guard via `Sentry.getCurrentClient()`. Makes tests from 1.1 GREEN.
- [ ] 1.3 Modify `frontend/src/environments/environment.ts` — add `logLevel: 'warn'` field (additive, unused by service today).
- [ ] 1.4 Modify `frontend/src/environments/environment.development.ts` — add `logLevel: 'debug'` field.
- [ ] 1.5 Verify: `rtk jest logger.service` — all unit tests pass. `rtk tsc` — zero TypeScript errors. Acceptance criteria 1–6 green.

---

## Phase 2: Migration (90 min — 13 files, batched)

Migration order: guards → features (auth, error, citizen, citizen-report) → admin (roles, role-editor, users-list, user-form, audit-logs) → shared → bootstrap. Run `rtk lint` after each batch.

### Batch A — Guard + Auth + Error (files 1–3)

- [ ] 2.1 Modify `frontend/src/app/core/guards/menu.resolver.ts` — remove debug tap (lines 19-25 per design D5); migrate `console.error` in `catchError` block to `logger.error()`; add `inject(LoggerService)`.
- [ ] 2.2 Modify `frontend/src/app/features/auth/login/login.component.ts` — `inject(LoggerService)`; replace `console.error` with `logger.error()`.
- [ ] 2.3 Modify `frontend/src/app/features/error/error-page/error-page.component.ts` — `inject(LoggerService)`; replace `console.error` with `logger.debug()` (route dump is diagnostic per design).
- [ ] 2.4 Run `rtk lint` — zero violations in Batch A files.

### Batch B — Citizen features (files 4–6)

- [ ] 2.5 Modify `frontend/src/app/features/citizen/map/map.component.ts` — `inject(LoggerService)`; replace 2x `console.error` with `logger.error()`.
- [ ] 2.6 Modify `frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.ts` — `inject(LoggerService)`; replace `console.error` with `logger.error()`.
- [ ] 2.7 Modify `frontend/src/app/features/citizen-report/citizen-report.component.ts` — `inject(LoggerService)`; replace `console.error` with `logger.error()`.
- [ ] 2.8 Run `rtk lint` — zero violations in Batch B files.

### Batch C — Admin features (files 7–10)

- [ ] 2.9 Modify `frontend/src/app/features/admin/roles/roles.component.ts` — `inject(LoggerService)`; replace 3x `console.error` with `logger.error()`.
- [ ] 2.10 Modify `frontend/src/app/features/admin/roles/role-editor/role-editor.component.ts` — `inject(LoggerService)`; replace 2x `console.error` with `logger.error()`.
- [ ] 2.11 Modify `frontend/src/app/features/admin/users/users-list/users-list.component.ts` — `inject(LoggerService)`; replace `console.error` with `logger.error()`.
- [ ] 2.12 Modify `frontend/src/app/features/admin/users/user-form/user-form.component.ts` — `inject(LoggerService)`; replace 4x `console.error` with `logger.error()`.
- [ ] 2.13 Modify `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` — `inject(LoggerService)`; replace 3x `console.error` with `logger.error()`.
- [ ] 2.14 Run `rtk lint` — zero violations in Batch C files.

### Batch D — Shared + Bootstrap (files 11–13)

- [ ] 2.15 Modify `frontend/src/app/shared/components/map-picker/map-picker.component.ts` — `inject(LoggerService)`; replace `console.warn` with `logger.warn()`.
- [ ] 2.16 Modify `frontend/src/main.ts` — add `// eslint-disable-next-line no-console` above bootstrap `catch` block's `console.error` call; no LoggerService injection (Angular DI unavailable at bootstrap).
- [ ] 2.17 Run `rtk lint` — zero violations in Batch D files.
- [ ] 2.18 Verify: grep `console\.` in `frontend/src/app/` returns zero matches (spec scenario: 23 call sites replaced). Acceptance criterion 7 green.

---

## Phase 3: ESLint Enforcement (5 min)

- [ ] 3.1 Modify `frontend/eslint.config.js` — add `'no-console': 'error'` to the `src/**/*.ts` rules block (non-spec files only, as per design D3).
- [ ] 3.2 Run `rtk lint` across full frontend — CI must exit zero (all raw console calls already replaced; only `main.ts` escape hatch remains).
- [ ] 3.3 Smoke test: temporarily add `console.log('x')` to any file, run `rtk lint`, confirm non-zero exit, then revert. Acceptance criteria 7–8 green.

---

## Phase 4: Full Suite Verification (15 min)

- [ ] 4.1 Run `rtk jest` (full frontend unit suite) — zero failures.
- [ ] 4.2 Run `rtk tsc` — zero TypeScript errors across all 17 changed files.
- [ ] 4.3 Run `ng build --configuration production` — bundle size delta minimal (no new runtime overhead); verify no console output in production DevTools.
- [ ] 4.4 Manual check: run dev build, open DevTools, confirm debug/log output visible; run prod build, confirm debug/log silent.

---

## File Manifest (dependency order)

| Order | File | Action | Phase |
|-------|------|---------|-------|
| 1 | `frontend/src/app/core/services/logger.service.spec.ts` | Create (RED tests first) | 1 |
| 2 | `frontend/src/app/core/services/logger.service.ts` | Create (GREEN) | 1 |
| 3 | `frontend/src/environments/environment.ts` | Modify | 1 |
| 4 | `frontend/src/environments/environment.development.ts` | Modify | 1 |
| 5 | `frontend/src/app/core/guards/menu.resolver.ts` | Modify | 2A |
| 6 | `frontend/src/app/features/auth/login/login.component.ts` | Modify | 2A |
| 7 | `frontend/src/app/features/error/error-page/error-page.component.ts` | Modify | 2A |
| 8 | `frontend/src/app/features/citizen/map/map.component.ts` | Modify | 2B |
| 9 | `frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.ts` | Modify | 2B |
| 10 | `frontend/src/app/features/citizen-report/citizen-report.component.ts` | Modify | 2B |
| 11 | `frontend/src/app/features/admin/roles/roles.component.ts` | Modify | 2C |
| 12 | `frontend/src/app/features/admin/roles/role-editor/role-editor.component.ts` | Modify | 2C |
| 13 | `frontend/src/app/features/admin/users/users-list/users-list.component.ts` | Modify | 2C |
| 14 | `frontend/src/app/features/admin/users/user-form/user-form.component.ts` | Modify | 2C |
| 15 | `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` | Modify | 2C |
| 16 | `frontend/src/app/shared/components/map-picker/map-picker.component.ts` | Modify | 2D |
| 17 | `frontend/src/main.ts` | Modify (eslint-disable comment only) | 2D |
| 18 | `frontend/eslint.config.js` | Modify (last — prevents CI break mid-migration) | 3 |

---

## Risk Flags

| Risk | Mitigation |
|------|------------|
| Missed console call site during migration | Grep check at 2.18 catches any leftover before ESLint rule activates |
| `menu.resolver.ts` tap removal deletes wrong lines | Design explicitly names lines 19-25 and preserves `catchError` block; verify resolver tests still pass |
| `error-page` uses `logger.debug` not `logger.error` — easy to get wrong | Design D5 explicitly calls this out; double-check mapping at 2.3 |
| ESLint rule added before all calls migrated — breaks CI | Batch ordering: Phase 3 is strictly after Phase 2 completes |
| `main.ts` bootstrap receives LoggerService injection | Bootstrap catch must NOT inject; only add eslint-disable comment (task 2.16) |
| Sentry guard missing — throws in non-DSN environments | Unit test in 1.1 covers `getCurrentClient()` returning null; test must be RED first |

---

## Rollback Plan

Single-PR change. If post-merge issues arise: `git revert <merge-commit>` restores all 18 files atomically. No data migration, no schema change, no API contract change — zero side-effects outside the frontend build.
