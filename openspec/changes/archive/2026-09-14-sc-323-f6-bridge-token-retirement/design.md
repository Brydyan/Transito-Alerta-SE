# Design: Retire Legacy Bridge Tokens (sc-323)

## Technical Approach

Bottom-up, dependency-ordered removal of 9 bridge CSS variables from `_variables.css`. Five phases, each independently verifiable. Only Phase 2 (CSS @apply migration) gates Phase 4 (variable deletion) -- all other phases are order-independent. Maps directly to the proposal's approach and satisfies all 7 spec scenarios.

## Architecture Decisions

### D1 — Phase Ordering (Strict Dependency Chain)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Remove vars first, fix errors as they surface | Tailwind 4 hard-fails @apply with unknown utilities -- red build blocks progress | Rejected |
| Phase 1 (dead code) → 2 (@apply) → 3 (HTML) → 4 (vars) → 5 (test) | Each phase independently verifiable; only Phase 2 strictly precedes Phase 4 | **Selected** |
| Single atomic commit for everything | Impossible to bisect if something breaks; all-or-nothing rollback | Rejected |

**Rationale**: Tailwind 4's `@apply` directive hard-fails on unknown utilities. Removing Block 1 variables before migrating the 6 `@apply` rules would break the build with no path forward except a full revert.

### D2 — Token Mapping Strategy (Mechanical Find-Replace)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Introduce new intermediate aliases | Adds complexity for zero benefit -- all tokens resolve to identical colors | Rejected |
| Direct mechanical find-replace to canonical tokens | Zero visual change, zero color delta, verifiable by grep | **Selected** |

**Rationale**: Every bridge token resolves to the same hex value as its canonical counterpart. No intermediate step needed.

### D3 — Badges CSS Scope Correction

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Remove `.badge-status-{pending,critical,info}` classes | Already use canonical tokens internally; class names are just CSS selectors, not bridge consumers | Out of scope |
| Leave unchanged | Classes use canonical tokens, zero bridge dependency | **Selected** |

**Rationale**: Exploration found that `_badges.css` already uses canonical tokens (`status-pendiente`, `prio-high`, `accent-cyan`). The class selector names (`.badge-status-pending`) are NOT bridge token consumers. They have zero HTML consumers either, but removing unused-but-canonical CSS classes is unrelated cleanup, not bridge retirement.

## Data Flow

```
_variables.css @theme block
    |
    |-- Block 1 (brand-navy/hivis, lines 24-29) ─→ 6 CSS @apply rules ─→ compiled output
    |                                              ─→ ~78 HTML inline classes
    |
    |-- Block 2 (status-critical/pending/info/success, lines 95-98) ─→ 0 consumers (dead)
    |
    v
Phase 1: delete Block 2 (dead, no deps)
Phase 2: migrate 6 @apply rules (brand-navy → brand-primary)
Phase 3: migrate ~78 HTML inline classes across 9 active files
Phase 4: delete Block 1 (safe: all consumers migrated)
Phase 5: expand regression test scope
```

## File Changes

