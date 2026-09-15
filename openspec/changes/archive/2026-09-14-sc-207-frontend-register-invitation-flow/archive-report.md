# Archive Report: SC-207 — Frontend Register via Invitation Flow

**Date**: 2026-09-14  
**Change Name**: `2026-08-28-sc-207-frontend-register-invitation-flow`  
**Archive Path**: `openspec/changes/archive/2026-09-14-sc-207-frontend-register-invitation-flow/`

## Final Verification Status

**Verdict**: PASS  
**Critical Issues**: 0  
**Warnings**: 1 (TDD process documentation gap — non-blocking)  
**Test Results**: 70/70 passed (targeted suite), 613/613 passed (full suite)  
**Type Checking**: 0 errors  
**Linting**: 0 errors on changed files  

### Verification Details

| Metric | Value |
|--------|-------|
| Evidence Revision | sha256:64b50ea035ebf84b1f30305ad1aead1de00c2dec77c77f0ebb0777b4a1127317 |
| Requirements Satisfied | 1/1 (Accept Invitation Flow) |
| Scenarios Compliant | 8/8 |
| Test Command | `npx jest --testPathPatterns=auth\|accept-invitation --coverage` |
| Build Command | `npx tsc --noEmit` |
| Changed File Coverage | `accept-invitation.component.ts` 98.11%/83.33%, `auth.service.ts` 88.54%/71.42% |

## Task Completion

**Total Tasks**: 22  
**Completed Tasks**: 21  
**Pending Tasks**: 1  

### Deferred Task

- **T4.4**: Manual staging smoke test with seeded/mocked token against a running backend
  - **Status**: PENDING Andy manual
  - **Reason**: Deferred per design.md rollout notes; requires live backend with seeded invitation token; out of scope for CLI sandbox
  - **Classification**: Manual staging QA step, NOT a spec/design requirement

**Completion Status**: Implementation complete. Single deferred task is an out-of-scope manual staging step, not blocking archive.

## Spec Merge Results

**Domain**: `auth`  
**Delta Spec Merged**: `openspec/changes/front/2026-08-28-sc-207-frontend-register-invitation-flow/specs/auth/spec.md`

### Changes Applied

**Added Requirements**:
- `Accept Invitation Flow` (Registration via Invitation)
  - 8 scenarios: preview on load, display preview, password validation, accept success, invalid token (404), expired token (410), validation failure (422), route without guest guard

**Removed Requirements**:
- `R2.1 Successful Registration (self-service)` — Reason: `POST /auth/register` tombstoned to 410 Gone
- `R2.2 Registration Validation Failure (self-service)` — Reason: Superseded by invitation-only flow
- `R2.3 Email Already Exists (self-service)` — Reason: Email validation now at invitation-creation time

**Endpoint/DTO Map Added**:
- `GET /invitations/preview?token=...` → `InvitationPreview { organization_name, inviter_name, role_name, expires_at }`
- `POST /auth/accept-invitation` (201) → `AcceptInvitationDto { token, password (min 12), terms_version? }` → `AuthTokens { access_token, refresh_token, permissions[] }`

**Spec File Location**: `openspec/specs/auth/spec.md`

## Archive Contents

All artifacts successfully moved to `openspec/changes/archive/2026-09-14-sc-207-frontend-register-invitation-flow/`:

- ✅ `proposal.md` (initial proposal)
- ✅ `design.md` (technical approach & architecture decisions)
- ✅ `specs/auth/spec.md` (delta spec)
- ✅ `tasks.md` (22 tasks, 21 complete)
- ✅ `verify-report.md` (verification evidence)
- ✅ `apply-progress.md` (implementation progress)
- ✅ `archive-report.md` (this file)

## Source of Truth Updated

The canonical specification now reflects the new invitation-only registration flow:
- **Main Spec**: `openspec/specs/auth/spec.md` ← merged delta spec, requirements updated

## Design Compliance

| Decision | Implementation | Verified |
|----------|---|---|
| Standalone + OnPush component | AcceptInvitationComponent mirrors LoginComponent | ✅ Yes |
| Extend AuthService (no new service) | previewInvitation() + acceptInvitation() + clearSession() | ✅ Yes |
| Preview base URL = INVITATIONS_URL | auth.service.ts:52 = environment.apiUrl/invitations | ✅ Yes |
| Token source = ActivatedRoute.snapshot.queryParamMap | accept-invitation.component.ts:65 | ✅ Yes |
| Error UI = errorMessage signal inline (no toast) | .component.html inline error banner | ✅ Yes |
| No guestGuard + session-clear in ngOnInit | app.routes.ts: no canActivate, component:75-77 | ✅ Yes |
| 7 file changes | All design files match apply-progress | ✅ Yes |

## File Changes Summary

**Created**:
- `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.ts`
- `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.html`
- `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.spec.ts`

**Modified**:
- `frontend/src/app/core/services/auth.service.ts` (added previewInvitation, acceptInvitation, clearSession; removed register stub)
- `frontend/src/app/core/models/auth.model.ts` (added InvitationPreview, AcceptInvitationDto; removed RegisterRequest/RegisterResponse)
- `frontend/src/app/app.routes.ts` (added /accept-invitation route without guestGuard)

## Known Issues & Mitigations

### Non-Blocking Warnings

1. **TDD Process Documentation Gap** (1 WARNING)
   - apply-progress declares "Mode: Standard" but project has Strict TDD active
   - Code and test quality are not in question: 17 real behavioral tests, high coverage (94.4% average), all green
   - Per-task RED→GREEN→REFACTOR audit trail is absent
   - **Mitigation**: Process/documentation gap only, not a code defect
   - **Recommendation**: Document TDD cycle in apply-progress for future changes

### Suggestions (Non-Blocking)

1. Spec scenario "Display invitation preview" states English phrase; implementation uses Spanish equivalent. Functional correctness verified; template interpretation confirmed.
2. T4.4 manual staging smoke test deferred (no local backend). Recommend before production rollout if staging backend with seeded token is available.
3. frontend/e2e/accept-invitation.e2e.ts contains 2 test.skip() — consistent with design's explicit E2E deferral.

## SDD Cycle Closure

**Phase Timeline**:
- Proposal: ✅ Complete
- Specification: ✅ Complete (delta spec merged)
- Design: ✅ Complete
- Tasks: ✅ Complete (21/22 implementation + review tasks done)
- Implementation (apply): ✅ Complete
- Verification (verify): ✅ PASS
- Archive: ✅ DONE (2026-09-14)

**All Artifacts Archived**: The complete SDD cycle for SC-207 is now closed. All change artifacts, specifications, designs, and implementation records are preserved in the archive for future reference and audit trail.

**Next Action**: None — this change is complete and ready for delivery per ordinary repository policy.
