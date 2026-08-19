# Verification Report — T3.2 Organizations (Multi-Tenancy + RBAC)

**Change**: t3.2-organizations
**Mode**: Strict TDD (verified)
**Verifier**: sdd-verify, 2026-08-17

---

## Completeness

| Metric | Value |
|---|---|
| Tasks total | 35 |
| Tasks complete | 35 |
| Tasks incomplete | 0 |

All 9 phases marked `[x]`. `tasks.md` includes a "D2 verification findings" section documenting 3 real issues found and fixed during Phase 9.1 (pre-existing e2e regression run) — not deferred, all fixed in the implementation itself.

---

## Build & Tests Execution

**Build**: PASSED — `npx tsc --noEmit` → 0 errors (orchestrator-run, re-confirmed by targeted suite compile).

**Unit tests** (targeted re-run of all T3.2-touched suites): 24 suites / 198 tests passed, 0 failed.
Full unit suite (orchestrator-run): 56 suites / 493 tests passed.

**E2E tests** (orchestrator-run, Testcontainers): 11 suites / 100 tests passed — 9 pre-existing suites unmodified in behavior + `incidents-scope.e2e-spec.ts` (9 new) + `organizations.e2e-spec.ts` (18 new).

**Coverage**: not separately run in this pass (unit run above is a subset flag `--coverage` not applied); no threshold configured in project.

---

## Spec Compliance Matrix

| # | Scenario | Test | Result |
|---|---|---|---|
| 1 | Org-scoped operator sees only own org's incidents | `organizations.e2e-spec.ts > admin_organizacion in Org A lists only Org A incidents (R8)`; also `incidents.repository.spec.ts > org scope sees only that organization's incidents` | COMPLIANT |
| 2 | Cross-org read returns 404, not 403 | `organizations.e2e-spec.ts > cross-org GET /incidents/:id returns 404, never 403`; `incidents-scope.e2e-spec.ts > org scope cannot read another org's incident (404, not 403)` | COMPLIANT |
| 3 | `operador_organizacion` sees only assigned incidents in own org | `organizations.e2e-spec.ts > operador_organizacion sees only Org A incidents assigned to them`; `incidents-scope.e2e-spec.ts > org_assigned scope sees only own-org incidents assigned to that user` (+ negative case: different user in same org sees nothing) | COMPLIANT |
| 4 | `admin_organizacion` with NULL org sees zero incidents | `organizations.e2e-spec.ts > admin_organizacion with organization_id=NULL sees zero incidents, not all` | COMPLIANT |
| 5 | WebSocket room join blocked across orgs | `organizations.e2e-spec.ts > a socket authenticated as Org A staff calling join {room:"org:<B>"} receives {joined:false} and no broadcast reaches it` (+ positive case: can join own org room) | COMPLIANT |
| 6 | Rank check blocks org admin acting on a system admin | `organizations.e2e-spec.ts > admin_organizacion calling PATCH /users/:id/organization on an admin_sistema in the same org is rejected 403 INSUFFICIENT_ROLE_RANK`; unit `roles.service.spec.ts > rejects 403 INSUFFICIENT_ROLE_RANK…` (covers `POST /roles/:id/assign` path at unit level only — see WARNING) | COMPLIANT (partial e2e layer gap, see WARNING) |
| 7 | Equal rank is blocked | `assert-can-manage.spec.ts > equal rank is blocked (403)`; `organizations.e2e-spec.ts > admin_sistema cannot move another admin_sistema (equal rank -> 403)` | COMPLIANT |
| 8 | Incident created outside every zone still succeeds | `organizations.e2e-spec.ts > an incident created outside every zone is still accepted 201 with organization_id=NULL (R2)` | COMPLIANT |
| 9 | Backfill assigns organization from zone | Migration applied from clean schema on every e2e run (0001-0015); `incidents-scope.e2e-spec.ts` exercises the backfilled column against seeded fixtures. No dedicated unit test of the raw UPDATE statement, but integration coverage is real (Testcontainers). | COMPLIANT |
| 10 | `operador_sistema` sees incidents across both organizations | `organizations.e2e-spec.ts > operador_sistema sees incidents from both organizations`; `resolve-subject-scope.spec.ts` asserts `operador_sistema` by explicit name (not fallthrough) | COMPLIANT |

