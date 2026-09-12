# Tasks: F6 — Auditoría de Acceso Menu Entry

**Change**: `2026-09-11-f6-audit-logs-menu`
**Scope**: Backend MENU_MAP edit
**Effort**: S (Small) — ~5 minutes
**Strict TDD**: No (configuration change, not behavioral)

---

## Task Checklist

### Phase 1: Implementation

- [ ] **T.1.1** — Edit `backend/src/modules/menus/menu-map.ts`
  - Add entry to MENU_MAP Record (after Roles, before Organizaciones):
    ```typescript
    'Auditoría de Acceso': {
      route: '/admin/audit-logs',
      requires: 'READ audit-logs',
      icon: 'file-text',
      group: 'GESTIÓN',
      order: 75,
    },
    ```
  - Verify no syntax errors.
  - Effort: 2 minutes.

### Phase 2: Verification

- [ ] **T.2.1** — Run test suite
  - Command: `cd backend && rtk npm test -- menu-map.spec.ts`
  - Expected: All tests pass without modification.
  - Verify:
    - ✓ Icon validator accepts `file-text`.
    - ✓ Order 75 is unique and ascending.
    - ✓ CRITICAL-2 passes (route `/admin/audit-logs` exists in frontend app.routes.ts).
  - If CRITICAL-2 fails: frontend SDD route missing (check proposal).
  - Effort: 2 minutes.

- [ ] **T.2.2** — Lint + typecheck
  - Command: `cd backend && rtk npm run lint && rtk npm run typecheck`
  - Expected: Clean output, no errors.
  - Effort: 1 minute.

### Phase 3: Manual Verification

- [ ] **T.3.1** — Verify master user sees menu
  - Prerequisite: Migration 0053 executed in test BD (permission READ audit-logs exists).
  - Action: Log in as master, navigate to admin sidebar.
  - Verify:
    - ✓ "Auditoría de Acceso" appears in GESTIÓN section.
    - ✓ Icon shows as file-text.
    - ✓ Click navigates to `/admin/audit-logs`.
    - ✓ Positioned after Roles, before Organizaciones.
  - Effort: 3 minutes.

- [ ] **T.3.2** — Verify non-master user doesn't see menu
  - Action: Log in as operator (no READ audit-logs permission).
  - Verify:
    - ✓ "Auditoría de Acceso" does NOT appear.
    - ✓ GESTIÓN section still visible with other items.
    - ✓ No error or 404.
  - Effort: 2 minutes.

### Phase 4: Final Checks

- [ ] **T.4.1** — Verify no regressions
  - Command: `cd backend && rtk npm test`
  - Expected: Full test suite green (no new failures).
  - Effort: 5 minutes.

- [ ] **T.4.2** — Checklist before merge
  - ✓ MENU_MAP entry added.
  - ✓ menu-map.spec.ts all green (no edits needed).
  - ✓ Lint + typecheck clean.
  - ✓ Manual verification passed (master sees, non-master doesn't).
  - ✓ Frontend route `/admin/audit-logs` exists.
  - ✓ Migration 0053 prerequisite documented in PR.
  - Effort: 1 minute.

---

## Dependencies

**Blocking**:
- Migration 0053 (backend/2026-09-11-f6-audit-logs-export) must be merged first.
- Frontend SDD (front/2026-09-11-f6-audit-logs-export) must include route `/app/admin/audit-logs`.

**Non-blocking**:
- This change can merge independently; if prerequisites aren't met, menú just won't render (graceful).

---

## Verification Criteria

| Criterion | How to Verify | Pass |
|-----------|--------------|------|
| Entry exists in MENU_MAP | Read menu-map.ts | ✓ |
| Icon valid (file-text) | menu-map.spec.ts Lucide validator | ✓ |
| Order unique + ascending | menu-map.spec.ts order test | ✓ |
| Route exists (CRITICAL-2) | npm test menu-map.spec.ts | ✓ |
| Master sees menu | Manual login + sidebar check | ✓ |
| Non-master doesn't see | Manual login + sidebar check | ✓ |
| No lint errors | npm run lint | ✓ |
| No typecheck errors | npm run typecheck | ✓ |
| No test regressions | npm test | ✓ |

---

## Effort Breakdown

| Phase | Task | Minutes |
|-------|------|---------|
| 1 | Edit MENU_MAP | 2 |
| 2 | Run tests | 2 |
| 2 | Lint + typecheck | 1 |
| 3 | Manual (master) | 3 |
| 3 | Manual (non-master) | 2 |
| 4 | Final regression | 5 |
| 4 | Checklist | 1 |
| **Total** | | **16 minutes** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Migration 0053 not executed | PR description: "Requires: backend/2026-09-11-f6-audit-logs-export merged + migration 0053 applied" |
| Frontend route missing | Task T.2.1 (CRITICAL-2 test) catches it immediately |
| Icon typo | Test validator rejects non-Lucide icons |
| Order conflict | Test catches duplicates |

---

## Notes

- This is a configuration change, not behavioral code. No TDD RED/GREEN pair needed.
- Tests already exist and are comprehensive — no new specs required.
- The 16-minute effort is conservative; actual implementation is ~5 minutes + CI wait.
- Manual verification (T.3) requires migration 0053 applied; if not, entry exists but won't render (not a test failure, just no visible effect).
