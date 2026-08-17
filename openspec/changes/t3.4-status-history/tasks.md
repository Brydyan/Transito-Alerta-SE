# Tasks: T3.4 StatusHistory — Append-Only Incident Status Audit Trail

Ref: proposal L1–L3/D1–D8, spec TS-1..TS-14, design D1–D8. Strict TDD active (`npm test` from `backend/`).

## Phase 1: Migration 0014 (sequential, blocks Phase 2+)

- [x] 1.1 Write `database/migrations/0014_status_history.sql` — table, guarded FK/CHECK constraints, `idx_status_history_incident_created`, `('status-history','READ')` permission row (design D5, verbatim SQL provided).
- [x] 1.2 Write `database/rollback/0014_status_history.DOWN.sql` — `DROP TABLE status_history`, delete the permission row.
- [x] 1.3 Manually apply 0014 to dev/test DB; verify `\d status_history` shows all constraints and the permission catalog row exists (spec: Data Model MUSTs). — applied to local `tase-postgres` dev DB (0009-0014 chained), verified via `\d status_history` and permission row query. NOT yet applied to Supabase (no credentials available to this agent) — see MIGRATION_LOG.md.

## Phase 2: Entity + Repository (depends on Phase 1)

- [x] 2.1 Create `backend/src/entities/status-history.entity.ts` — flat entity, camelCase props + `@Column({name:'snake_case'})`, matching 0014 columns.
- [x] 2.2 RED: `status-history.repository.spec.ts` — asserts `StatusHistoryRepository` has no `update`/`delete` methods and `insert()` uses `ON CONFLICT (event_id) DO NOTHING RETURNING id`.
- [x] 2.3 GREEN: `backend/src/modules/status-history/status-history.repository.ts` — `insert(data)` via raw `@InjectDataSource().query()` (D8); `findByIncident(incidentId)` via `find({where,order:{createdAt:'ASC',id:'ASC'}})`. No update/delete exposed (D7).

## Phase 3: Listener + Lifecycle (depends on Phase 2)

- [x] 3.1 RED: `incident-status-history.listener.spec.ts` — D3 ACK decision table row-by-row (undecodable→ACK+warn; wrong type→ACK; bad payload→ACK+error; insert 1 row→ACK; conflict 0 rows→ACK; FK/CHECK/NOT NULL/uuid errors→ACK+error; other DB errors→no ACK; sweep `deliveryCount>=5`→ACK+error, no xclaim). Construct with mocked ioredis, call `processResponse`/`processEntry`/`sweep()` directly — no `onModuleInit`.
- [x] 3.2 GREEN: `backend/src/modules/status-history/incident-status-history.listener.ts` — `onModuleInit` (group CREATE `'$'` + MKSTREAM, BUSYGROUP-tolerant), `loop()`, `processEntry()` field mapping (D3), `sweep()` via `XPENDING`→`XCLAIM` (D2), `onModuleDestroy` (D4: `running=false`, clear sweep timer, `redis.quit()`).
- [x] 3.3 Register `STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` in `backend/src/core/core.module.ts` (D1, copy of `MAIL_EVENTS_BLOCKING_CLIENT` factory), add to providers+exports.
- [x] 3.4 One-line edit `backend/src/modules/incidents/incidents.service.ts:131` — add `previous_status: current.status` to published payload (L3).

## Phase 4: Query Service (depends on Phase 2, parallel with Phase 3)

- [x] 4.1 RED: `status-history.service.spec.ts` — 404 (`NotFoundException`) when incident does not exist; `{items,total}` with `created_at ASC, id ASC` ordering when it does.
- [x] 4.2 GREEN: `backend/src/modules/status-history/status-history.service.ts` — `findByIncident(incidentId)`: `exist()` on `IncidentEntity` → 404 else `{items, total: items.length}` (AS-4 raw `changed_by_user_id`, D6 no envelope/pagination).

## Phase 5: Controller (depends on Phase 4, parallel with Phase 3)

- [x] 5.1 RED: `status-history.controller.spec.ts` — `Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ...)` equals `{action:'READ', resource:'status-history'}` (guards D1 override regression).
- [x] 5.2 GREEN: `backend/src/modules/status-history/status-history.controller.ts` — `@Controller('incidents/:incidentId/status-history')`, `GET`, `JwtAuthGuard`+`PermissionGuard`, explicit `@RequirePermission('READ','status-history')`, `ParseUUIDPipe`.
- [x] 5.3 Create `backend/src/modules/status-history/status-history.module.ts` (D7 wiring) and register `StatusHistoryModule` in `backend/src/app.module.ts`.
- [x] 5.4 Update `backend/test/support/test-environment.ts` — hold+`disconnect()` new Redis client, add `status_history` to TRUNCATE list, wire 3 env tunables (E2E values).