| File | Action | Phase | Description |
|------|--------|-------|-------------|
| `frontend/src/styles/_variables.css` | Modify | 1 | Delete lines 78-98 (Block 2: 4 dead status vars + comment) |
| `frontend/src/styles/_variables.css` | Modify | 4 | Delete lines 24-29 (Block 1: 5 brand bridge vars + comment) |
| `frontend/src/app/features/admin/roles/role-editor/role-editor.component.css` | Modify | 2 | 3 @apply: `brand-navy` → `brand-primary` |
| `frontend/src/app/features/admin/system-config/system-config.component.css` | Modify | 2 | 1 @apply: `brand-navy` → `brand-primary` |
| `frontend/src/app/features/admin/users/user-form/user-form.component.css` | Modify | 2 | 2 @apply: `brand-navy` → `brand-primary` |
| `frontend/src/app/features/reports/clients-list/clients-list.css` | Modify | 2 | 1 @apply: `brand-navy` → `brand-primary` (includes `text-brand-navy`) |
| `frontend/src/app/features/auth/login/login.component.html` | Modify | 3 | `brand-navy` → `brand-primary`, `brand-hivis-text` → `white` |
| `frontend/src/app/features/auth/forgot-password/forgot-password.component.html` | Modify | 3 | `brand-navy` → `brand-primary`, `brand-hivis-text` → `white` |
| `frontend/src/app/features/auth/reset-password/reset-password.component.html` | Modify | 3 | `brand-navy` → `brand-primary`, `brand-hivis-text` → `white` |
| `frontend/src/app/features/admin/roles/role-editor/role-editor.component.html` | Modify | 3 | `brand-navy` → `brand-primary`, `status-critical` → `prio-high`, `status-success` → `status-resuelto` |
| `frontend/src/app/features/admin/system-config/system-config.component.html` | Modify | 3 | `brand-navy` → `brand-primary` |
| `frontend/src/app/features/admin/users/user-form/user-form.component.html` | Modify | 3 | `brand-navy` → `brand-primary`, `status-critical` → `prio-high`, `status-success` → `status-resuelto` |
| `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html` | Modify | 3 | `status-critical` → `prio-high` |
| `frontend/src/app/features/reports/clients-list/clients-list.html` | Modify | 3 | `brand-navy` → `brand-primary`, `status-critical` → `prio-high` |
| `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.html` | Modify | 3 | `status-critical` → `prio-high` (1 occurrence) |
| `frontend/src/app/layout/layout-tokens.regression.spec.ts` | Modify | 5 | Expand `layoutDir` to `frontend/src/`, add `brand-navy` to BANNED |

## Token Mapping Table

| Source token | Target token | Hex match | Consumer count |
|---|---|---|---|
| `brand-navy` | `brand-primary` | #7C3AED = #7C3AED | 6 CSS + ~60 HTML |
| `brand-navy-light` | `brand-primary-soft` | #F5F3FF = #F5F3FF | 0 (dead) |
| `brand-hivis` | `brand-primary-hover` | #6D28D9 = #6D28D9 | 0 (dead in CSS) |
| `brand-hivis-hover` | `brand-primary-hover` | #6D28D9 = #6D28D9 | 0 (dead) |
| `brand-hivis-text` | `white` (Tailwind utility) | #FFFFFF | ~5 HTML (auth spinners) |
| `status-critical` | `prio-high` | #EF4444 = #EF4444 | ~12 HTML |
| `status-success` | `status-resuelto` | #10B981 = #10B981 | ~4 HTML |
| `status-pending` | N/A (delete) | #FFC600, 0 consumers | 0 |
| `status-info` | N/A (delete) | alias, 0 consumers | 0 |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Build | Tailwind 4 compiles without bridge tokens | `pnpm build` after each phase (Scenarios 1, 5, 6) |
| Unit | Regression test catches remaining bridge refs | Expand `layout-tokens.regression.spec.ts` scope to `frontend/src/` (Scenario 2) |
| Grep | Zero bridge token occurrences remain | `grep -r 'brand-navy\|brand-hivis\|status-critical\|status-success\|status-pending\|status-info' frontend/src/` excluding test BANNED list and `_old_user-management/` (Scenarios 3, 4, 6) |
| Visual | No color change on any component | All mappings produce identical computed colors -- zero visual delta guaranteed (Scenarios 3, 4) |
| Naming | pending/pendiente confusion resolved | Verify `_variables.css` contains no `--color-status-pending` reference after Phase 1 (Scenario 7) |

## Migration / Rollout

No data migration, feature flags, or phased rollout needed. All changes are CSS class renames and variable deletions within a single PR. Rollback is a single revert.

Phase rollback independence: Phases 1 and 5 roll back independently. Phase 4 must revert if Phase 2 reverts. Phase 3 is non-breaking (HTML silently loses style) but must revert for clean state.

## Open Questions

None. All consumer files confirmed by exploration, all color mappings verified identical.
