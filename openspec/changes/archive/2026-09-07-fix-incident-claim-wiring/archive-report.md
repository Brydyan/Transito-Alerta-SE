# Archive Report: Fix `claim` wiring — la acción reclama de verdad

**Change**: 2026-09-07-fix-incident-claim-wiring
**Archiver**: Claude (SDD Archive Executor)
**Archive Date**: 2026-09-06
**Project**: Transito-Alerta-SE
**Artifact Store**: hybrid (openspec + Engram)
**Status**: CLOSED — Ready for Production

---

## Executive Summary

The frontend incident claim action wiring defect has been successfully fixed and archived. The root cause was identified in ronda 6 of the parent F3 incidents module verification: `onAction('claim')` was calling the wrong backend endpoint (`PATCH /incidents/:id/status`), which never writes `claimed_by`, leaving the workflow chain permanently broken. This follow-up change correctly wired claim to the dedicated `POST /incidents/:id/claim` endpoint and added proper test assertions. Verification completed across rondas 6–8 with final PASS (0 CRITICAL / 0 WARNING on ronda 8). All gates passed: 60/60 suites, 419/419 tests; build exit 0; typecheck 0 errors in incident files.

---

## Root Cause and Fix

### The Defect

**Component**: `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts`

The `onAction('claim')` handler routed to `runStatusTransition()`, which called:
```
PATCH /incidents/:id/status
{ status: 'in_progress' }
```

This endpoint is correct for `resolve` and `close` actions (which have no dedicated backend routes), but for `claim` it is wrong. The backend's `PATCH /incidents/:id/status` route updates only the `status` field and returns it via `RETURNING status`. It never touches `claimed_by`.

**Consequence**: Users could see a "Claim" button (gate `hasClaim` was correct in ronda 5), click it, receive a success UI response, but the backend would not record who claimed the incident. The `claimed_by` field remained `null`, making `release` and `resolve` (which check `claimed_by === currentUserId`) permanently unavailable.

**Evidence**: Ronda 6 verification examined the SQL in `incident-workflow.service.ts:322-330`:
```sql
UPDATE incidents 
  SET status = $1, updated_at = NOW() 
  WHERE id = $2 AND status = $3
  RETURNING *
```
No `claimed_by` assignment. Meanwhile, the dedicated endpoint at `incident-workflow.controller.ts:34-42` does:
```sql
UPDATE incidents 
  SET claimed_by = $1, claimed_at = NOW() 
  WHERE id = $2 AND claimed_by IS NULL
```
Atomic, validates organization and active claim limits, returns 409 if already claimed.

### The Fix

**New Method**: `IncidentService.claimIncident(id: string): Observable<ClaimReleaseResult>`
- Calls `POST /incidents/${id}/claim` with empty body `{}`
- Receives `ClaimReleaseResult` (7 fields: `id`, `status`, `claimed_by`, `claimed_at`, `released_by`, `released_at`, `resolved_at`)
- Merges response into cache using same pattern as `releaseIncident()`
- Identical to `releaseIncident()` — demonstrates this was a wiring gap, not a type/capability gap

**Component Update**: `incident-detail.component.ts`
- Separated `case 'claim'` from `runStatusTransition()`
- Now calls `this.incidentService.claimIncident(inc.id)`
- Merges partial response into signal: `this.incident.update(cur => cur ? { ...cur, ...claimed } : cur)`
- Handles errors (409 `INCIDENT_ALREADY_CLAIMED`, 429 `CLAIM_LIMIT_REACHED`, 403 `WRONG_ORGANIZATION`) → toast + reload via `getIncident()`

**Test Assertions** (fixes that were missing):
- `incident.service.spec.ts`: Added `claimIncident()` test with assertion `claimed_by === 'user-1'` and preservation of non-delta fields
- `incident-detail.component.spec.ts`: Replaced mocked `updateIncidentStatus` (which proved the old wiring) with mocked `claimIncident`; added explicit assertion `expect(component.incident()?.claimed_by).toBe('user-1')`

**Authorization Fix Bonus**: The `operador_sistema` role (`READ`, `CLAIM`, `RELEASE` incidents without `UPDATE incidents`) could now claim incidents successfully. Ronda 5 changed the gate to `hasClaim` (aligning with the permission name of the endpoint that SHOULD be used) but the actual call still routed to the wrong endpoint (which required `UPDATE`). Now button visibility and endpoint authorization are aligned.

---

## Spec Sync Status

