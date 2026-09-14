# Archive Report: Retire Legacy Bridge Tokens (sc-323)

**Change**: sc-323-f6-bridge-token-retirement  
**Archived**: 2026-09-14  
**Status**: COMPLETE — All 35 tasks verified, spec merged, zero CRITICAL/WARNING issues

---

## Executive Summary

The sc-323 change successfully retired 9 legacy CSS bridge variables (`--color-brand-navy*`, `--color-brand-hivis*`, `--color-status-critical/pending/info/success`) and migrated all consumers to canonical design-system tokens. All 7 spec scenarios passed verification. The change is ready for merge to main.

---

## Verification Summary

| Field | Value |
|-------|-------|
| Verdict | PASS |
| Requirements | 1 (Bridge Token Retirement) |
| Scenarios | 7/7 pass |
| Critical Issues | 0 |
| Warnings | 0 |
| Suggestions | 1 (non-blocking: commit audit trail cleanup) |
| Build | ✅ exit 0 (Tailwind compiles cleanly) |
| Tests | ✅ 613/613 pass |

**Verify Report Timestamp**: 2026-09-14T19:52:00Z

---

## Task Completion

All 35 implementation tasks marked complete in `tasks.md`:

| Phase | Count | Status |
|-------|-------|--------|
| Phase 1 — Dead Code Removal (Block 2) | 4 tasks | ✅ Complete |
| Phase 2 — CSS @apply Migration | 7 tasks | ✅ Complete |
| Phase 3 — HTML Inline Class Migration | 13 tasks | ✅ Complete |
| Phase 4 — Variable Block Removal (Block 1) | 5 tasks | ✅ Complete |
| Phase 5 — Regression Test Scope Expansion | 6 tasks | ✅ Complete |

**Task Completion Gate**: PASS ✓ (0 unchecked tasks)

---

## Specification Merged

**Domain**: design-system

### Changes Applied to Main Spec

**Action**: ADDED one new requirement to `openspec/specs/design-system/spec.md`

#### Requirement: Bridge Token Retirement

- **Status**: ADDED (newly declared, completing F6 design-system evolution roadmap)
- **Scope**: Retirement of 9 bridge CSS variables and migration of all consumers to canonical tokens
- **Scenarios**: 7 (all passing per verification report)

The new requirement enforces:
1. Zero bridge token references in `frontend/src/` source tree
2. Clean Tailwind 4 build with no unknown-utility warnings
3. Regression test coverage across full `frontend/src/` path
4. Visual identity preservation (all mappings produce identical color values)

**Spec Composition Tool**: `gentle-ai sdd-archive-compose` (exit 0)  
**Composition Timestamp**: 2026-09-14T14:54:00Z

---

## Artifacts Archived

All artifacts preserved in `openspec/changes/archive/2026-09-14-sc-323-f6-bridge-token-retirement/`:

| Artifact | Size | Status |
|----------|------|--------|
| proposal.md | 5015 B | ✅ Present |
| design.md | 7633 B | ✅ Present |
| specs/design-system/spec.md | 4306 B | ✅ Present (delta spec) |
| tasks.md | 7499 B | ✅ Present (35/35 complete) |
| apply-progress.md | 7194 B | ✅ Present |
| verify-report.md | 5795 B | ✅ Present |

**Move Method**: `git mv` (tracked by git)  
**Archive Directory**: `openspec/changes/archive/2026-09-14-sc-323-f6-bridge-token-retirement/`

---

## Final State Authority

### Sources Ranked by Authority

1. **Persisted tasks artifact** (`tasks.md`): 35/35 complete ✓
2. **Explicit final-state facts** (launch prompt): PASS verdict from sdd-verify ✓
3. **Verify-report** (intermediate snapshot): PASS, 7/7 scenarios, 0 CRITICAL/WARNING ✓

All sources agree: implementation is complete, verified, and ready for merge.

### Contradictions Resolved

**Suggestion in verify-report** (non-blocking): "Collateral openspec deletions in Phase 4 commit"

- **Observation**: Commit `4ae7507` (Phase 4) included 11 unrelated `openspec/changes/back/` and `openspec/changes/infra/` file deletions alongside sc-323 changes.
- **Assessment**: Intentional deletions already merged to feature branch; audit trail shows sc-323 commit containing non-sc-323 openspec changes.
- **Risk**: None functional; no blocking defect.
- **Recommendation** (from verify-report): Consider rebasing before main merge if clean commit history is required. Not a blocker for archive.
- **Archive Decision**: DOCUMENTED but not a blocker. User (orchestrator) retains control of commit history cleanup via rebase before merge.