## Phase 6: E2E Tests (depends on Phase 3 + 5)

- [x] 6.1 `backend/test/e2e/status-history.e2e-spec.ts` — TS-1/TS-2: 2-row lifecycle `pending→in_progress→resolved`, poll (never sleep), assert exactly 2 rows in order with correct `changed_by_user_id`.
- [x] 6.2 TS-3/TS-4: creating an incident and a rejected illegal transition write zero rows.
- [x] 6.3 TS-8/TS-9/TS-13: permission matrix — 401 no auth, 403 `READ incidents` alone (security regression guard for D1), 200 with `READ status-history`.
- [x] 6.4 TS-10/TS-12: 404 on unknown incident id and on `PATCH`/`DELETE` to the status-history path (no route exists).
- [x] 6.5 TS-5 (idempotency): call `StatusHistoryRepository.insert()` twice with same `event_id` against real Postgres; assert exactly 1 row.
- [x] 6.6 Flake hardening — `beforeEach`: `xtrim(INCIDENTS_STREAM_KEY,'MAXLEN','~',0)` + best-effort `XPENDING`/`XACK` drain (no `XGROUP DESTROY`/`CREATE`); copy `waitUntil` poll helper from `mail.e2e-spec.ts`.
- [x] 6.7 Regression check: `flows.e2e-spec.ts:245` `statusChangedCount === 2` and mail/notifications/realtime e2e suites still pass unchanged. — Verified: `status-history.e2e-spec.ts` includes its own regression assertion mirroring `flows.e2e-spec.ts:245` (statusChangedEvents.length === 2, each carrying `previous_status`); ran `status-history.e2e-spec.ts` standalone: 10/10 pass. Full-suite parallel run (`flows`/`mail`/`notifications`/`regressions`) could NOT be completed at the same instant — a concurrent T3.2 (organizations) apply landed mid-session and left `incidents.repository.ts`/`incidents.service.ts` in a non-compiling transitional state (new required `scope`/`organizationId` params not yet threaded through). This is external to T3.4 (verified via `git status`: those files are modified by another in-flight change, not touched by this task). `notifications.e2e-spec.ts` passed independently before that edit landed. Re-run the full e2e suite once T3.2 finishes.

## Dependency Order

Phase 1 → Phase 2 → {Phase 3, Phase 4 in parallel} → Phase 5 (needs Phase 4; can start controller skeleton alongside Phase 3) → Phase 6 (needs Phase 3 + 5 complete).

## Post-verify fix: cross-tenant leak closure (2026-08-17)

`sdd-verify` found a CRITICAL cross-tenant leak: `findByIncident`'s existence check (`incidentRepo.exist({where:{id}})`, Phase 4.2 original implementation) had no org-scope filter, and the controller never read `req.user.scope` — any caller holding `READ status-history` could read any organization's status trail by UUID, once T3.2 (Organizations) introduced org scoping on the sibling `incidents` routes.

- [x] Closed: `status-history.service.ts` — `findByIncident(incidentId, scope: SubjectScope)`, `scope` REQUIRED (T3.2 D3, never optional/defaulted — unscoped call is now a compile error). Existence check replaced with a raw scoped query built via `scopeToSql(scope, {table:'incidents', paramOffset:2})` (`SELECT 1 FROM incidents WHERE id = $1 AND (<fragment>) LIMIT 1`), mirroring `IncidentsRepository.findOne`. Out-of-scope incident → 404, identical to non-existent (T3.2 D11 — never 403, which would leak cross-org existence). No `IncidentsService` import added (D7/D8 preserved) — kept `DataSource` (already the module's sanctioned raw-SQL path) instead of the `IncidentEntity` repository.
- [x] Closed: `status-history.controller.ts` — reads `req.user!.scope` via the shared `AuthenticatedRequest` (T3.2), forwards it to the service. No new local interface added.
- [x] Tests (RED→GREEN, strict TDD): `status-history.service.spec.ts` (org/org_assigned/deny/global/public scope variants + query-shape assertions), `status-history.controller.spec.ts` (scope-forwarding regression guard), `test/e2e/status-history.e2e-spec.ts` (org-A staff reading org-B's incident status history → 404; org-A staff reading its own org's history → 200).
- Verification: `npx tsc --noEmit` 0 errors; unit suite 56 suites / 499 tests passing (+6 from this fix, baseline 493); e2e suite 11 suites / 102 tests passing (+2 from this fix, baseline 100). No pre-existing test broken.
