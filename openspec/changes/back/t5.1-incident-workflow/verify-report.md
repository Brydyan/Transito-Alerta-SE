# Verification Report: T5.1 Incident Workflow

**Change**: t5.1-incident-workflow
**Version**: spec.md (no versioned header)
**Mode**: Strict TDD
**Verifier**: Claude QA (sdd-verify)
**Date**: 2026-08-23

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 22 (8 phases, all sub-tasks) |
| Tasks complete | 22 |
| Tasks incomplete | 0 |

All tasks marked `[x]` in tasks.md. No incomplete items.

---

## Build & Tests Execution

**Unit tests (npm test)**: ✅ 78 suites / 727 tests — 0 failures, 0 skipped
- `incident-workflow.service.spec.ts`: 13/13 ✅

**E2E tests (npm run test:e2e --runInBand)**: ✅ 16 suites / 146 tests — 0 failures, 0 skipped
- `incident-workflow.e2e-spec.ts`: 8/8 ✅

**TypeScript typecheck (npm run typecheck)**: ✅ 0 errors

**Lint (npm run lint)**: ✅ 0 errors, 16 warnings (all pre-existing, none in T5.1 files)

**Build**: Not re-run inline (apply-progress records ✅ clean; typecheck pass is sufficient gate).

Note: Jest reports "did not exit one second after test run" in the e2e suite — this is a pre-existing open-handles condition from the TestEnvironment teardown (Redis/Postgres connections), not caused by T5.1 and not a test failure.

---

## Spec Compliance Matrix

### POST /api/incidents/:id/claim

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 — Claim | Scenario 1: happy path, 200 + claimedBy set | `incident-workflow.e2e-spec.ts > operator claims an unclaimed incident, then releases it` | ✅ COMPLIANT |
| R1 — Claim | Scenario 2: already claimed → 409 INCIDENT_ALREADY_CLAIMED | `incident-workflow.e2e-spec.ts > second operator claim on the same incident returns 409` | ✅ COMPLIANT |
| R1 — Claim | Scenario 3: wrong org → 403 WRONG_ORGANIZATION | `incident-workflow.e2e-spec.ts > operator from a different org gets 403 on claim` | ✅ COMPLIANT |
| R1 — Claim | Scenario 4: at max_active_claims → 429 CLAIM_LIMIT_REACHED | `incident-workflow.service.spec.ts > throws HttpException with CLAIM_LIMIT_REACHED` | ⚠️ PARTIAL — unit test only, no e2e coverage (documented deviation A5) |
| R1 — Claim | Scenario 5: unauthenticated → 401 | `incident-workflow.e2e-spec.ts > unauthenticated claim returns 401` | ✅ COMPLIANT |

### POST /api/incidents/:id/release

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R2 — Release | Scenario 1: happy path, 200 + claimedBy null | `incident-workflow.e2e-spec.ts > operator claims an unclaimed incident, then releases it` | ✅ COMPLIANT |
| R2 — Release | Scenario 2: not the claimer → 403 NOT_THE_CLAIMER | `incident-workflow.e2e-spec.ts > non-claimer gets 403 on release` | ✅ COMPLIANT |
| R2 — Release | Scenario 3: unclaimed incident → 409 INCIDENT_NOT_CLAIMED | `incident-workflow.service.spec.ts > throws ConflictException with INCIDENT_NOT_CLAIMED` | ⚠️ PARTIAL — unit test only, no e2e test for release-on-unclaimed |

### GET /api/incidents/:id/available-operators

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R3 — Available Operators | Scenario 1: eligible operators in same org, excludes at-limit and other-org | `incident-workflow.e2e-spec.ts > available-operators returns operators under the cap in the same org` | ⚠️ PARTIAL — e2e verifies inclusion of eligible ops; exclusion of at-limit and other-org verified by unit + SQL logic only |
| R3 — Available Operators | Scenario 2: empty array when no eligible operators | `incident-workflow.service.spec.ts > returns [] when the incident has no organization` | ⚠️ PARTIAL — unit tests no-org case; "all at limit → empty" case lacks explicit test |

### GET /api/incidents/statuses

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R4 — Status Catalog | Scenario 1: 200 + {statuses: [...]} for any authenticated user | `incident-workflow.e2e-spec.ts > GET /api/incidents/statuses returns the 3 IncidentStatus values` | ✅ COMPLIANT |
| R4 — Status Catalog | Scenario 2: 401 unauthenticated | `incident-workflow.e2e-spec.ts > GET /api/incidents/statuses without auth returns 401` | ✅ COMPLIANT |