---

## Design Decisions Verified

| Decision | Verification | Evidence |
|----------|---|----------|
| **D1** — Phase ordering (strict dependency) | PASS | git log shows 49ad25f (P1) → 9874bbb (P2) → 85c32b3 (P3) → 4ae7507 (P4) → fe8241b (P5); Phase 2 strictly precedes Phase 4 |
| **D2** — Token mapping (mechanical, identical hex) | PASS | `brand-primary=#7C3AED`, `prio-high=#EF4444`, `status-resuelto=#10B981` confirmed in `_variables.css` |
| **D3** — `_badges.css` scope (canonical-only) | PASS | `_badges.css` uses canonical tokens; no bridge consumers; `.badge-status-*` class names are not bridge token references |

---

## Coverage by Spec Scenario

| Scenario | Task Mapping | Verification Result |
|----------|---|---|
| 1 — Build succeeds after full retirement | T1.1–T1.4, T4.1–T4.5 | ✅ PASS: `pnpm build` exit 0 |
| 2 — Expanded regression test catches bridge refs | T5.1–T5.6 | ✅ PASS: `jest` 613/613; BANNED_GLOBAL includes `brand-navy` |
| 3 — CSS @apply consumers produce identical output | T2.1–T2.7 | ✅ PASS: 4 CSS files migrated; `@apply brand-navy` → `@apply brand-primary`; hex match confirmed |
| 4 — Inline HTML class replacements preserve output | T3.1–T3.13 | ✅ PASS: 9 HTML files migrated; `grep brand-navy` = 0 |
| 5 — Dead-code block removal leaves build green | T1.1–T1.4 | ✅ PASS: `--color-status-*` removed; `pnpm build` exit 0 |
| 6 — Bridge variable block removed with zero consumers | T4.1–T4.5 | ✅ PASS: `--color-brand-*` removed; `grep brand-navy` frontend/src/styles/ = 0 |
| 7 — pending/pendiente naming trap resolved | T1.1–T1.4 | ✅ PASS: `--color-status-pending` (dead) absent; `--color-status-pendiente` (canonical) present; no confusing comments |

---

## Known Issues & Deviations

### Accepted Deviations (from verify-report)

1. **Auth files migrated status tokens not enumerated in task spec**
   - **Reason**: Implied by T3.12 grep gate; same color mapping, correct direction
   - **Status**: ACCEPTABLE — implementation correct

2. **`clients-list.html` had zero `brand-navy` refs**
   - **Reason**: CSS consumer migrated in Phase 2 (T2.4); HTML task scoped to actual refs
   - **Status**: ACCEPTABLE — no missed consumers

3. **Phase 5 split into 2 describe blocks (global + shell-only)**
   - **Reason**: `bi bi-` (Bootstrap Icons) has legitimate use in 7+ feature components; global ban would break existing badges
   - **Status**: ACCEPTABLE — architecture-correct split

4. **Comment rewrites in Phase 4**
   - **Reason**: Required to pass Phase 5 regression scan (documentation churn only)
   - **Status**: ACCEPTABLE — no behavior change

---

## Rollback Instructions

If this change must be reverted:

1. Restore from git: `git revert <pr-commit-hash>` or `git reset --hard <pre-merge-commit>`
2. This restores all 9 bridge variables and undoes all migrations
3. No data migration, no API change, no state to unwind
4. **Estimated rollback time**: <5 minutes (single atomic operation)

---

## Closure State

- ✅ All 35 tasks verified complete
- ✅ All 7 spec scenarios passing
- ✅ Zero CRITICAL or WARNING issues
- ✅ Build passing (exit 0, Tailwind compiles cleanly)
- ✅ Test suite passing (613/613 tests)
- ✅ Main spec merged and updated
- ✅ Change folder archived with all artifacts
- ✅ Regression test expanded and verified

**SDD Cycle Status**: COMPLETE

---

## Key Learnings

1. Bridge token retirement required strict phase ordering because Tailwind 4 hard-fails on unknown utilities in @apply directives.
2. Mechanical find-replace with identical hex values ensured zero visual regression across 16 files.
3. Expanded regression test scope to `frontend/src/` (not just `layout/`) caught all remaining bridge references.
4. Task deviations (additional status token migrations) were acceptable because they met the intent and passed the grep gate.
5. Architecture split (global vs. shell-only regression test) prevented breaking legitimate Bootstrap Icons usage in feature components.
