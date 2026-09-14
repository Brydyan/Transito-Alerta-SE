# Tasks: F6 — Auditoría de Acceso Menu Entry

**Change**: `2026-09-11-f6-audit-logs-menu`
**Scope**: Backend MENU_MAP edit
**Effort**: S (Small) — ~5 minutes
**Strict TDD**: No (configuration change, not behavioral)

---

## Task Checklist

### Phase 1: Implementation

- [x] **T.1.1** — Edit `backend/src/modules/menus/menu-map.ts`
  - Add entry to MENU_MAP Record. [DEVIATION: used `order: 85` per design.md D3 + proposal.md + spec.md R3 + matching front change (2026-09-11-f6-audit-logs-menu), NOT `order: 75` as tasks.md snippet specified. tasks.md + spec.md R1 + spec.md Scenario 4 mention 75 (likely typos) and conflict with the rest of the contract. Inserted between Organizaciones (80) and Categorías (90), not between Roles and Organizaciones.]
    ```typescript
    'Auditoría de Acceso': {
      route: '/admin/audit-logs',
      requires: 'READ audit-logs',
      icon: 'file-text',
      group: 'GESTIÓN',
      order: 85,
    },
    ```
  - Verify no syntax errors.
  - Effort: 2 minutes.

### Phase 2: Verification

- [x] **T.2.1** — Run test suite
  - Command: `cd backend && rtk jest --testPathPatterns='menu-map\.spec\.ts'`
  - Expected: All tests pass without modification. ✓ (1059/1059 across full backend suite; menu-map.spec.ts unchanged)
  - Verify:
    - ✓ Icon validator accepts `file-text`.
    - ✓ Order 85 is unique and ascending (60 < 70 < 80 < 85 < 90).
    - ✓ CRITICAL-2 passes (route `/admin/audit-logs` exists in frontend app.routes.ts — segments `admin` and `audit-logs` both present).
  - If CRITICAL-2 fails: frontend SDD route missing (check proposal).
  - Effort: 2 minutes.

- [x] **T.2.2** — Lint + typecheck
  - Command: `cd backend && rtk npm run lint && rtk npm run typecheck`
  - Expected: Clean output, no errors. ✓ (lint: 0 errors, 27 pre-existing warnings unrelated; typecheck: clean exit 0).
  - Effort: 1 minute.

### Phase 3: Manual Verification

- [ ] **T.3.1** — Verify master user sees menu [PENDING: manual verification required]
  - Prerequisite: Migration 0053 executed in test BD (permission READ audit-logs exists). ✓ Migration present at `database/migrations/0053_audit_logs_permission.sql`.
  - Action: Log in as master, navigate to admin sidebar. [PENDING — requires browser session; builder cannot run in sandbox]
  - Verify:
    - ✓ "Auditoría de Acceso" appears in GESTIÓN section. [Pending Andy manual]
    - ✓ Icon shows as file-text. [Pending Andy manual]
    - ✓ Click navigates to `/admin/audit-logs`. [Pending Andy manual]
    - ✓ Positioned after Organizaciones (order 85), before Categorías. [Pending Andy manual]
  - Effort: 3 minutes.

- [ ] **T.3.2** — Verify non-master user doesn't see menu [PENDING: manual verification required]
  - Action: Log in as operator (no READ audit-logs permission). [PENDING — requires browser session; builder cannot run in sandbox]
  - Verify:
    - ✓ "Auditoría de Acceso" does NOT appear. [Pending Andy manual]
    - ✓ GESTIÓN section still visible with other items. [Pending Andy manual]
    - ✓ No error or 404. [Pending Andy manual]
  - Note: existing `menus.service.spec.ts` "full-permission user sees every menu entry (10 entries per D4)" test passes because the mock user lacks `READ audit-logs` — providing automated coverage for the non-master path.
  - Effort: 2 minutes.

### Phase 4: Final Checks

- [x] **T.4.1** — Verify no regressions
  - Command: `cd backend && rtk jest`
  - Expected: Full test suite green (no new failures). ✓ (1059/1059 PASS).
  - Effort: 5 minutes.

- [ ] **T.4.2** — Checklist before merge
  - ✓ MENU_MAP entry added.
  - ✓ menu-map.spec.ts all green (no edits needed).
  - ✓ Lint + typecheck clean.
  - ⚠️ Manual verification (T.3.1, T.3.2) PENDING — requires browser session.
  - ✓ Frontend route `/admin/audit-logs` exists.
  - ⚠️ Migration 0053 prerequisite documented in PR — call out in PR description.
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