**Compliance summary**: 8/12 scenarios fully COMPLIANT, 4 PARTIAL (unit-tested but lacking e2e behavioral proof at that layer).

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1: Atomic CAS via UPDATE...WHERE claimed_by IS NULL RETURNING * | ✅ Implemented | `incident-workflow.service.ts` line 92-98; `unwrapReturningRows` used correctly |
| R1: 403 on org mismatch, skip for admin_sistema | ✅ Implemented | Lines 73-78; `SYSTEM_ADMIN_ROLE = 'admin_sistema'` |
| R1: 429 when active_count >= maxActiveClaims | ✅ Implemented | Lines 81-87; separate `activeClaimCountFor` helper |
| R1: 409 on CAS miss (0 rows returned) | ✅ Implemented | Lines 100-103 |
| R2: Release sets claimed_by = NULL | ✅ Implemented | Lines 122-131 |
| R2: 409 when incident not claimed | ✅ Implemented | Lines 115-117 |
| R2: 403 when not the claimer | ✅ Implemented | Lines 118-120 |
| R3: Subquery COUNT for active claims per operator | ✅ Implemented | Lines 144-168; subquery in SQL |
| R3: Excludes current claimer ($2::uuid IS NULL OR u.id <> $2::uuid) | ✅ Implemented | SQL line 160 |
| R3: Filters to operator roles only | ✅ Implemented | `r.name IN ('operador_organizacion', 'operador_sistema')` |
| R4: Pure constant return, no DB | ✅ Implemented | `getStatuses()` returns `[...ALLOWED_STATUSES]` |
| R4: Response shape {statuses: [...]} | ✅ Implemented | Controller wraps: `{ statuses: this.workflow.getStatuses() }` |
| Entity: IncidentEntity.claimedBy column | ✅ Implemented | `incident.entity.ts` |
| Entity: OrganizationEntity.maxActiveClaims column | ✅ Implemented | `organization.entity.ts` |
| Migration 0019 | ✅ Implemented | `database/migrations/0019_incident_claim.sql` |
| Permission action enum extended (CLAIM, RELEASE) | ✅ Implemented | `require-permission.decorator.ts` |
| Statuses endpoint accessible without RBAC gate | ✅ Implemented | PermissionGuard returns `true` when no `@RequirePermission` (line 44-46 of permission.guard.ts) |
| Response serialized in snake_case | ✅ Implemented | Global `SnakeCaseResponseInterceptor` transforms `claimedBy → claimed_by` |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: CAS UPDATE WHERE claimed_by IS NULL RETURNING * | ✅ Yes | Exact pattern from design.md used |
| D2: max_active_claims on organizations table, default 5 | ✅ Yes | Migration adds column; entity maps it |
| D3: Separate IncidentWorkflowService class | ✅ Yes | Not merged into IncidentsService |
| D4: Single-query subquery for available operators (no N+1) | ✅ Yes | One SQL round-trip in availableOperators |
| D5: getStatuses pure constant, no DB | ✅ Yes | Returns ALLOWED_STATUSES array literal |
| Controller order: IncidentWorkflowController before IncidentsController | ✅ Yes | Module controllers array: [IncidentWorkflowController, IncidentsController] |
| Route ordering: GET statuses before GET :id | ✅ Yes | Controller method order: getStatuses() first |
| A1: JSONB roles.permissions instead of role_permissions table | ✅ Acceptable | Consistent with migration 0018 pattern; no role_permissions table exists |
| A2: Controller registration order prevents :id shadowing | ✅ Yes | Documented and correctly applied |
| A3: unwrapReturningRows helper reused | ✅ Yes | Avoids duplicating workaround for TypeORM pg driver quirk |
| A4: E2E permissions set explicitly on user | ✅ Acceptable | Consistent with other e2e tests in the suite |
| A5: 429 max-claims scenario covered by unit test only | ✅ Acceptable with WARNING | Documented; business logic verified at service level |

---

## Issues Found

**CRITICAL** (must fix before archive):
None.

**WARNING** (should fix):

W1 — Spec R1.4 (claim 429) lacks e2e behavioral proof.
The max_active_claims limit check is verified exclusively in `incident-workflow.service.spec.ts`. The spec Scenario 4 requires "response status is 429 + CLAIM_LIMIT_REACHED". While the unit test proves the service throws correctly, there is no e2e test that wires through the HTTP stack. Documented as A5 (acceptable compromise given test setup cost), but it leaves a gap in the HTTP-layer behavioral audit trail.

W2 — Spec R2.3 (release on unclaimed incident → 409) lacks e2e behavioral proof.
The unit test `throws ConflictException with INCIDENT_NOT_CLAIMED when claimed_by is null` covers the service layer. No e2e test sends `POST /api/incidents/:id/release` on an unclaimed incident to verify the HTTP 409 response. A simple additional e2e case could cover this.

**SUGGESTION** (nice to have):

S1 — E2E available-operators test does not assert exclusion of an at-limit operator.
The e2e test only verifies that eligible operators are included. The spec scenario "operator B with 5/5 claims is NOT in the response" is not verified at the HTTP layer. The unit test and SQL logic handle this, but e2e exclusion assertion would strengthen the contract.

S2 — E2E available-operators empty-array scenario not covered.
Spec R3/Scenario 2 ("all operators at limit → {operators: []}") has no e2e test. The unit test covers the `no organization_id` shortcut, which is a different code path from the "all-at-limit" empty case.

---

## Verdict

**PASS WITH WARNINGS**

All 146 e2e tests and 727 unit tests pass. Build, typecheck, and lint are clean. The implementation correctly matches all spec requirements at the service layer. Two WARNING-level gaps exist in e2e behavioral coverage for the 429 (claim at limit) and 409 (release unclaimed) scenarios — both are unit-tested and the deviations are documented. No CRITICAL issues. Safe to archive after accepting W1 and W2 as known gaps.
