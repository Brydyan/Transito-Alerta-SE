# Verify Report: T5.4 Map UI Support

**Change**: t5.4-map-ui-support
**Version**: 1.0
**Mode**: Strict TDD
**Date**: 2026-08-23
**Run**: re-verify (post W1 fix)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 19 |
| Tasks complete | 19 |
| Tasks incomplete | 0 |

All phases (0–9) are marked `[x]` in tasks.md.

---

## Build & Tests Execution

**Unit Tests**: 80 suites / 734 tests — all passed (12.075 s)
**E2E Tests**: 17 suites / 152 tests — all passed (261.706 s)

Note: `MailOutboxConsumer ECONNREFUSED :1025` errors visible in e2e output are pre-existing noise (no SMTP in test env) and appear across unrelated suites — not caused by this change.

**map-ui-support.e2e-spec.ts specifically**: PASS (14.373 s)

**Coverage**: Not collected in this run — threshold not configured in openspec/config.yaml.

---

## W1 Fix Confirmation

Previous verify flagged W1: "sort not proven e2e — tests only check membership, not ASC order."

Confirmed fixed in `backend/test/e2e/map-ui-support.e2e-spec.ts`:

- Line 86: `expect(roleNames).toEqual([...roleNames].sort())` — system admin roles ASC proven e2e
- Line 87: `expect(orgNames).toEqual([...orgNames].sort())` — system admin orgs ASC proven e2e
- Line 109: `expect(roleNames).toEqual([...roleNames].sort())` — org-admin restricted view sort proven e2e

These assertions are migration-resistant (compare list against its own sorted copy, not against a hardcoded seed sequence). W1 is resolved.

---

## Spec Compliance Matrix

### R1 — GET /api/map/filters

| Scenario | Test | Result |
|----------|------|--------|
| Sc1: Authenticated user receives categories sorted alphabetically | `map-ui-support.e2e-spec.ts > GET /api/map/filters returns categories sorted alphabetically` | ✅ COMPLIANT |
| Sc2: Unauthenticated → 401 | `map-ui-support.e2e-spec.ts > GET /api/map/filters without auth returns 401` | ✅ COMPLIANT |
| Sc3: Empty categories → empty array | `map-support.service.spec.ts > returns empty array when no categories exist` (unit) | ✅ COMPLIANT |
| Sc4: Response has id and name fields only | `map-ui-support.e2e-spec.ts > GET /api/map/filters` (shape assertion lines 55-57) | ✅ COMPLIANT |

**R1 compliance: 4/4**

### R2 — GET /api/users/form-data

| Scenario | Test | Result |
|----------|------|--------|
| Sc1: System admin — all roles and all orgs | `map-ui-support.e2e-spec.ts > system admin sees all roles and all organizations, both lists sorted ASC by name` | ✅ COMPLIANT |
| Sc2: Org-admin — excludes system-only roles, own org only | `map-ui-support.e2e-spec.ts > org admin: system-only roles excluded, only own organization returned, sorted ASC` | ✅ COMPLIANT |
| Sc3: Caller without READ users → 403 | `map-ui-support.e2e-spec.ts > caller without READ users permission gets 403` | ✅ COMPLIANT |
| Sc4: Unauthenticated → 401 | `map-ui-support.e2e-spec.ts > unauthenticated form-data request returns 401` | ✅ COMPLIANT |
| Sc5: Roles and organizations sorted alphabetically | `map-ui-support.e2e-spec.ts` lines 86-87, 109 (ASC sort asserted e2e) | ✅ COMPLIANT |

**R2 compliance: 5/5**

**Total compliance: 9/9 scenarios**

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|-------------|--------|-------|
| R1: JWT-only auth on /map/filters | ✅ Implemented | `@UseGuards(JwtAuthGuard)` on MapController |
| R1: Categories sorted by name ASC | ✅ Implemented | `order: { name: 'ASC' }` in MapSupportService |
| R1: Response shape `{data:{categories:[{id,name}]}}` | ✅ Implemented | MapFiltersResponseDto matches spec |
| R2: READ users permission required | ✅ Implemented | `@RequirePermission('READ', 'users')` on route |
| R2: System admin sees all roles + all orgs | ✅ Implemented | UsersService.getFormData — no filter when admin |
| R2: Non-admin excludes SYSTEM_ONLY_ROLES | ✅ Implemented | `Not(In(SYSTEM_ONLY_ROLES))` — includes admin_legacy |
| R2: Non-admin sees own org only | ✅ Implemented | `where: { id: currentUser.organizationId }` |
| R2: Response shape `{roles:[],organizations:[]}` | ✅ Implemented | FormDataResponseDto matches spec |
| Route order: form-data before :id | ✅ Implemented | Declared first in UsersController |
| SYSTEM_ONLY_ROLES constant | ✅ Implemented | role-exclusions.constants.ts: admin_sistema, operador_sistema, admin_legacy |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: MapModule imports TypeOrmModule.forFeature([IncidentCategoryEntity]) directly (not IncidentCategoriesModule) | ✅ Yes | Avoids pulling in permission-gated controller/service |
| D4: SYSTEM_ONLY_ROLES as const tuple | ✅ Yes | role-exclusions.constants.ts |
| Unit tests for getFormData in separate file | ✅ Yes | users.service.form-data.spec.ts — cleaner isolation |
| No new migrations | ✅ Yes | Reads from existing tables only |

---

## Issues Found

**CRITICAL** (must fix before archive): None

**WARNING** (should fix): None

**SUGGESTION** (nice to have):
- S1: `admin_legacy` exclusion is not explicitly asserted in the e2e test for the org-admin scenario. The service correctly excludes it via `SYSTEM_ONLY_ROLES` constant (verified in unit tests), and the e2e now asserts `not.toContain('admin_sistema')` and `not.toContain('operador_sistema')`. Adding `expect(roleNames).not.toContain('admin_legacy')` would make the e2e spec coverage match R2 exactly.

---

## Verdict

**PASS**

0 CRITICAL, 0 WARNING, 1 SUGGESTION. All 9 spec scenarios are compliant. All 152 e2e tests and 734 unit tests pass. W1 (sort not proven e2e) is resolved — both role and org lists assert alphabetical order end-to-end with migration-resistant comparisons. Ready for sdd-archive.
