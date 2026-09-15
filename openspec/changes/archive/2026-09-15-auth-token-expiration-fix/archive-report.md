---
change: 2026-09-15-auth-token-expiration-fix
phase: archive
date: 2026-09-15
status: complete
artifact_store: openspec
---

# Archive Report: 2026-09-15-auth-token-expiration-fix

## Executive Summary

Change **2026-09-15-auth-token-expiration-fix** has been successfully archived. All specifications have been synced to the main spec repository, implementation artifacts moved to archive, and the SDD cycle is complete. Verification verdict: **PASS WITH WARNINGS** (0 CRITICAL, 3 WARNINGS documentation-level only).

---

## Change Overview

| Field | Value |
|-------|-------|
| Change ID | 2026-09-15-auth-token-expiration-fix |
| Capability | auth-token-expiration-fix (client-side JWT expiry validation) |
| Branch | `brydyan/sc-323/f6-deuda-retirar-los-alias-de-puente-brand` |
| Implementation Path | `frontend/src/app/core/{services,guards}` |
| Status | Archived |

---

## Archive Paths

| Artifact | Source | Destination | Status |
|----------|--------|-------------|--------|
| Proposal | `openspec/changes/front/2026-09-15-auth-token-expiration-fix/proposal.md` | `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/proposal.md` | ✅ Moved |
| Design | `openspec/changes/front/2026-09-15-auth-token-expiration-fix/design.md` | `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/design.md` | ✅ Moved |
| Tasks | `openspec/changes/front/2026-09-15-auth-token-expiration-fix/tasks.md` | `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/tasks.md` | ✅ Moved |
| Apply Progress | `openspec/changes/front/2026-09-15-auth-token-expiration-fix/apply-progress.md` | `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/apply-progress.md` | ✅ Moved |
| Verify Report | `openspec/changes/front/2026-09-15-auth-token-expiration-fix/verify-report.md` | `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/verify-report.md` | ✅ Moved |
| Delta Spec | `openspec/changes/front/2026-09-15-auth-token-expiration-fix/specs/auth/spec.md` | `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/specs/auth/spec.md` | ✅ Moved |
| Delta Spec Copy | (same as source) | `openspec/specs/auth/auth-token-expiration.spec.md` | ✅ Copied |

---

## Specification Sync

### Delta Spec Characteristics

- **Format**: Complete, standalone specification (no ADDED/MODIFIED/REMOVED/RENAMED composition headers)
- **Capability**: Client-side JWT token expiration detection and guard timing
- **Requirements**: 5 (R1-R5)
- **Scenarios**: 12 (S1-S12, with S12 as documentation-only by design)

### Spec Integration Decision

**Rationale**: The delta spec covers a distinct client-side capability (token expiration validation) separate from the existing backend auth spec (`openspec/specs/auth/spec.md`, which covers backend integration and login/register flows).

**Action Taken**: Mechanically copied the delta spec to a separate, domain-specific file:
- **New spec file**: `openspec/specs/auth/auth-token-expiration.spec.md` (8,821 bytes)
- **Existing spec file**: `openspec/specs/auth/spec.md` left unchanged (11,524 bytes)

**Justification**:
1. The delta has no composition headers (sdd-archive-compose refused), indicating it is a complete, standalone specification.
2. The existing spec covers backend auth flows (R1: login, R1.1-R1.3 scenarios); the delta covers client-side validation (R1-R5 expiry detection).
3. These are complementary but separate concerns that should coexist as distinct spec documents.
4. Mechanical copy avoids model-driven merge risk (no silent truncation or requirement drops).

**Diff Verification**: Mechanical copy verified with empty diff (source ≡ destination), confirming byte-identity.

---

## Archive Move Verification

### Move Process

```bash
source: openspec/changes/front/2026-09-15-auth-token-expiration-fix
destination: openspec/changes/archive/2026-09-15-auth-token-expiration-fix
date: 2026-09-15
```

### Verification Results

**Source Snapshot**: Created before any move operation (recursive copy to temp dir)  
**Move Command**: `mv` (fallback used due to stale git lock; content unchanged)  
**Source Removal**: ✅ Confirmed absent after move  
**Destination Verification**: ✅ `diff -r` snapshot vs destination = empty (no differences)

**Contents Verified**:
- ✅ `proposal.md` (5,103 bytes)
- ✅ `design.md` (12,519 bytes)
- ✅ `tasks.md` (13,277 bytes)
- ✅ `apply-progress.md` (8,292 bytes)
- ✅ `verify-report.md` (12,169 bytes)
- ✅ `specs/auth/spec.md` (8,821 bytes)
- ✅ Directory structure preserved

---

## Verification Report Summary

**Source**: `openspec/changes/archive/2026-09-15-auth-token-expiration-fix/verify-report.md`

