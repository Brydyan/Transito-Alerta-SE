# Archive Report: back/2026-10-15-user-status-notif-channel

**Change**: `back/2026-10-15-user-status-notif-channel`
**Archived to**: `openspec/changes/archive/2026-10-15-user-status-notif-channel/`
**Archive Date**: 2026-10-15
**Status**: CLOSED

---

## Summary

User Account Status Toggle & Notification Channel Preference change has been completed, verified, and archived. All implementation tasks were completed and verified with PASS verdict. Deltas were merged into their corresponding main specs, and the active change folder was moved to the archive.

---

## Verification Status

**Verify Verdict**: PASS
- Critical Issues: 0
- Warnings: 0  
- Suggestions: 0
- Re-verify Round: 2

All verification requirements met:
- 18/18 implementation tasks marked complete in tasks.md
- 5/5 spec requirements covered
- 19/19 scenarios validated
- Build clean: typecheck, lint, build all pass
- Tests passing: 47/47 unit (backend) + 75/75 frontend + 9/9 e2e
- No pre-existing test regressions
- TDD compliance: 6/6 checks passed

---

## Task Completion

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Infrastructure | 1.1, 1.2, 1.3 | ✅ 3/3 complete |
| Phase 2: Backend DTO/Service/Controller | 2.1-2.4 | ✅ 4/4 complete |
| Phase 3: Frontend | 3.1-3.4 | ✅ 4/4 complete |
| Phase 4: Tests | 4.1-4.9 | ✅ 7/7 complete |
| **Total** | **18 tasks** | **✅ 18/18** |

---

## Spec Merges

### Merged Deltas

| Delta | Domain | Target | Action | Status |
|-------|--------|--------|--------|--------|
| s1-is-active-toggle.md | users-admin-backend-api | New spec created | ADDED 1 requirement | ✅ |
| s2-notification-channel.md | users-admin-backend-api | (same spec) | ADDED 1 requirement | ✅ |
| s3-frontend-account-status.md | admin-user-creation-form | Existing spec | MODIFIED 1 requirement | ✅ |
| s4-frontend-label-rename.md | admin-user-creation-form | (same spec) | MODIFIED 1 requirement | ✅ |

### Spec Files Updated

- `openspec/specs/users-admin-backend-api/spec.md` — NEW. Defines `Admin Update User` and `Persist Preferred Notification Channel` requirements with 13 scenarios total.
- `openspec/specs/admin-user-creation-form/spec.md` — MODIFIED. Added "Cuenta Section Visibility (Master-only)" and "New-User-Form Label" requirements + 4 new scenarios.

---

## Archive Checklist

- [x] Main specs updated with merged deltas
- [x] Change folder moved to `openspec/changes/archive/2026-10-15-user-status-notif-channel/`
- [x] Archive contains all required artifacts:
  - [x] proposal.md
  - [x] specs/ (4 delta files)
  - [x] design.md
  - [x] tasks.md (all 18 tasks checked)
  - [x] apply-progress.md
  - [x] verify-report.md (PASS)
- [x] Active changes directory no longer has this change
- [x] Archive contents verified and complete

---

## Implementation Summary

**What was built**: 
- Backend: Added `is_active: boolean` toggle and `preferred_notification_channel` field to `PATCH /api/users/:id` endpoint with role-based access control (Master-only) and self-deactivation guard.
- Database: Migration 0033 adds `preferred_notification_channel VARCHAR(20) DEFAULT 'email'` column with rollback support.
- Frontend: New "Cuenta" section in user edit form with active/inactive toggle and notification channel selector (Master-only visibility), plus label rename in new-user-form.
- Tests: 16 new tests (7 unit + 9 e2e) validating all scenarios with 100% pass rate.

**Why this matters**:
- Admins can now deactivate/reactivate user accounts from the UI
- User notification preferences are now persistable (dispatch logic is future work per proposal)
- Stricter role-based access control prevents non-Master users from modifying `is_active`
- Deactivation immediately invalidates active sessions via JWT auth guard

**Risks mitigated**:
- Self-deactivation guard prevents accidental lockout
- Non-Master callers silently ignore `is_active` (defense in depth)
- Migration includes both UP and DOWN for clean rollback
- Pre-existing test suite (133 suites, 1417 tests) remains untouched and passing

---

## Key Learnings

1. Spec merge strategy: created new `users-admin-backend-api` domain for backend API requirements separate from UI-focused `users-admin` spec.
2. Delta spec organization: initial spec files (`s1-*.md`, `s2-*.md`) were reorganized by domain before composition to match openspec convention.
3. Self-deactivation guard required 4-arg service signature with `callerRole` passed from controller, adding minimal surface area for role-based logic.
4. JWT enforcement via `is_active = TRUE` filter in `findAuthContextRow` means deactivation takes effect on next authenticated request with no additional work needed.
5. TDD evidence table was added retroactively to apply-progress to meet strict TDD mode requirement (W2 fix from verify round 1).

---

**Archive Status**: CLOSED and ready for history. The SDD cycle is complete.