**Compliance summary**: 10/10 scenarios compliant (1 with a noted e2e-layer coverage gap on `POST /roles/:id/assign`, see WARNING-1).

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|---|---|---|
| `SubjectScope` 5-variant union, no role-string/rank/optional-org representation | Implemented | `common/authz/subject-scope.ts` — exact union, `public`/`global` kept as distinct constructors per D1 |
| `resolveSubjectScope` pure, explicit `operador_sistema` branch | Implemented | `common/authz/resolve-subject-scope.ts:19` explicit case, `default: public` |
| Scope as required, non-optional, non-defaulted repo parameter | Implemented | Verified in `incidents.repository.ts` (`findAll`, `findOne`), `comments.service.ts`, `assignments.service.ts`, `users.service.ts` — all take `scope: SubjectScope` with no `?` and no default. `incidents.repository.ts.updateStatus` itself has no scope param, but is only ever called after `IncidentsService.updateStatus` has already fetched the row via a scoped `findOne` — enforcement point is the read, matching the design's read-then-write pattern (not a leak) |
| Rank ladder `ROLE_RANK`, strict `<` | Implemented | `common/authz/role-rank.ts`, `assert-can-manage.ts:46` |
| Org derivation from resolved zone, never creator's org | Implemented | `incidents.service.ts` create path calls `OrganizationsService.findByZone(zoneId)`, never reads creator's `organization_id` |
| Data Visibility table (global/org/org_assigned/public/deny × incidents/comments/assignments/users) | Implemented | `scope-sql.ts` (incidents), `comments.service.ts`/`assignments.service.ts` (parent-incident 404 pattern), `users.service.ts:84-99` (switch covers all 5 kinds) |
| Realtime room authorization, 4 namespaces × 5 scopes | Implemented | `room.util.ts canJoinRoom` — matches design table exactly incl. `user:`, `org:`, `geo:`, `incident:`, default-deny for unknown namespace |
| Cache key reshape `perm:v2:` | Implemented | `auth.service.ts:26` `PERMISSION_CACHE_PREFIX = 'perm:v2:'`; both device-uuid-keyed and uid-keyed variants use it; legacy `perm:` prefix not read anywhere in the new code path |
| List-cache scope discriminator | Implemented | `incidents.service.ts:170-175 listCacheKey` suffixes `scopeCacheKey(scope)`; `scope-sql.ts scopeCacheKey` gives `global`→`g` and `public`→`p` **distinct keys**, closing the exact leak the design flagged (org A's cached array cannot be served to org B, and public/global cannot cross-poison) |
| Migration 0015 — unique index before backfill, transactional, idempotent, has rollback | Implemented | Verified line-by-line: `CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_zone` is step 1 inside a single `BEGIN…COMMIT`, backfill UPDATE is step 3, all inserts use `ON CONFLICT DO NOTHING` / `IF NOT EXISTS`. Rollback drops column/indexes and deletes only the seeded rows |
| Boot-time `ROLE_RANK` audit | Implemented | `common/authz/role-rank.audit.ts` — `OnApplicationBootstrap`, logs any DB role missing from `ROLE_RANK` |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 — scope union, `public`/`global` separate | Yes | |
| D2 — unranked → `public`, additive | Yes, extended to writes | See judgment call below (assertCanManage no-op) |
| D3 — scope as required parameter, no ALS/post-filter/ORM-global-scope | Yes | |
| D4 — org derived from resolved zone | Yes | |
| D5 — exhaustive leak list (incidents, comments, assignments, users, realtime) | Yes | `updateStatus` also threaded per D2 findings #3, a compile-safety consequence not explicitly in D5's original list but consistent with it |
| D6 — `perm:v2:` prefix, `device_uuid` join correction | Yes | Correction documented and implemented as described |
| D9/D10 — rank ladder as code constant, strict `<` | Yes | |
| D11 — 404 invisible / 403 visible-but-outranked, order visibility-then-rank | Yes | `assert-can-manage.ts` checks visibility (line 42) strictly before rank (line 46) |
| Scope-blind list cache risk mitigation | Yes | Implemented exactly as the design's own risk table describes |
| Module boundary (no cycle, RoomAuthorizer uses raw DataSource) | Yes | `room-authorizer.service.ts` does not import IncidentsModule/OrganizationsModule |

---

## Judgment Call: `assertCanManage` no-op for `actor.roleName === null` (D2 finding #1)

**Verdict: Faithful to D2, not a new hole — but it preserves (does not close) a pre-existing gap. Recommend a WARNING, not a CRITICAL.**

Reasoning:
- Before T3.2, `assignRole` / `updateOrganization` had **zero** rank or visibility check — only `PermissionGuard` gated them. Any actor holding `ASSIGN roles` / `UPDATE users` directly (not via a seeded role) could act on any target.
- T3.2's own spec/design commit to additivity: "no pre-existing identity's observable behaviour changes" (spec, Subject Scope Model) and D2 explicitly: "every identity in production and in every existing e2e has `role_id IS NULL`... `deny` would 404 the suite and live citizens."
- Making `assertCanManage` a no-op exactly when `actor.roleName === null` reproduces the exact pre-T3.2 behavior for that population — it does not grant any new capability that did not already exist. The rank ladder only ever existed for the four newly-seeded roles; it cannot regress an actor who was never in it.
- The residual risk is real but **pre-existing, not introduced by this change**: any production account holding `ASSIGN`/`UPDATE` permissions directly (bypassing role assignment) with `role_id IS NULL` bypasses rank protection entirely, same as before T3.2. This is a legitimate hardening target for a future task (e.g., "require a seeded role to use permission-bearing management actions"), not a T3.2 regression.
- The fix is documented in code (doc comment in `assert-can-manage.ts:27-35`), covered by a unit test (`assert-can-manage.spec.ts:83`), and recorded transparently in `tasks.md`'s "D2 verification findings" — this is the kind of design correction the D2 principle exists to produce, applied consistently to writes as well as reads.

Net: no CRITICAL finding here. Flagged as WARNING-2 below for visibility into future hardening.

---

## Issues Found

**CRITICAL** (must fix before archive):
None.

**WARNING** (should fix, does not block archive):

1. **`POST /roles/:id/assign` rank-protection is unit-tested but not e2e-tested.** The proposal's success criteria (line 389) explicitly names `POST /roles/:id/assign` for the 403/404 rank scenarios. `roles.service.spec.ts` covers the rank/visibility logic with mocked repos (`rejects 403 INSUFFICIENT_ROLE_RANK…`, `rejects 404 when the target user is not visible…`), and the controller wiring (`roles.controller.ts:34` → `rolesService.assignRole(req.user!, ...)`) is correct by inspection, but `organizations.e2e-spec.ts`'s "rank protection" describe block (lines 274-343) only exercises `PATCH /users/:id/organization`, never `POST /roles/:id/assign`, over real HTTP. Since both call the same shared `assertCanManage`, the risk of a real behavioral gap is low, but the letter of the success criteria is not fully e2e-proven. — `backend/test/e2e/organizations.e2e-spec.ts:274`, `backend/test/e2e/roles.e2e-spec.ts` (no rank-specific case).

2. **`assertCanManage` no-op for role-less actors preserves a pre-existing permission-only-bypass gap** (see Judgment Call above). Not a T3.2 regression; recommend a follow-up task to require a seeded role for any actor invoking rank-protected write endpoints, closing this permanently. — `backend/src/common/authz/assert-can-manage.ts:37-40`.

**SUGGESTION** (nice to have):

1. No dedicated unit/integration test isolates migration 0015's backfill UPDATE statement itself (coverage is indirect, via e2e schema bootstrap + `incidents-scope.e2e-spec.ts` fixtures). A narrow Testcontainers test that seeds pre-0015-style rows and asserts the exact backfill outcome would make the "Backfill assigns organization from zone" scenario independently verifiable without depending on the full e2e bootstrap order.
2. `users.service.ts.list` mixes default-valued and required parameters (`page = 1, limit = ..., scope: SubjectScope, callerId?`) — compiles fine and is enforced correctly by TypeScript (required params after default-valued ones are still mandatory), but is a slightly unusual signature shape; consider an options object for readability in a future refactor.

---

## Verdict

**PASS WITH WARNINGS**

All 10 spec scenarios have real, passing test coverage; D3 enforcement is real (scope is a required, non-defaulted parameter enforced at compile time across all five listed leak points); D5's leak closures are exhaustive and additionally cover `updateStatus`; the list-cache scope discriminator (design correction #1) is correctly implemented with `global`/`public` on distinct keys; `perm:v2:` is used exclusively with no legacy-prefix reads; D11 404-vs-403 ordering is correct and tested; D9/D10 rank enforcement is strict-`<` with a boot-time audit; migration 0015 creates the unique index before the backfill in the same transaction, is idempotent, and has a complete rollback. Two WARNINGs are recorded (e2e coverage gap on `POST /roles/:id/assign`, and a documented/judged-acceptable residual gap in `assertCanManage`'s role-less-actor no-op) — neither blocks archive.
