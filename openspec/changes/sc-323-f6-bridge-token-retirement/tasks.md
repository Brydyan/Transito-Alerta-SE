# Tasks: Retire Legacy Bridge Tokens (sc-323)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~100 (deletions + find-replace in 16 files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |

---

## Phase 1: Dead Code Removal — Block 2 Status Variables

- [ ] 1.1 Open `frontend/src/styles/_variables.css`; delete the 4 lines declaring `--color-status-critical`, `--color-status-pending`, `--color-status-info`, `--color-status-success` (lines ~95-98) and their block comment.
- [ ] 1.2 Run `pnpm build` from `frontend/`; verify exit 0 and zero Tailwind unknown-utility warnings.
- [ ] 1.3 Run `grep -n 'color-status-critical\|color-status-pending\|color-status-info\|color-status-success' frontend/src/styles/_variables.css`; verify zero matches.
- [ ] 1.4 Commit: `chore(design): remove dead status bridge tokens (Block 2)`.

---

## Phase 2: CSS @apply Migration — brand-navy → brand-primary (CRITICAL PATH)

- [ ] 2.1 Open `frontend/src/app/features/admin/roles/role-editor/role-editor.component.css`; replace all `brand-navy` occurrences with `brand-primary` (3 @apply rules: `border-brand-navy`, `bg-brand-navy/10`, `border-brand-navy/40 text-brand-navy`).
- [ ] 2.2 Open `frontend/src/app/features/admin/system-config/system-config.component.css`; replace `from-brand-navy/5 … border-brand-navy/15` with `from-brand-primary/5 … border-brand-primary/15`.
- [ ] 2.3 Open `frontend/src/app/features/admin/users/user-form/user-form.component.css`; replace 2 occurrences: `border-brand-navy` → `border-brand-primary`, `bg-brand-navy/45` → `bg-brand-primary/45`.
- [ ] 2.4 Open `frontend/src/app/features/reports/clients-list/clients-list.css`; replace `bg-brand-navy/10 text-brand-navy` → `bg-brand-primary/10 text-brand-primary`.
- [ ] 2.5 Run `pnpm build`; verify exit 0 and zero unknown-utility warnings.
- [ ] 2.6 Run `grep -rn '@apply.*brand-navy' frontend/src/`; verify zero matches.
- [ ] 2.7 Commit: `refactor(design): migrate brand-navy @apply rules to brand-primary (Phase 2)`.

---

## Phase 3: HTML Inline Class Migration

- [ ] 3.1 Open `frontend/src/app/features/auth/login/login.component.html`; replace `brand-navy` → `brand-primary` (~6 occ) and `brand-hivis-text` → `text-white` (1 occ).
- [ ] 3.2 Open `frontend/src/app/features/auth/forgot-password/forgot-password.component.html`; replace `brand-navy` → `brand-primary` (~4 occ) and `brand-hivis-text` → `text-white` (1 occ).
- [ ] 3.3 Open `frontend/src/app/features/auth/reset-password/reset-password.component.html`; replace `brand-navy` → `brand-primary` (~4 occ) and `brand-hivis-text` → `text-white` (1 occ).
- [ ] 3.4 Open `frontend/src/app/features/admin/roles/role-editor/role-editor.component.html`; replace `brand-navy` → `brand-primary` (~12 occ), `status-critical` → `prio-high`, `status-success` → `status-resuelto`.
- [ ] 3.5 Open `frontend/src/app/features/admin/system-config/system-config.component.html`; replace `brand-navy` → `brand-primary` (~5 occ), `status-critical` → `prio-high` (~4 occ), `status-success` → `status-resuelto` (~3 occ).
- [ ] 3.6 Open `frontend/src/app/features/admin/users/user-form/user-form.component.html`; replace `brand-navy` → `brand-primary` (~8 occ), `status-critical` → `prio-high` (~3 occ), `status-success` → `status-resuelto` (~2 occ).
- [ ] 3.7 Open `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html`; replace `status-critical` → `prio-high` (~2 occ).
- [ ] 3.8 Open `frontend/src/app/features/reports/clients-list/clients-list.html`; replace `brand-navy` → `brand-primary` (~4 occ), `status-critical` → `prio-high` (~3 occ).
- [ ] 3.9 Open `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.html`; replace `status-critical` → `prio-high` (1 occ).
- [ ] 3.10 Delete `frontend/src/app/features/admin/users/_old_user-management/` (dead folder, not imported or routed).
- [ ] 3.11 Run `pnpm build && pnpm test`; verify both pass.
- [ ] 3.12 Run `grep -rn 'brand-navy\|brand-hivis\|status-critical\|status-success' frontend/src/`; verify zero matches in active files.
- [ ] 3.13 Commit: `refactor(design): migrate legacy brand and status tokens in HTML templates (Phase 3)`.

---

## Phase 4: Variable Block Removal — Block 1 (gated on Phase 2)

**GATE: T2.6 must show zero `@apply.*brand-navy` matches before executing this phase.**

- [ ] 4.1 Open `frontend/src/styles/_variables.css`; delete the 5 lines declaring `--color-brand-navy`, `--color-brand-navy-light`, `--color-brand-hivis`, `--color-brand-hivis-hover`, `--color-brand-hivis-text` (lines ~24-29) and their block comment.
- [ ] 4.2 Run `pnpm build`; verify exit 0 and zero unknown-utility warnings.
- [ ] 4.3 Run `pnpm test`; verify all tests pass.
- [ ] 4.4 Run `grep -rn 'brand-navy\|brand-hivis' frontend/src/styles/`; verify zero matches.
- [ ] 4.5 Commit: `chore(design): remove brand-navy/hivis bridge variables from _variables.css (Block 1)`.

---

## Phase 5: Regression Test Scope Expansion

- [ ] 5.1 Open `frontend/src/app/layout/layout-tokens.regression.spec.ts`; change the scan root from `path.resolve(__dirname)` (layout/) to walk entire `frontend/src/`.
- [ ] 5.2 Verify `brand-navy` is in the test's BANNED list; add it if absent.
- [ ] 5.3 Update the test description string from `F0 token regression (layout/)` to `F0 token regression (frontend/src/)`.
- [ ] 5.4 Run `pnpm test`; verify the expanded regression test passes with zero matches.
- [ ] 5.5 Verify the test fails if a banned token is re-introduced (manual spot-check: add one `brand-navy` to any file, run test, confirm failure, then revert).
- [ ] 5.6 Commit: `test(tokens): expand regression scope from layout/ to frontend/src/`.

---

## Spec Traceability

| Task(s) | Spec Scenario |
|---------|---------------|
| 1.1–1.4 | Scenario 5 — Dead-code block removal leaves build green |
| 1.1–1.4 | Scenario 7 — pending/pendiente naming trap resolved |
| 2.1–2.7 | Scenario 3 — CSS @apply consumers produce identical computed output |
| 3.1–3.13 | Scenario 4 — Inline HTML class replacements preserve visual output |
| 4.1–4.5 | Scenario 6 — Bridge variable block removed with zero remaining consumers |
| 4.1–4.5 | Scenario 1 — Build succeeds after full retirement |
| 5.1–5.6 | Scenario 2 — Expanded regression test catches any remaining bridge reference |
