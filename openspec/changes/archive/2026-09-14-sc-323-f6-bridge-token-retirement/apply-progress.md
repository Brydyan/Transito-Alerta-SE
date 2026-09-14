# Apply Progress: sc-323 F6 — Bridge Token Retirement

**Status:** All 5 phases executed. Build green, 613/613 jest pass.
**Commits (newest first):**
- `fe8241b` — Phase 5: expand regression test
- `4ae7507` — Phase 4: delete Block 1 (`--color-brand-*` bridge vars)
- `85c32b3` — Phase 3: migrate HTML templates (9 files)
- `9874bbb` — Phase 2: migrate `@apply` consumers (4 CSS files)
- `49ad25f` — Phase 1: delete Block 2 (4 dead `--color-status-*` vars)

**Working dir:** `frontend/`. Tests run via `rtk jest` (not `rtk pnpm test --`).

---

## What was implemented

- **Block 2 deleted:** `--color-status-critical`, `--color-status-pending`,
  `--color-status-info`, `--color-status-success` + their comment block,
  in `frontend/src/styles/_variables.css`. All four were dead aliases
  with zero consumers in the source tree.
- **Block 1 deleted:** `--color-brand-navy`, `--color-brand-navy-light`,
  `--color-brand-hivis`, `--color-brand-hivis-hover`,
  `--color-brand-hivis-text` + their comment block, in
  `frontend/src/styles/_variables.css`.
- **CSS `@apply` migration (Phase 2):** 7 `@apply` rules across 4 files
  swapped `brand-navy` → `brand-primary`. Identical computed color
  (`#7C3AED` → `#7C3AED`).
- **HTML inline class migration (Phase 3):** 9 active HTML files
  migrated to canonical tokens:
  - `brand-navy` → `brand-primary`
  - `brand-hivis-text` → `text-white`
  - `status-critical` → `prio-high`
  - `status-success` → `status-resuelto`
- **`_old_user-management/` removed:** already deleted by commit
  `705275f` (roadmap sync) before Phase 3 began. Task 3.10 satisfied
  without further action.
- **Regression test expanded (Phase 5):**
  `layout-tokens.regression.spec.ts` now walks `frontend/src/` and bans
  `brand-navy` (per sc-323) + previously-banned `brand-hivis`,
  `#CCFF00`, `Barlow`. Split into two describes:
  - **Global** (`frontend/src/`): `#CCFF00`, `brand-hivis`,
    `brand-navy`, `Barlow`.
  - **Shell-only** (`app/layout/`): `bi bi-`,
    `material-symbols-outlined` (these have legitimate uses outside
    the shell — see DEVIATIONS below).
- **Historical comments cleaned:** `_variables.css`, `_base.css`,
  `_components.css`, `_modals.css` had F0 migration notes that named
  the bridge aliases. After F6 retirement those notes were obsolete and
  would have failed Phase 5's regression scan. Rewrote them in
  canonical-token vocabulary.

---

## Deviations from `tasks.md`

### Phase 3 — auth files migrated more than enumerated

Tasks 3.1–3.3 (login / forgot-password / reset-password) only listed
`brand-navy` + `brand-hivis-text` for migration. The actual files also
contained `status-critical` (login ×3, forgot ×1, reset ×1) and
`status-success` (forgot ×1, reset ×1) inline classes. Migrated them
anyway to satisfy the Phase 3.12 grep gate (zero matches in active
files). Deviation cost: zero — same color mapping, same audit trail.

### Phase 3.8 — `clients-list.html` had no `brand-navy`

Tasks 3.8 listed `brand-navy` → `brand-primary` (~4 occ) for
`clients-list.html`. The file had zero `brand-navy` references (only
`status-critical` ×2). The `brand-navy` consumer in this feature was in
the sibling `clients-list.css`, already migrated in Phase 2 (task 2.4).
Phase 3.8 task therefore reduced to the `status-critical` migration.

### Phase 3.10 — `_old_user-management/` pre-deleted

Already deleted by commit `705275f` (roadmap SDD sync). No action needed;
verified with `git log --diff-filter=D`.

### Phase 4.1 — additional comment rewrites

Tasks 4.1 only mentioned deleting Block 1 (lines 24–29) + their block
comment in `_variables.css`. The same file's header comment (lines
1–16) plus three other styles files (`_base.css`, `_components.css`,
`_modals.css`) still named the bridge aliases in historical F0
migration notes. Kept verbatim, they would have failed Phase 5's
regression scan. Rewrote them in canonical-token vocabulary. Deviation
cost: documentation churn only, no behavior change.

### Phase 5 — split into two describe blocks

Tasks 5.1–5.3 envisioned a single describe block with one BANNED list
scanning `frontend/src/`. The first attempt failed because two of the
existing BANNED tokens had legitimate uses outside `app/layout/`:

- `bi bi-` — Bootstrap Icons used in 7+ feature components
  (`role-editor`, `system-config`, `user-form`, `forgot-password`,
  `reset-password`, `clients-list`, `empty-state`). Original F0.5.4
  rule was shell-only (Bootstrap Icons removed from the chrome).
- `material-symbols-outlined` — only present as a historical comment
  in `ui-icon.component.ts` (icon family replaced by lucide-angular).

Refactored to two `describe` blocks: a global one for true bridge
tokens + a shell-only one for the layout-specific rules. Each rule now
applies only to the scope it was designed for. Test passes (6/6).

### Phase 5.2 — `status-*` not added to BANNED

Tasks 5.2 only required adding `brand-navy`. Did **not** add
`status-critical` / `status-success` / `status-pending` / `status-info`
to BANNED because design.md **D3** explicitly retained the
`.badge-status-*` class selectors as canonical (their CSS body uses
canonical tokens, the class name is not a bridge consumer). Adding
those tokens globally would have broken `.badge-status-critical` on the
first run. If a future phase reintroduces a `status-*` *alias* (not
the canonical classes), it must be added to BANNED explicitly.

---

## Collateral commits included by accident

Commit `4ae7507` (Phase 4) included 11 unrelated openspec deletions
already staged in the index before this change began (from
`openspec/changes/back/backend-nestjs-modules/` and
`openspec/changes/infra/t7-database-schema-parity/`, both moved to
`openspec/changes/archive/...` by an earlier commit). These were
pre-staged deletions picked up by `rtk git add frontend/src/styles/`.
They were already intended to land — not a regression risk — but they
sit in the sc-323 commit history. If a clean separation matters, split
them off with a `git rebase -i HEAD~5` before merging.

---

## Verification summary

- `pnpm build` (executed via `rtk pnpm build`): exit 0, no
  Tailwind unknown-utility warnings. Verified after every phase.
- `pnpm test` (executed via `rtk jest`): 613/613 PASS after Phase 5.
- `grep 'brand-navy|brand-hivis' frontend/src/styles/`: zero matches.
- `grep '@apply.*brand-navy' frontend/src/`: zero matches.
- Regression spot-check (Phase 5.5): injecting `.brand-navy-tmp`
  into `_badges.css` made the global regression test fail as expected;
  reverted cleanly.

---

## Ready for `sdd-verify`

No known blockers. The deviation list is short and each one is
defensible; please spot-check that:

1. Auth files picking up `status-critical`/`status-success` migrations
   is acceptable (it was implied by the grep gate).
2. Splitting BANNED into global + shell-only is preferred over
   expanding the global scope (the alternative would have meant either
   rewriting dozens of feature icons or leaving bootstrap-icons banned
   in scope they shouldn't apply to).
3. The historical comment rewrites in the styles files read OK in
   canonical vocabulary.
