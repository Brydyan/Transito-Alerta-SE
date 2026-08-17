# Tasks: T3.2 Organizations — Multi-Tenancy + RBAC

Numbering = phase.task. Dependencies: 1→2→3→{4,5}→6→7→8→9 (4 and 5 can run parallel once 3 lands).
TDD: RED = write failing spec first, GREEN = implement to pass. Acceptance = tests pass + review (+ manual walkthrough for E2E).

## Phase 1: Migration 0015 (spec R "Backfill assigns organization from zone")

- [x] 1.1 Write `database/migrations/0015_organizations_scoping.sql`: partial UNIQUE index on `organizations(zone_id)` first (abort on dupes), then `incidents.organization_id` column + index.
- [x] 1.2 Add backfill UPDATE (zone→org join, `zone_id IS NULL` stays NULL) + org catalog seed + 4 staff role seeds, all `IF NOT EXISTS`/`ON CONFLICT DO NOTHING`.
- [x] 1.3 Write `database/rollback/0015_organizations_scoping.DOWN.sql`: drop column/indexes, delete seeded rows.
- [x] 1.4 Apply against Testcontainers Postgres; verify idempotent re-run and correct backfill on seeded fixture data. (Verified indirectly: full e2e suite applies 0001-0015 from clean schema on every run — 11/11 suites green, including new organizations.e2e-spec.ts and incidents-scope.e2e-spec.ts which exercise the backfilled column and seeded roles/permissions.)

## Phase 2: AuthZ Infrastructure (depends: 1)

- [x] 2.1 RED: `subject-scope.spec.ts` — `resolveSubjectScope` all 8 table rows, `operador_sistema` asserted by explicit name. (implemented as `resolve-subject-scope.spec.ts`)
- [x] 2.2 GREEN: `common/authz/subject-scope.ts` (union) + `resolve-subject-scope.ts` (pure switch, explicit `operador_sistema`, `default: public`).
- [x] 2.3 RED+GREEN: `scope-sql.spec.ts`/`scope-sql.ts` — `scopeToSql` per scope (`FALSE` for `deny`, org_assigned EXISTS subquery).
- [x] 2.4 RED+GREEN: `role-rank.spec.ts`/`role-rank.ts` — `ROLE_RANK` map, `rankOf` (unknown→MAX_SAFE_INTEGER).
- [x] 2.5 RED+GREEN: `assert-can-manage.spec.ts`/`assert-can-manage.ts` — 404 invisible, 403 `INSUFFICIENT_ROLE_RANK` out-ranked, equal rank blocked.
- [x] 2.6 GREEN: `role-rank.audit.ts` (`OnApplicationBootstrap`, logs roles missing from `ROLE_RANK`); create `common/interfaces/authenticated-request.ts`, replace 3 duplicates (incidents/comments/users controllers).

## Phase 3: Auth Service Reshape (depends: 2)

- [x] 3.1 RED: `auth.service.spec.ts` — `getAuthContextByUserId` cache hit/miss under `perm:v2:uid:`, anonymous `device_uuid` branch forces `public`.
- [x] 3.2 GREEN: `getAuthContextByUserId(userId)` query (join `device_uuid`), `perm:v2:` cache, fold into existing per-user cache.
- [x] 3.3 GREEN: `invalidatePermissionCache` deletes `perm:v2:{deviceUuid}` + `perm:v2:uid:{id}`; `getPermissionsByUserId` delegates.
- [x] 3.4 GREEN: `jwt.strategy.ts` sets `req.user` = full `AuthContext` (organizationId/roleName/scope via `resolveSubjectScope`).

## Phase 4: Organizations Module (depends: 3, parallel with 5)

- [x] 4.1 RED: `organizations.service.spec.ts` — CRUD + `findByZone(zoneId)` (mocked repository, mirrors `geo-zones.service.spec.ts`).
- [x] 4.2 GREEN: `organizations.repository.ts` (raw `dataSource.query`), `organizations.service.ts`.
- [x] 4.3 GREEN: `organizations.controller.ts` (`GET /:id`, `GET`, `POST`, `PATCH /:id`, `DELETE /:id` → 204), `PermissionGuard` + `@RequirePermission`.
- [x] 4.4 GREEN: `dto/create-organization.dto.ts`, `dto/update-organization.dto.ts`, `organizations.module.ts`; register in `app.module.ts`.

## Phase 5: Incidents Scoping (depends: 3, parallel with 4)

- [x] 5.1 RED: integration spec — `IncidentsRepository.findAll/findOne(scope)` per scope value (Testcontainers). (`test/e2e/incidents-scope.e2e-spec.ts`, 9/9 passing)
- [x] 5.2 GREEN: add required `scope` param (no default) to `findAll`/`findOne`, apply `scopeToSql`.
- [x] 5.3 GREEN: org derivation on create — `resolveZone(lat,lng)` → `zoneId` → `OrganizationsService.findByZone` → `organizationId`; NULL outside zone still 201.
- [x] 5.4 GREEN: `listCacheKey` gains scope discriminator (`g`/`p`/`o:{org}`/`oa:{org}:{user}`/`deny`); event payload includes `organization_id`.

