# Proposal: T3.4 StatusHistory — Append-Only Incident Status Audit Trail

Source: `sdd/t3.4-status-history/explore` (#423). Artifact store: hybrid. Next free migration: **0014**.

## Intent

An incident's status is today a single mutable column. `PATCH /api/incidents/:id/status` overwrites
`incidents.status` in place, publishes an event, and leaves **no record of who changed what, from
what, or when**. Once an incident reaches `resolved`, the fact that operator A moved it to
`in_progress` at 09:12 and operator B closed it at 17:40 is unrecoverable — the only surviving
trace is a Redis stream with a bounded retention and a mail queue.

T3.4 adds `status_history`: an append-only, per-transition audit trail written by a **listener that
consumes the event Incidents already publishes**, plus one read endpoint. Success means that after
any status change — including changes that happen while the API process is being restarted — there
is exactly one durable row per transition, carrying the actor, the old status, the new status and
the timestamp, and that no HTTP route in the system can alter or remove it.

## Scope

### In Scope

- New module `backend/src/modules/status-history/` — module, listener (Redis Streams consumer),
  repository, service, controller. No CRUD surface: **one** `GET` route.
- New flat entity `backend/src/entities/status-history.entity.ts` (camelCase props, `@Column({ name: 'snake_case' })`).
- Migration `database/migrations/0014_status_history.sql` + `database/rollback/0014_status_history.DOWN.sql`:
  table, FKs, indexes, CHECK constraints, and the single `('status-history', 'READ')` permission catalog row.
- Route `GET /api/incidents/:incidentId/status-history`, gated by an **explicit** resource override
  (D1), returning `{items, total}` ordered `created_at ASC, id ASC`.
- **One** edit inside Incidents: widen the `incident.status_changed` payload with `previous_status`
  (`incidents.service.ts:131`). Additive field, no signature change, no new import.
- A dedicated blocking Redis client token for the new consumer group, registered in `core.module.ts`
  alongside `MAIL_EVENTS_BLOCKING_CLIENT`.
- Unit specs (listener routing/idempotency, repository, service) + `backend/test/e2e/status-history.e2e-spec.ts`.

### Out of Scope

- **`notes`.** Not shipped in T3.4 — see D5. No `notes` column, no `UpdateIncidentStatusDto` change.
- **A creation-time row.** Locked (L2): an incident born `pending` writes no audit row.
- **A Postgres trigger** that writes audit rows. Locked (L1).
- **Embedding `status_history` inside the incident detail payload** (GeoReporta's
  `IncidentResource::withDetail()` second read path). One read path only; embedding would put an
  import edge or an N+1 join into Incidents for zero new capability.
- Pagination and filtering on the history endpoint (D6).
- Backfilling history for incidents that changed status before 0014 was applied. The data does not
  exist; the trail starts empty and is honest about it.
- Any UPDATE/DELETE route, admin correction endpoint, or retention/purge job.
- Any frontend work.

## Capabilities

### New Capabilities

- `status-history`: durable, append-only, per-transition audit of `incidents.status`, with a
  staff-gated read endpoint under a permission distinct from the incident's own.

### Modified Capabilities

- `incidents`: the `incident.status_changed` event contract gains a `previous_status` field. Purely
  additive — Mail (`incident-mail.listener.ts:159-167`), Notifications and Realtime read named keys
  and ignore unknown ones.

## Locked Design Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| L1 | Write mechanism | Application listener | Postgres `AFTER UPDATE` trigger (GeoReporta's `log_incident_status`) | **User-locked.** GeoReporta's trigger resolves the actor from `current_setting('app.current_user_id', true)`, a session var the app must `set_config` before every UPDATE. Our TypeORM path never does, so a straight port would attribute every change to the incident's reporter — the exact bug GeoReporta had to patch in `2026_06_27_100001_fix_audit_actor_in_status_trigger.php`. **Accepted tradeoff: a raw SQL `UPDATE incidents SET status = …` bypasses the audit entirely.** This is acceptable because `IncidentsRepository.updateStatus()` is the only status write in `backend/src` (grep-verified in explore) and manual SQL against production is already an out-of-band event. |
| L2 | Transitions only | No row at creation. `pending → in_progress → resolved` produces exactly **2** rows | Seeding a synthetic `previous_status: null, new_status: 'pending'` row at `incident.created` | **User-locked.** Matches GeoReporta's UPDATE-only trigger and the existing assertion `expect(statusChangedCount).toBe(2)` at `backend/test/e2e/flows.e2e-spec.ts:245`. The initial state stays fully recoverable: the first row's `previous_status = 'pending'`. Consequence: `previous_status` is **NOT NULL** (D3), and `docs/tasks/1-BACKEND-MIGRATIONS.md` needs a correction (see Deviations). |
| L3 | `previous_status` source | Widen the event payload at `incidents.service.ts:131` → `{ ...updated, actor_id: actorId, previous_status: current.status }` | Read-before-write in the listener; hybrid "read the previous history row and fall back to `'pending'`" | **User-locked.** `current` is already loaded at line 113 and discarded. One line, additive, race-free. Every alternative races against a concurrent transition, costs an extra query per event, and has nothing to read on the very first transition of an incident. |
| D1 | Route + permission resource | `@Controller('incidents/:incidentId/status-history')` with an **explicit** resource override: `@RequirePermission('READ', 'status-history')`. Catalog row: `('status-history', 'READ')` | (a) accept inferred resource `incidents`; (b) top-level `@Controller('status-history')` with `?incident_id=` | See "D1 in detail" below. |
| D2 | Event channel | **Redis Streams**, own consumer group `status-history` on `incidents:events`, mirroring `IncidentMailListener` | EventEmitter2 `@OnEvent` (Notifications pattern) | See "D2 in detail" below. Implies at-least-once delivery → idempotency is mandatory (D4). |
| D3 | Schema | See "D3 in detail". Column named **`changed_by_user_id`** (task doc), not GeoReporta's `user_id`; `uuid` PK; `previous_status`/`new_status` both NOT NULL with a CHECK against the three real statuses; `event_id` UNIQUE | GeoReporta's `user_id` + auto-increment int PK | `user_id` is ambiguous on a table that already references an incident which itself has `citizen_id` and `assigned_to` — `changed_by_user_id` says which user. `uuid` PK matches every other table in this repo. |
| D4 | Idempotency | `event_id varchar(64) NOT NULL UNIQUE` = the Redis stream entry id; insert via `ON CONFLICT (event_id) DO NOTHING` | A natural key on `(incident_id, previous_status, new_status)`; tolerating duplicates | Streams' at-least-once redelivery (restart with pending entries, or a crash between insert and XACK) would otherwise double-write. A natural key is wrong: `pending→in_progress→resolved→…` cannot repeat today, but the key must survive a future status graph that allows revisits. The stream entry id is the only true event identity. |
| D5 | `notes` | **Not in T3.4.** Column not created | Port GeoReporta's `notes` | GeoReporta writes it with a follow-up `UPDATE status_history … WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1` (`IncidentController.php:179-185`, and again at 216-222) — "latest row" targeting that attaches text to whatever row happens to be newest, and which fires from the generic PUT even when the status did not change. That pattern is not worth porting, and doing it *correctly* here (notes travelling in the same event payload) requires a new `UpdateIncidentStatusDto` field, a validated free-text column, and a product decision about whether notes are staff-visible only. Adding the column later is a trivial nullable `ALTER TABLE`; shipping the fragile version now is not reversible. GeoReporta's own list endpoint does not even select `notes`. |
| D6 | Response shape | `{items, total}`, ordered `created_at ASC, id ASC` (oldest first), **no pagination**, no `{data}` envelope | Laravel's `{data: [...]}`; paginated list | House rule (`SnakeCaseResponseInterceptor`, list endpoints return `{items, total}`). Ordering matches GeoReporta so a UI timeline reads top-down. Unpaginated is safe by construction: under L2 and `LEGAL_TRANSITIONS` (`pending→in_progress→resolved`, terminal) an incident has **at most 2** rows today, and the row count is bounded by the status graph, not by user input. |
| D7 | Immutability enforcement | **Application-level only**: no write route exists, and the repository exposes no update/delete method. Asserted by e2e (404 on `PATCH`/`DELETE`) | `REVOKE UPDATE, DELETE` from the app role; a `BEFORE UPDATE OR DELETE` guard trigger | A DELETE-blocking trigger is **actively harmful**: `status_history.incident_id` is `ON DELETE CASCADE`, so the trigger would abort any incident deletion and break referential cleanup. `REVOKE` requires pinning the Supabase app role name, which is nowhere in this repo, and a wrong grant statement in a manually-applied migration risks locking the app out of the table — a far worse failure than the threat it defends against. The realistic threat model here is "an accidental API route", and that is fully covered by not writing one. |
| D8 | D7-style import edges | The module may import: its own entity, `IncidentEntity` (flat, for the parent-existence 404), `INCIDENTS_STREAM_KEY` from `../incidents/incidents.service`, `decodeStreamEntry` from `../realtime/stream-event.util`, and `common/` guards/decorators. It may **NOT** import `IncidentsService`, `IncidentsModule`, `IncidentsRepository`, or any Incidents DTO | A shared typed event-payload module | See "D8 in detail". |

### D1 in detail — the permission conflict

`inferResourceFromPath` (`require-permission.decorator.ts:37-43`) takes the first segment after
`api`, so a nested route infers resource **`incidents`**. Accepting that would gate the audit trail
behind `READ incidents` — a permission that reporters/citizens already hold (`0009_roles_permissions.sql:56`),
which means every citizen could read who inside the organization touched their incident and when.
That is a silent privilege widening, and it is precisely what GeoReporta avoided with its dedicated
`status-history.view` gate.

Of the three options:

- **Top-level `/api/status-history?incident_id=`** gets the right resource by inference with no
  override, but abandons the URL both GeoReporta and `docs/tasks/1-BACKEND-MIGRATIONS.md` specify,
  and turns a naturally sub-resource read into a filtered collection.
- **Nested + explicit override** keeps the documented URL and gets a dedicated permission. The
  override is a first-class, documented feature of the decorator (its own docstring example is
  `@RequirePermission('UPDATE', 'incidents')`). T3.8's D1 rejected overrides because an `admin/`
  prefix would have forced one on *every* route of a full CRUD surface; here it is **one override on
  one read-only route**.

Pinned exactly:

```ts
@Controller('incidents/:incidentId/status-history')
export class StatusHistoryController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('READ', 'status-history')   // explicit — inference would yield 'incidents'
  list(@Param('incidentId', ParseUUIDPipe) incidentId: string) { /* … */ }
}
```

Migration 0014 inserts exactly one catalog row, `('status-history', 'READ')` — the same string
`formatPermissionString('READ', 'status-history')` produces. No CREATE/UPDATE/DELETE rows: under D7
they would be grantable permissions that map to no route, i.e. a lie in the catalog.

**Failure mode to test explicitly:** if the override is ever dropped, the guard silently falls back
to `READ incidents` and the endpoint opens up with no error anywhere. The e2e must assert that a
reporter who *does* hold `READ incidents` gets **403** on this route.

### D2 in detail — Streams over EventEmitter2

Both channels fire from the same `publish()` (`incidents.service.ts:136-139`).

EventEmitter2 is in-process and fire-and-forget: `IncidentNotificationsListener` wraps every handler
in a `try/catch` that swallows failures, and a process that dies between `emit()` and the handler's
DB insert loses the event with no trace and no way to detect the loss. For a notification that is an
acceptable degradation — the user misses a toast. For an audit trail it is not: **a trail with
silent holes is worth less than no trail**, because its gaps are indistinguishable from "nothing
happened". The incident row itself is the tell-tale — `status = 'resolved'` with zero history rows —
but nothing repairs it.

Redis Streams with a dedicated consumer group gives at-least-once delivery: an entry stays PENDING
until XACK, so a crash between delivery and insert is recovered on restart. Cost accepted:

- One more blocking Redis connection (`STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` in `core.module.ts`,
  mirroring `MAIL_EVENTS_BLOCKING_CLIENT`) — a slow audit write must not stall Mail ingestion.
- **Duplicates must be tolerated** → D4's `event_id` UNIQUE + `ON CONFLICT DO NOTHING`. This is
  what makes at-least-once safe; without it, a redelivery double-writes the trail.
- ACK policy differs deliberately from Mail's "always XACK". Contract: XACK on successful insert
  **and** on unique-conflict (already recorded) **and** on an undecodable/irrelevant event type.
  Do **not** XACK on a transient DB error — leave it PENDING for redelivery. To avoid a poison-pill
  loop, after a bounded number of delivery attempts the entry is logged at `error` and ACKed. Design
  phase pins the drain-pending-on-startup mechanism (`XREADGROUP … '0'` before switching to `'>'`,
  or `XAUTOCLAIM`) and the attempt cap.
- The group is created with `'$'` + `MKSTREAM` at `onModuleInit` (BUSYGROUP-tolerant, like Mail), so
  events published *before* the group first exists are not seen. That is a one-time first-deploy
  window, and it coincides with an empty table.

### D3 in detail — schema

```sql
CREATE TABLE IF NOT EXISTS status_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  changed_by_user_id uuid     NULL REFERENCES users (id)     ON DELETE SET NULL,
  previous_status    varchar(20) NOT NULL,
  new_status         varchar(20) NOT NULL,
  event_id           varchar(64) NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- CHECK previous_status IN ('pending','in_progress','resolved')
-- CHECK new_status      IN ('pending','in_progress','resolved')
-- CHECK previous_status <> new_status
-- INDEX (incident_id, created_at, id)
```

- `ON DELETE CASCADE` on `incident_id` matches GeoReporta and the rest of this schema: a deleted
  incident's audit trail has nothing left to audit.
- `changed_by_user_id` is **nullable with `ON DELETE SET NULL`**, deliberately diverging from a
  cascade: deleting a user must never delete the audit of what that user did. Nullable is the price
  of that FK action; it is never null on write (the route is authenticated — `actor_id` is always
  `req.user.userId`, confirmed by the anonymous-403 assertion in `flows.e2e-spec.ts:95-99`).
- Both status columns NOT NULL follows directly from L2 — there is no creation row, so there is no
  transition without a predecessor. The status vocabulary is the real one from
  `IncidentEntity` (`'pending' | 'in_progress' | 'resolved'`), not the doc's wider list.
- `previous_status <> new_status` encodes that only real transitions are recorded, and turns a
  future no-op-update bug into a loud constraint violation instead of a noise row.
- No `updated_at`. The table is append-only; an `updated_at` column would imply otherwise.

### D8 in detail — the "zero import edges" criterion

The acceptance criterion says "cero aristas de importación hacia/desde Incidents". Read literally
that is already violated by shipped code, so the operative rule is the one both precedents follow:
**no dependency on Incidents' behaviour, only on its data and its published contract.**

| Import | Verdict | Precedent |
|---|---|---|
| `INCIDENTS_STREAM_KEY` from `../incidents/incidents.service` | Sanctioned | `incident-mail.listener.ts:8` — a Redis key string, not a class |
| `IncidentEntity` from `../../entities/incident.entity` | Sanctioned | `notifications.module.ts` imports it directly; entities are flat and module-agnostic by house rule |
| `decodeStreamEntry` from `../realtime/stream-event.util` | Sanctioned | `incident-mail.listener.ts:9` — not an Incidents edge at all |
| `IncidentsService` / `IncidentsModule` / `IncidentsRepository` / Incidents DTOs | **Forbidden** | No precedent; would make the audit trail a dependent of the thing it audits |
| Incidents importing anything from `status-history` | **Forbidden** | The whole point: Incidents must not know the audit exists |

The event payload stays typed loosely (`Record<string, unknown>`) in the listener, matching both
existing listeners. No shared payload-type module is created — the alternative (a neutral
`common/events/` types file) is a bigger refactor than T3.4 warrants, and half-adopting it would
leave three listeners with three conventions.

Note for design: importing `INCIDENTS_STREAM_KEY` from `incidents.service.ts` pulls that module's
file into the graph. Relocating the constant to a neutral file would be cleaner but touches Mail and
Realtime — explicitly out of scope here, flagged for a future cleanup.

## Deviations from `docs/tasks/1-BACKEND-MIGRATIONS.md`

| Doc says | We ship | Why |
|---|---|---|
| "workflow 3-paso … produce **3** filas de auditoría" | **2** rows | The doc mis-counts: 3 *states* is 2 *transitions*. `pending` is the birth state, never transitioned *into*. L2 + GeoReporta's UPDATE-only trigger + the existing `expect(statusChangedCount).toBe(2)` at `flows.e2e-spec.ts:245` all agree on 2. **The doc's criterion should be corrected to 2 rows** — not edited by this phase; the correction belongs to whoever owns that file. Any spec/task/e2e written from this proposal must assert **2**. |
| Audit written by a DB trigger (implied by the GeoReporta port) | Application listener | L1 — actor attribution (`set_config`) is unimplementable in our stack without touching every write path. |
| `notes` field on history rows | Not shipped | D5 — GeoReporta's "update the latest row" write path is not worth porting; the column can be added later without a rewrite. |
| GeoReporta column `user_id` | `changed_by_user_id` | D3 — the doc itself uses `changed_by_user_id`; it disambiguates against `citizen_id`/`assigned_to`. |
| (silent on the permission) | Dedicated `status-history` resource via explicit override | D1 — inference would silently reuse `READ incidents`, which citizens already hold. |
| (silent on the channel) | Redis Streams consumer group, not EventEmitter2 | D2 — audit rows must survive a mid-event restart. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `database/migrations/0014_status_history.sql` | New | Table, FKs, CHECKs, indexes, `('status-history','READ')` catalog row |
| `database/rollback/0014_status_history.DOWN.sql` | New | `DROP TABLE status_history`; delete the permission row |
| `backend/src/entities/status-history.entity.ts` | New | Flat entity, camelCase props + `@Column({ name: … })` |
| `backend/src/modules/status-history/**` | New | module, listener, repository, service, controller |
| `backend/src/modules/incidents/incidents.service.ts` | Modified | **One line** (131): add `previous_status: current.status` to the published payload |
| `backend/src/core/core.module.ts` | Modified | Register `STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` |
| `backend/src/app.module.ts` | Modified | Register `StatusHistoryModule` |
| `backend/test/e2e/status-history.e2e-spec.ts` | New | 2-row lifecycle, ordering, 403 matrix, 404 parent, immutability, idempotency |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The explicit resource override is dropped in a refactor → endpoint silently gated by `READ incidents`, readable by citizens | Med | High | E2E asserts **403** for a user who holds `READ incidents` but not `READ status-history`; a unit test asserts the reflector metadata carries `resource: 'status-history'` |
| Stream redelivery double-writes rows | Med | High | D4 — `event_id` UNIQUE + `ON CONFLICT DO NOTHING`; a unit test feeds the same entry id twice and asserts one row |
| E2E flakiness from a third consumer group on `incidents:events` — recent commits already fought Redis connection drops, `maxWorkers` reduction, and consumer-group reset (`xtrim`) | **High** | Med | Reuse the exact reset strategy the mail e2e landed on (`xtrim`, not destroy/create); poll for the audit row with a bounded retry instead of a fixed sleep; ensure `onModuleDestroy` quits the dedicated client so teardown does not hang |
| Listener lags → a client reads `/status-history` immediately after a 200 `PATCH` and sees the row missing (the write is asynchronous by construction) | Med | Med | State it in the spec as the documented contract: the trail is eventually consistent, typically sub-100 ms. Consumers must not treat an empty trail as authoritative right after a write. E2E polls |
| An event that can never be inserted (e.g. incident already hard-deleted → FK violation) blocks the PENDING queue | Low | Med | D2's bounded-attempt rule: log at `error` and XACK after N attempts. Design phase pins N |
| Audit is bypassed by direct SQL | Low | Med | Accepted under L1 and stated in the spec, not hidden. Reviewable via the divergence between `incidents.status` and the last `new_status` |
| `previous_status` field is added but a future status-write path forgets to publish it → NOT NULL insert fails | Low | Med | The CHECK/NOT NULL makes it fail loudly at insert time (logged, entry eventually ACKed) rather than writing a corrupt row. `IncidentsRepository.updateStatus()` is the only status write today |
| Group created with `'$'` misses events published before first boot after deploy | Low | Low | One-time, coincides with an empty table. Documented, not engineered around |

## Rollback Plan

Apply `database/rollback/0014_status_history.DOWN.sql` (drops the table and the single permission
row), unregister `StatusHistoryModule` in `app.module.ts` and the Redis client token in
`core.module.ts`, delete the module directory and the entity. The one-line `previous_status` addition
in `incidents.service.ts` can stay — it is additive and inert without a consumer. Redis: delete the
`status-history` consumer group (`XGROUP DESTROY incidents:events status-history`). No other module's
data is touched; nothing in the system reads `status_history`.

## Dependencies

- Migrations 0001–0013 applied (0013 is the last applied; 0014 is next free). Manual application.
- `incidents`, `users`, `permissions` tables exist (0004, 0009).
- Redis available with the `incidents:events` stream — already a hard dependency of Mail and Realtime.
- Strict TDD active: `npm test` from `backend/`; E2E via `TestEnvironment` + Testcontainers.
- No dependency on T3.7/T3.8; no shared surface.

## Effort Estimate

| Slice | Estimate |
|---|---|
| Migration + rollback + entity | 0.25 d |
| Streams listener (group init, drain-pending, ACK policy, idempotency) + unit specs | 0.75 d |
| Repository/service/controller + permission wiring + unit specs | 0.5 d |
| E2E (lifecycle, 403 matrix, 404, immutability, idempotency, flake-hardening) | 0.5 d |
| **Total** | **~2 days** |

## Success Criteria

- [ ] `pending → in_progress → resolved` on one incident yields exactly **2** rows in `status_history`
      (not 3), with the first row `previous_status = 'pending', new_status = 'in_progress'`.
- [ ] Each row's `changed_by_user_id` is the authenticated actor who issued the `PATCH`, never the
      incident's `citizen_id` (unless they are the same user).
- [ ] `GET /api/incidents/:id/status-history` returns `{items, total}` ordered oldest-first.
- [ ] A user holding `READ incidents` but **not** `READ status-history` gets **403** on that route.
- [ ] An unauthenticated request gets **401**; a request for a non-existent incident gets **404**.
- [ ] `PATCH` / `DELETE` on the status-history path return **404** — no write route exists, and the
      repository exposes no update or delete method.
- [ ] Replaying the same stream entry id inserts no second row (`ON CONFLICT (event_id) DO NOTHING`).
- [ ] The `incident.status_changed` payload carries `previous_status`, and Mail/Notifications/Realtime
      e2e suites still pass unchanged.
- [ ] `backend/test/e2e/flows.e2e-spec.ts:245`'s `statusChangedCount === 2` still holds.
- [ ] `grep -r "incidents/incidents\.\(service\|module\|repository\)" backend/src/modules/status-history`
      matches only the `INCIDENTS_STREAM_KEY` import.
