# Archive Report: T6 — GeoReporta Parity Gaps

**Change**: t6-georepota-parity  
**Status**: ARCHIVED  
**Date**: 2026-08-24  
**Archived to**: `openspec/changes/archive/2026-08-24-t6-georepota-parity/`

---

## Executive Summary

✅ **ARCHIVED — SDD Cycle Complete**

T6 GeoReporta parity change has been fully implemented, verified, and archived. 55+ tasks completed. All 30 spec scenarios validated via e2e testing (100% compliant). Migrations 0025-0029 deployed to Supabase. Backend code is production-ready.

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| parity | Created | 18 scenarios (S1-S18) covering T6.1-T6.8 gaps, 30 total requirement scenarios |

**Main Spec Location**: `openspec/specs/parity/spec.md`  
**Delta Spec Location**: `openspec/changes/archive/2026-08-24-t6-georepota-parity/specs/parity/spec.md`

---

## Archive Contents

✅ **proposal.md** — T6 change intent, scope, 23 parity gaps, RBAC permissions  
✅ **specs/parity/spec.md** — 18 requirements with Given/When/Then scenarios  
✅ **design.md** — Architecture decisions, file changes table, codegraph findings  
✅ **tasks.md** — 55+ tasks (T6.1–T6.8) all marked [x] complete  
✅ **apply-progress.md** — 8 bugs fixed, test results (823 unit + 242 e2e), files changed  
✅ **verify-report.md** — PASS verdict, spec compliance matrix (30/30 scenarios), TDD validation  

---

## Test Results Summary

- **Unit Tests**: 823/823 passing (92 suites)
- **E2E Tests**: 242/242 passing (29 suites, including 8 new T6 specs)
- **Strict TDD**: ✅ Complete (6/6 checks passed)
- **Build**: ✅ Clean
- **Typecheck**: ✅ Clean
- **Lint**: ✅ 0 errors, 19 pre-existing warnings (out of scope)

---

## Parity Achievement

| Metric | Before | After |
|--------|--------|-------|
| Backend Parity | 78-82% | 100% |
| GeoReporta Gaps | 23 identified | 0 remaining |
| Spec Coverage | Partial | Complete (all 30 scenarios tested) |

---

## Deployments

**Migrations Deployed to Supabase** (2026-08-24):
- 0025_incidents_soft_delete.sql ✅
- 0026_assignments_soft_delete.sql ✅
- 0027_incidents_metrics_cols.sql ✅
- 0028_users_otp_compliance.sql ✅
- 0029_incident_images.sql ✅

**Backend Branch**: `brydyan/sc-275/fase-6-backend-cierre-de-paridad-georeporta`  
**Status**: Ready for merge to main after code review

---

## Notable Implementation Details

### T6.1 — Notifications + Organizations
- Dual @Get decorator pattern for backward-compatible path aliases
- NotifiedForQueryDto supports location_id OR lat+lng (dual input)
- is_claimable field dynamically computed

### T6.2 — Soft Deletes
- Partial UNIQUE index WHERE deleted_at IS NULL prevents re-assignment conflicts
- All queries filter WHERE deleted_at IS NULL (comprehensive coverage)
- Soft-deleted related data (status_history, assignments) preserved

### T6.3 — Metrics
- claimed_at written on claim()
- resolution_date written on status → 'resolved', cleared on reject
- Feed and export use real column values, not computed

### T6.4 — Assignment Role-Change
- UpdateAssignmentDto extended with role field
- Atomic update of operator_id or role

### T6.5 — Email OTP
- SHA-256 hashing for OTP storage (not plaintext)
- 15-minute TTL via verification_otp_expires_at
- 60-second rate limit preventing resend spam
- terms_accepted_at + terms_version on invitation accept

### T6.6 — Incident Images
- S3 storage via IncidentImageStorageService (mirrors CommentImageStorageService)
- Ownership gates (incident owner or CREATE permission)
- MIME type validation (JPEG, PNG, WebP only)
- FilesInterceptor(limit=5) enforced

### T6.7 — XLSX + Feed Recovery
- exceljs streaming for memory-efficient export
- @Get('exportar') alias for backward compatibility
- FeedRecoveryService with @Cron('0 3 * * *') daily rebuild
- SSE tombstone endpoint returns 410 Gone

### T6.8 — Path Aliases + GDPR
- Dual @Get routes for menus/my, invitations paths, /estados alias
- GDPR user soft delete with comprehensive PII wipe:
  - firstName = 'Usuario eliminado'
  - email = 'deleted+{id}@tase.invalid'
  - avatarUrl, passwordHash, deviceUuid, OTP fields nulled
- POST /register returns 410 Gone (invitation-only)

---

## Known Limitations / Out of Scope

- **Firebase auth elimination**: Not ported (intentional, per GeoReporta audit)
- **Open registration**: Removed (intentional, invitation-only model)
- **SSE events**: Replaced with Socket.IO (tombstone pattern)
- **Locations domain**: Not ported (intentional, geo_zones used instead)
- **Email SMTP**: Not tested in e2e (outbox Redis Stream functional, SMTP is infra)

These are documented as intentional exclusions, not implementation gaps.

---

## Issues Summary

**CRITICAL**: None  
**WARNING**: None  
**SUGGESTION**: None  

---

## Next Steps

1. **Code Review**: Branch ready for review at `brydyan/sc-275/fase-6-backend-cierre-de-paridad-georeporta`
2. **Merge to Main**: Proceed when approved
3. **Frontend Port**: Fase 7 can now begin (all backend parity complete)
4. **Supabase Verify**: Confirm migrations 0025-0029 applied and working

---

## SDD Cycle Metrics

| Phase | Status | Duration | Output |
|-------|--------|----------|--------|
| Proposal | ✅ | — | 1 proposal.md |
| Spec | ✅ | — | 18 scenarios, 30 requirement scenarios |
| Design | ✅ | — | Architecture decisions, file changes table |
| Tasks | ✅ | — | 55+ tasks |
| Apply | ✅ | — | 823 unit + 242 e2e tests, 8 bugs fixed |
| Verify | ✅ PASS | — | 30/30 scenarios COMPLIANT |
| Archive | ✅ | — | This report |

**Total Effort**: ~55 hours (estimated from task breakdown)  
**Actual Effort**: Completed in 2 sessions (session 1: spec/design/tasks/apply; session 2: verify/archive)

---

## Artifacts Preserved

All SDD artifacts preserved in archive for audit trail:

```
openspec/changes/archive/2026-08-24-t6-georepota-parity/
├── proposal.md
├── specs/parity/spec.md
├── design.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md (this file)
```

**Archive is immutable — source of truth for this change is locked in time.**

---

## Source of Truth Updated

**New main spec created**: `openspec/specs/parity/spec.md`

This spec now serves as the reference for all future changes related to GeoReporta parity. Any future enhancements or fixes should reference this spec as baseline.

---

## Verdict

✅ **ARCHIVED — Ready for Production**

The T6 GeoReporta parity change has successfully completed the full SDD cycle (proposal → spec → design → tasks → apply → verify → archive). All requirements met, all tests passing, all migrations deployed. Backend is at 100% parity with GeoReporta feature set (within intentional scope). Ready to proceed to frontend porting (Fase 7).

**Recommendation**: Merge branch and begin Fase 7 frontend work.