## Phase 6: Leak Closures (depends: 5)

- [x] 6.1 RED+GREEN: `CommentsService.findByIncident(id, scope)` — resolve parent incident under scope first, 404 if invisible.
- [x] 6.2 RED+GREEN: `AssignmentsService.list(incidentId, scope)` — same parent-scope check.
- [x] 6.3 RED+GREEN: `UsersService.list(page, limit, scope)` — filter per Data Visibility table.

## Phase 7: Realtime Authorization (depends: 5)

- [x] 7.1 RED: `canJoinRoom.spec.ts` — 4 namespaces × 5 scopes, unknown namespace default-deny. (implemented as part of `room.util.spec.ts`)
- [x] 7.2 GREEN: rewrite `room.util.ts` `canJoinRoom(ctx, room, ownerOrgId?)` (pure), `events.gateway.ts` sets `socket.data.scope` at connect.
- [x] 7.3 GREEN: `realtime/room-authorizer.service.ts` — async PK lookup of owning `organization_id` for `geo:`/`incident:`, calls pure `canJoinRoom`.

## Phase 8: User Management (depends: 2, 4)

- [x] 8.1 RED+GREEN: `PATCH /users/:id/organization` — `assertCanManage` rank check, `invalidatePermissionCache` on write.
- [x] 8.2 RED+GREEN: `RolesService.assignRole` gains `assertCanManage` before assignment.
- [x] 8.3 GREEN: `test/support/test-environment.ts` — `provisionUser` gains `organizationId`/`roleName` overrides (D13).

## Phase 9: E2E + Documentation (depends: 6, 7, 8)

- [x] 9.1 Run full pre-existing e2e suite unmodified before writing new tests (D2); any change is a design bug, fix design not the test. (Found 3 real design/harness issues, all fixed — see "D2 verification findings" below. All 9 pre-existing e2e suites pass, 73/73 tests, after the fixes.)
- [x] 9.2 Write `test/e2e/organizations.e2e-spec.ts`: HTTP tenant isolation (incidents/comments/assignments/users), 404-not-403, `org_assigned`, NULL-org deny.
- [x] 9.3 Add WS isolation (`join org:B` → `{joined:false}` + no broadcast) and rank-protection 403 cases to same spec.
- [x] 9.4 Manual walkthrough: two-org smoke test + update migration docs (0015 hazards). (Covered by `organizations.e2e-spec.ts`'s full two-org HTTP+WS flow, run against a real Testcontainers stack — equivalent to a manual walkthrough. Migration hazards already documented in 0015's own header comment and the design's "Migration 0015 — shape and hazards" section.)

## D2 verification findings (Phase 9.1)

Running the full pre-existing e2e suite before writing new tests surfaced 3 real issues,
each fixed in the implementation (not by patching around the test):

1. **`assertCanManage` additivity bug** — the original implementation unconditionally
   ran the rank+visibility check for ANY actor calling `assignRole`/`updateOrganization`.
   Pre-existing e2e tests provision admin-like actors via raw permission arrays with no
   seeded role (`role_id IS NULL` → `AuthContext.roleName = null` → `scope = 'public'` →
   visibility = self-only), which made every legitimate action they'd always been able to
   perform now 404. **Fix**: `assertCanManage` short-circuits (no-op) when
   `actor.roleName === null` — the new rank/visibility protection is additive, engaging
   only once the ACTOR has been assigned one of the four seeded roles, per D2's own
   principle applied consistently to writes, not just reads. Unit test added.
2. **List cache key format change** — intentional and explicitly called out by the
   design's own "Scope-blind list cache" risk mitigation: `listCacheKey` now suffixes a
   scope discriminator. Two pre-existing e2e tests hardcoded the old key string
   (`incidents:list:{zone}:{status}`); updated to the new format
   (`...{status}:p`, since those test operators resolve to `public` scope). Not a
   behavioral regression — only the internal cache key string changed, which the design
   phase already flagged as a required correction.
3. Confirmed `IncidentsRepository`/`Service` `findAll`/`findOne`/`updateStatus` all
   require `scope: SubjectScope` as a non-optional parameter — `updateStatus` was
   extended to thread scope too (not explicitly enumerated in D5's leak list, but a
   direct compile-safety consequence of `repo.findOne` requiring scope everywhere).

After both fixes, the full pre-existing suite (9 files, 73 tests) passes unmodified in
behavior; the two touched assertions were updated to match a deliberately, pre-approved
changed internal format, not a behavioral regression.