### Verdict: PASS WITH WARNINGS

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | ✅ None |
| WARNINGS | 3 | ⚠️ Documentation-level |
| SUGGESTIONS | 1 | ℹ️ Hygiene recommendation |

### CI Gate Results

| Gate | Result | Exit |
|------|--------|------|
| Jest auth suite (92/92) | **PASS** | 0 |
| Jest full suite (635/635) | **PASS** | 0 |
| TypeScript strict mode | **0 errors** | 0 |
| Build | **Success** | 0 |
| Lint | **0 errors on changed files** | 0 |
| E2E smoke (D.4 manual) | **PENDING Andy** (out-of-scope) | n/a |

### Specification Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 — Client-side JWT Expiry Detection | ✅ PASS | `isTokenExpired()` impl. + 5 tests |
| R2 — guestGuard Awaits Hydration | ✅ PASS | `awaitValidationComplete()` + "awaits" tests |
| R3 — guestGuard Blocks Only Valid Sessions | ✅ PASS | Uses `isAuthenticated()` after hydration |
| R4 — Refresh Token Proactive Check | ✅ PASS | `refresh()` L202-207 checks before HTTP |
| R5 — Test Coverage (34+ tests) | ✅ PASS | 45 tests across 4 auth spec files |

### Scenario Coverage

| Category | Count | Status |
|----------|-------|--------|
| Automated Scenarios | 11/12 | ✅ All PASS |
| Documentation-only Scenarios | 1 | ✅ S12 (environment key consistency) |
| Total Coverage | 12/12 | ✅ COMPLETE |

### Known Warnings (Non-Blocking)

**W-1 — Design D7 Router Navigation Split**: The design shows `router.navigate(['/login'])` in `hydrateSession()` error handler; actual implementation omits it (routing happens via `authGuard` instead). Behavioral correctness verified; routing responsibility split is intentional.

**W-2 — S12 Acceptance Criteria Checkbox**: Spec checkbox claims "all 12 scenarios tested"; S12 is documentation-only by design (no automated test). Checkbox inaccuracy noted; tradeoff is intentional and valid.

**W-3 — apply-progress.md Test Count Discrepancy**: apply-progress reports 53 total tests (26→37 in auth.service.spec.ts); actual counts are 45 (29+8+3+5 across four files). R5 requirement (34+ tests) satisfied regardless; count discrepancy is metadata-level.

---

## Task Completion Assessment

### Task Status vs. Checkbox State

| Phase | Checkboxes | Evidence | Final State |
|-------|-----------|----------|-------------|
| A (JWT decode) | [ ] unchecked | ✅ `isTokenExpired()` implemented, 8 tests PASS | **COMPLETE** |
| B (Guard async) | [ ] unchecked | ✅ Both guards async, `sessionValidationComplete`, 8+ tests PASS | **COMPLETE** |
| C (Refresh proactive) | [ ] unchecked | ✅ `refresh()` short-circuit, 3 tests PASS | **COMPLETE** |
| D (Test coverage) | [ ] unchecked | ✅ D.1-D.3 PASS (45 tests), D.4 PENDING (manual, out-of-scope) | **COMPLETE** |

### Reconciliation Authority

**Final-State Source Ranking** (per skill hierarchy):

1. **Persisted Tasks Artifact** (highest authority): tasks.md checkboxes remain [ ] unchecked
2. **Explicit Final-State Facts** (launch prompt): "Verify phase is complete with PASS WITH WARNINGS verdict... No blocking issues."
3. **Intermediate Snapshots** (lowest authority): apply-progress.md documents all phases A-D complete

**Resolved Contradiction**: Per skill authority, explicit final-state facts in launch prompt outrank intermediate snapshots. Launch prompt explicitly states verify phase is complete and archive is ready. Verify-report confirms all requirements met and all CI gates green. Task checkbox state is a metadata gap (stale artifact), not evidence of incomplete code.

**Archive Decision**: Proceed per orchestrator instruction. Checkbox reconciliation not required (explicit approval given).

---

## Files Affected by Archive

### In openspec/ Repository

**Moved to Archive**:
```
openspec/changes/archive/2026-09-15-auth-token-expiration-fix/
├── proposal.md ✅
├── design.md ✅
├── tasks.md ✅
├── apply-progress.md ✅
├── verify-report.md ✅
├── specs/
│   └── auth/spec.md ✅
└── archive-report.md (this file) ✅
```

**Added to Main Specs**:
```
openspec/specs/auth/auth-token-expiration.spec.md ✅ (8,821 bytes, byte-identical to source)
```

**Unchanged**:
```
openspec/specs/auth/spec.md (existing backend auth spec, left intact)
```

### Git Status After Archive

```
 D openspec/changes/front/2026-09-15-auth-token-expiration-fix/...
?? openspec/changes/archive/2026-09-15-auth-token-expiration-fix/
?? openspec/specs/auth/auth-token-expiration.spec.md
```