**Delta Spec Declaration**: **NO DELTA**

The delta spec (`openspec/changes/archive/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/spec.md`) explicitly declares no behavioral change to the requirements. Verification confirms:

| Claim | Verification | Result |
|-------|--------------|--------|
| Scenario "Reclamar" already exists in main spec | Found at `openspec/specs/frontend-incidents/spec.md:67-68` (exact match to delta) | ✅ Confirmed |
| Main spec text: "queda asignada al usuario actual" | Text preserved; implementation now fulfills it | ✅ Confirmed |
| No changes to `workflow.util.ts` gate | Gate `hasClaim = permissions.includes('CLAIM incidents')` already aligned; fix only connects wiring | ✅ Confirmed |
| No changes to `resolve`/`close` | Both correctly use `PATCH /incidents/:id/status`; no dedicated backend endpoint for those | ✅ Confirmed |
| No changes to backend or migrations | Endpoint `POST /incidents/:id/claim` pre-existed; SQL migrations untouched | ✅ Confirmed |

**Conclusion**: Main spec `openspec/specs/frontend-incidents/spec.md` requires **NO CHANGES**. The delta spec is a documentation artifact affirming SDD convention compliance, not a behavior-change declaration.

---

## Implementation Details

### Files Modified (4 production files + 2 test files + 2 SDD artifacts)

**Production Code**:
1. `frontend/src/app/core/services/incident.service.ts` — Added `claimIncident()` method (30 lines)
2. `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` — Separated `case 'claim'` from `runStatusTransition()`, now calls `claimIncident()` (29 lines net change)

**Test Files**:
3. `frontend/src/app/core/services/incident.service.spec.ts` — New test: `claimIncident()` with 7-field assertion + negative assertions + cache merge (59 lines)
4. `frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts` — Replaced 2 mocked tests: success claim (explicit `claimIncident` call verification + `claimed_by` assertion) and error claim (409 handling) (62 lines net change)

**SDD Artifacts**:
5. `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/spec.md` — Delta spec declaring NO DELTA (79 lines); closed ronda 7 WARNING
6. `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/apply-progress.md` — Implementation journey and mutation testing results

### Mutation Testing Results

| Mutation | Effect | Detector |
|----------|--------|----------|
| Revert `case 'claim'` to `runStatusTransition(inc.id, 'in_progress')` | 2 tests fail immediately | ✅ `incident-detail.component.spec.ts` (both claim scenarios) |
| Remove `claimIncident()` call | 1 test fails | ✅ `incident.service.spec.ts` test of `claimIncident` |

All tests restored after mutation. Defect is detectable.

---

## Verification Gates (Ronda 8 — Final)

Executed from `frontend/` directory:

| Command | Result | Status | vs. Ronda 7 |
|---------|--------|--------|-------------|
| `pnpm test` | **60 suites / 419 tests PASS** | ✅ Green | Identical (code unchanged) |
| `pnpm run build` | **exit 0** (4.20s) | ✅ Green | Identical |
| `npx tsc -b --noEmit --force` | **9 pre-existing errors in 3 non-incident files; 0 in this change** | ✅ Green | Identical |

**Pre-existing TypeScript Errors** (not caused by this change):
- `auth.service.spec.ts` (1 error)
- `placeholder.component.spec.ts` (4 errors in `@ts-expect-error` directives unused)
- `layout-tokens.regression.spec.ts` (5 errors in `fs.readdirSync` signature)

**Note on `tsc` Caching**: `npx tsc -b --noEmit` without `--force` returns false-positive "0 errors" due to build-mode incremental cache. Must use `--force` or clear `.tsbuildinfo` for accurate results. This is a pre-existing CI/gate gap, documented as carry-forward for `front/2026-09-03-tool-ci-gates`.

**Missing Gate**: `pnpm lint` does not exist in this repo. Gap is pre-existing, owned by `front/2026-09-03-tool-ci-gates`.

---

## Archive Contents

Archived directory: `/openspec/changes/archive/2026-09-07-fix-incident-claim-wiring/`

Files preserved (byte-for-byte):
- `proposal.md` — Change rationale, scope, root cause, why separate from F3
- `specs/frontend-incidents/spec.md` — Delta spec (NO DELTA declaration, SDD convention compliance)
- `tasks.md` — 4 phases × 2–4 tasks each; all marked complete
- `apply-progress.md` — Implementation phases, mutation testing, ronda 7 SDD remediation
- `archive-report.md` — This file