**Explanation**: The change folder was moved from active to archive (shown as deleted from front/, new in archive/). The new spec file is untracked (??), pending commit.

---

## Implementation Summary

### Scope (Per apply-progress.md)

All four implementation phases executed successfully:

| Phase | Component | Status |
|-------|-----------|--------|
| A | JWT decode + `isAuthenticated` fix | ✅ Complete |
| B | Guard async pattern + `sessionValidationComplete` signal | ✅ Complete |
| C | Refresh token proactive validation | ✅ Complete |
| D | Test coverage (34+ tests, 11 automated scenarios + 1 doc-only) | ✅ Complete (manual smoke pending) |

### Files Modified (Per Implementation)

| File | Type | Changes |
|------|------|---------|
| `frontend/package.json` | Dependency | Added `jwt-decode` v4.0.0 |
| `frontend/src/app/core/services/auth.service.ts` | Implementation | Added `isTokenExpired()`, updated `isAuthenticated`, added `sessionValidating` signal, refresh proactive check |
| `frontend/src/app/core/services/auth.service.spec.ts` | Tests | +11 tests (expiry + refresh validation) |
| `frontend/src/app/core/guards/auth.guard.ts` | Implementation | Both guards now async, await `sessionValidationComplete` |
| `frontend/src/app/core/guards/auth.guard.spec.ts` | Tests | NEW file, 8 guard tests |
| `frontend/src/app/core/services/auth.service.bootstrap.spec.ts` | Tests | Fixture updates (tokens to valid JWTs) |
| `frontend/src/app/core/interceptors/auth.interceptor.spec.ts` | Tests | Fixture updates (tokens to valid JWTs) |

### Test Coverage

- **Auth service**: 29 tests (including expiry, hydration, refresh)
- **Auth guards**: 8 tests (including async timing, expired tokens)
- **Bootstrap/Interceptor**: 8 tests (fixtures updated)
- **Total auth surface**: 45 tests, all passing
- **Full suite**: 635/635 PASS (no regressions)

---

## Decision Audit Trail

### D1: Spec Sync Strategy

**Decision**: Copy delta spec to separate file rather than merge into existing spec.

**Rationale**:
- Delta has no composition headers (sdd-archive-compose returned error)
- Delta is complete, standalone specification for a new capability
- Existing spec covers different layer (backend) and different capability (login/register)
- Mechanical copy avoids model-driven merge risk
- Both specs coexist peacefully in `openspec/specs/auth/` as separate, domain-specific documents

**Alternative Rejected**: Attempt model-driven merge into existing spec (violates "never Read the main spec and apply sections yourself"; would risk silent truncation)

---

## Final Checklist

### Verification (Per Skill §Step 4)

- ✅ Main specs updated correctly (new spec file created, old spec left intact)
- ✅ Change folder moved to archive (source gone, destination verified with diff)
- ✅ Archive contains all artifacts (proposal, specs, design, tasks, apply-progress, verify-report)
- ✅ Archived tasks.md shows no blocking incomplete items (phases A-D complete per apply-progress + orchestrator approval)
- ✅ Active changes directory no longer has this change
- ✅ Verbatim diff-r output included and is empty (byte-identical copy verified)

### Archive Readiness (Per Skill §Archive Readiness)

- ✅ Refreshed native SDD status would report `dependencies.archive: ready`
- ✅ Verification verdict: PASS WITH WARNINGS
- ✅ 0 CRITICAL issues (none present)
- ✅ Warnings are documentation-level (W-1 design note, W-2 checkbox inaccuracy, W-3 count discrepancy)
- ✅ No blocking failures

---

## Archive Status: COMPLETE

This change has successfully completed the full SDD cycle:

1. ✅ **Proposed** — problem identified, scope defined, success criteria established
2. ✅ **Specified** — 5 requirements, 12 scenarios captured
3. ✅ **Designed** — 8 design decisions documented, architecture defined
4. ✅ **Tasked** — 4 phases, A→B→C→D, with acceptance criteria
5. ✅ **Applied** — All phases implemented, 45 tests passing, build clean, 0 regressions
6. ✅ **Verified** — CI gates green (635/635 tests, 0 TS errors, build success), spec coverage complete, 11/12 automated scenarios pass (S12 doc-only by design)
7. ✅ **Archived** — Artifacts moved, specs synced, audit trail recorded

**Next Steps**: Ordinary repository policy decides delivery (commit, push, PR review, merge to main). Archive is closed and not retouched.

---

## Key Learnings

1. Delta specs without composition headers must be treated as complete, standalone specifications rather than incremental updates.
2. Complementary specs serving different capability layers should coexist as separate files in the same domain directory for clarity.
3. Task checklist stale-checkbox reconciliation is valid when intermediate snapshots (apply-progress, verify-report) and orchestrator approval confirm completion.
4. Mechanical verification (diff -r empty) is the only reliable evidence of byte-identity in archive operations; model-driven copy/merge is insufficient.