Total artifact footprint: 5 files, ~800 lines of specification and implementation narrative.

---

## Carry-Forward Notes for Future Work

### 1. TypeScript Incremental Cache Issue (`front/2026-09-03-tool-ci-gates`)

**Problem**: `npx tsc -b --noEmit` without `--force` reports "0 errors" even when `.tsbuildinfo` contains evidence of 9 errors from previous builds.

**Workaround**: Always use `--force` in CI gates, or delete `.tsbuildinfo` before each run.

**Owner**: `front/2026-09-03-tool-ci-gates` (tool CI setup).

### 2. Missing ESLint Gate (`front/2026-09-03-tool-ci-gates`)

**Problem**: `pnpm lint` script does not exist in `frontend/package.json`. No linting is run in SDD verification gates.

**Impact**: Code style regressions go undetected in verification phases.

**Owner**: Same as above.

### 3. Permission Alignment in F3 (Closed by This Change)

The `operador_sistema` role now has functional claim/release capabilities. Previously, the gate showed the button but the backend rejected the action (403). This alignment was a hidden defect exposed by ronda 6 and fully resolved by this change.

---

## Verification History

| Ronda | Context | Verdict | Key Finding |
|-------|---------|---------|-------------|
| 6 | F3 verification | FAIL (CRITICAL) | `claim` endpoint wiring broken; defect traced to 5+ prior audits not catching it |
| 7 | Ronda 6 fixes applied; spec artifact missing | PASS (WARNING) | WARNING: `spec.md` missing from change directory; recommendation: create `spec.md` declaring NO DELTA |
| 8 | `spec.md` delta artifact provided | **PASS (0 CRITICAL / 0 WARNING)** | Delta spec honest; no regresion; ready to archive |

**Ronda 7 Warning Closure**: The `spec.md` file addresses the SDD convention violation raised in ronda 7. Ronda 8 confirms the file is present, accurate, and properly documents the "no delta" status.

---

## Archival Checklist

- [x] All artifacts read from source (4 files: proposal, tasks, apply-progress, delta spec)
- [x] Delta spec status verified (NO DELTA; main spec requires no changes)
- [x] All artifacts copied to archive directory (byte-for-byte)
- [x] Archive location verified: `openspec/changes/archive/2026-09-07-fix-incident-claim-wiring/`
- [x] Archive report written and integrated
- [x] Verification verdict confirmed (Ronda 8: PASS, 0 CRITICAL / 0 WARNING)
- [x] No CRITICAL or WARNING issues blocking archival
- [x] Source folder still exists at `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/` (awaits `git rm` after verification)

---

## Source Folder Cleanup

**Status**: Source folder **still exists** at `/openspec/changes/front/2026-09-07-fix-incident-claim-wiring/`.

**Next Step**: Run `git rm -rf openspec/changes/front/2026-09-07-fix-incident-claim-wiring/` to complete the move operation. This must be done by the user in a final git commit after this archive is verified.

**Verification Completed**: Content has been byte-for-byte copied to archive. No content loss detected in the archive (all 4 files present with correct paths and structure).

---

## Recommendations

1. **Immediate**: Run `git rm -rf openspec/changes/front/2026-09-07-fix-incident-claim-wiring/` to finalize archival
2. **Short-term**: Address `front/2026-09-03-tool-ci-gates` to fix TypeScript cache and add ESLint gate
3. **Medium-term**: Consider mutation testing framework for permanent regression detection (this change was audited via manual mutation; automation would catch similar issues earlier)

---

## Artifact Traceability

All SDD artifacts for this change are preserved in the archive:

- **Proposal** (`proposal.md`): Documents the F3 follow-up rationale, root cause, and scope
- **Tasks** (`tasks.md`): Lists 4 implementation phases with 11 specific tasks (all completed)
- **Delta Spec** (`specs/frontend-incidents/spec.md`): Declares NO DELTA; affirms SDD convention compliance
- **Apply Progress** (`apply-progress.md`): Records implementation journey, mutation testing, ronda 7 remediation
- **This Report** (`archive-report.md`): Synoptic closure document with verification history and carry-forward items

The change is now **ARCHIVED and CLOSED**. Ready for deployment.

---

**Archive Date**: 2026-09-06
**Archived By**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Change**: 2026-09-07-fix-incident-claim-wiring
**Status**: CLOSED — Ready for Production

*Cycle Complete: Proposal → Spec → Design → Tasks → Apply → Verify (Rondas 6–8) → Archive ✅*
