# Design: T3.4 StatusHistory — Append-Only Incident Status Audit Trail

Source: `sdd/t3.4-status-history/proposal` (#425, L1–L3 + D1–D8 locked). Artifact store: hybrid.
Migration: **0014**. Locked decisions are implemented here, not re-opened.

## Technical Approach

A new module `backend/src/modules/status-history/` with two independent halves:

- **Write half** — `IncidentStatusHistoryListener`, a Redis Streams consumer on `incidents:events`
  under its own group `status-history`, structurally mirroring `incident-mail.listener.ts` (group
  CREATE + MKSTREAM at `onModuleInit`, `while(running)` + `BLOCK`, per-entry decode/route) but with
  Mail's *outbox* consumer's XPENDING/XCLAIM sweep grafted on (`mail-outbox.consumer.ts:184-255`),
  because `incident-mail.listener.ts` always-XACKs and therefore cannot survive a failed write.
- **Read half** — controller/service/repository, one `GET`, no writes.

The only edit outside the new module and `core.module.ts` / `app.module.ts` is one line in
`incidents.service.ts:131` (L3).

---

## D1 — Blocking Redis client token

**Choice**: `STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` in `backend/src/core/core.module.ts`, a verbatim
copy of the `MAIL_EVENTS_BLOCKING_CLIENT` factory (`core.module.ts:130-142`) — `new Redis(cacheConf.streamsUrl, { lazyConnect: true, maxRetriesPerRequest: null, enableReadyCheck: true, retryStrategy: (t) => Math.min(t*200, 5000) })`
— added to both `providers` and `exports`. `CoreModule` is `@Global()`, so the new module injects it
with `@Inject(STATUS_HISTORY_EVENTS_BLOCKING_CLIENT)` without importing `CoreModule`.

**Rejected**: reusing `MAIL_EVENTS_BLOCKING_CLIENT` or `REDIS_BLOCKING_CLIENT`. ioredis serialises
commands per connection and `XREADGROUP … BLOCK 5000` holds one for the whole window; sharing would
put every sweep XPENDING/XCLAIM behind another consumer's block. This is the 5th connection and the
reasoning is already written down at `core.module.ts:23-54`.

**Consequence for the harness** (do not skip): `test-environment.ts` must `app.get<Redis>(STATUS_HISTORY_EVENTS_BLOCKING_CLIENT)`
and `.disconnect()` it in `stop()` alongside the two mail clients (`test-environment.ts:185-186, 332-334`).
Without it `app.close()` waits out a 5 s BLOCK on **every** e2e spec file, since `AppModule` loads
this module globally.

---

## D2 — Pending-drain mechanism: XPENDING → XCLAIM sweep

| Option | Verdict |
|---|---|
| `XREADGROUP … '0'` at startup, then switch to `'>'` | **Rejected — loses rows.** `'0'` returns only the *calling consumer's* PEL. `consumerName` embeds `process.pid` + `Math.random()` (mail precedent), so a restarted process has a new name and sees an empty `'0'` — exactly the crash-recovery case that justified Streams over EventEmitter2 in D2 of the proposal. Fixing it requires a stable consumer name, which then serialises multi-instance recovery through one PEL. |
| `XAUTOCLAIM` | **Rejected — no delivery counter.** One command instead of three, group-wide, correct. But it returns entries without Redis's per-entry delivery count, and D4's attempt cap needs that number. Sourcing it elsewhere means a side-channel (a Redis hash of attempts, or rewriting an `attempts` field into the entry) — new state with its own failure modes. |
| **XPENDING (extended) → XCLAIM, on an interval** | **Chosen.** Group-wide (`'-' '+'`), so it reclaims entries left by a *dead* consumer name; and its rows are `[entryId, consumer, idleMs, deliveryCount]` — the only place Redis exposes the native counter the ACK policy needs. |

Simplifications versus `MailOutboxConsumer.sweepImpl`, justified by "the only transient failure here
is the DB insert": **no dead-letter stream, no XDEL, no XRANGE lookup**. An exhausted entry is logged
at `error` and XACKed in place. There is no `status-history:dead` — a lost audit row must be loud in
the log, not parked in a second stream nobody reads.

**Tunables** — read via `ConfigService.get<number>(...) ?? default`, the inline pattern already used
at `mail-outbox.consumer.ts:83`; no new `*.config.ts` file (Mail has one because Mail has SMTP
settings, we have three numbers):

| Key | Prod default | E2E (`test-environment.ts` env) |
|---|---|---|
| `STATUS_HISTORY_XREADGROUP_BLOCK_MS` | 5000 | 1000 |
| `STATUS_HISTORY_SWEEP_INTERVAL_MS` | 10_000 | 300 |
| `STATUS_HISTORY_CLAIM_IDLE_MS` | 30_000 | 500 |
| `STATUS_HISTORY_MAX_ATTEMPTS` | **5** | 5 |

**Attempt cap = 5**, from Redis's own delivery counter (`XPENDING` row index 3). The counter is 1 on
first delivery, so 5 = one delivery + four reclaims ≈ 2.5 min of retry at the 30 s idle window. Mail
uses 3 for SMTP; an audit row is worth more retries than an email.

---

## D3 — ACK decision table

`processEntry(entryId, fields)` is the single decision point. `decodeStreamEntry` is reused from
`../realtime/stream-event.util` (pure, no Redis).

| Condition | DB | XACK? |
|---|---|---|
| `decodeStreamEntry` returns `null` (missing/unparsable `type`/`data`) | — | **ACK** + `warn` — undecodable is never retryable |
| `type !== 'incident.status_changed'` | — | **ACK** — the other 3 event types on this stream |
| Payload defect: `id`, `previous_status`, `new_status` missing, or `previous_status === new_status` | — | **ACK** + `error` — retry cannot fix a payload |
| `INSERT … RETURNING id` returns 1 row | inserted | **ACK** |
| `INSERT` returns 0 rows (`ON CONFLICT (event_id) DO NOTHING`) | already recorded | **ACK** |
| PG error `23503` FK / `23514` CHECK / `23502` NOT NULL / `22P02` invalid uuid | rejected | **ACK** + `error` — permanent; must not burn 5 retry cycles |
| Any other PG/driver error (connection, timeout, `40001`, `40P01`) | failed | **no ACK** → stays PENDING → sweep reclaims |
| Sweep sees `deliveryCount >= 5` | — | **ACK** + `error` (`audit row permanently lost: …`) — poison-pill escape |

**Field mapping** — the payload spreads the incident row, so the incident id arrives as `id`, not
`incident_id`:

| Column | Payload field |
|---|---|
| `incident_id` | `data.id` |
| `changed_by_user_id` | `data.actor_id` |
| `previous_status` | `data.previous_status` (added by L3) |
| `new_status` | `data.status` (the post-update value already in the row) |
| `event_id` | the Redis stream **entry id** (not from the payload) |

Payload stays `Record<string, unknown>`; no shared event-type module (proposal D8).

---

## D4 — Shutdown, and staying unit-testable without a `running` guard

Two regressions were fixed on this branch in `MailOutboxConsumer` and must not be reintroduced:
(a) a `running` guard inside `sweep()` made it unreachable from unit tests that never call
`onModuleInit`; (b) sweeps firing during teardown held work open while connections closed.

**Rule: `running` gates only the loop and error suppression — never a callable method body.**

```ts
async onModuleInit() {
  /* xgroup CREATE '$' MKSTREAM, BUSYGROUP-tolerant (mirrors incident-mail.listener.ts:53-63) */
  this.running = true;
  void this.loop();
  this.sweepTimer = setInterval(() => { if (this.running) void this.sweep(); }, sweepIntervalMs);
}                                     // ^ the guard lives HERE, in the scheduler, not in sweep()

async onModuleDestroy() {
  this.running = false;               // loop() exits at its next iteration
  if (this.sweepTimer) clearInterval(this.sweepTimer);
  await this.redis.quit().catch(() => undefined);
}
```

- `sweep()`, `processResponse()`, `processEntry()` are **public and unguarded** — a unit test
  constructs the class with a mocked ioredis object and calls them directly, exactly as
  `mail-outbox.consumer.spec.ts:49-53` constructs `MailOutboxConsumer`. No `onModuleInit`, no timers,
  no `running = true` prelude.
- Re-entrancy is handled by a separate `private sweeping = false` latch (kept from
  `mail-outbox.consumer.ts:187-194`) — that one is about overlapping intervals, not lifecycle, and is
  harmless in tests because it resets in a `finally`.
- `!this.running` is consulted in exactly two more places, both purely to **suppress noise**: the
  `catch` in `loop()` (`break` instead of logging a connection-closed error) and the `catch` around
  the sweep's `XPENDING` (skip the log). Neither changes behaviour when `running` is its `false`
  default in a unit test — the paths are still executed.
- No sweep can *start* after `onModuleDestroy` (the scheduler guard); an already-running sweep fails
  its next Redis command against the quitting connection and exits through its own `catch`, silently.

**Rejected**: awaiting an in-flight sweep in `onModuleDestroy`. That is what made teardown hold locks;
with an idempotent insert there is nothing to protect — a half-done sweep's entry is simply still
PENDING and gets redelivered next boot.

---

## D5 — Migration 0014

Status vocabulary **verified against source**, not invented: `0004_incidents.sql:25-26`
(`CHECK (status IN ('pending','in_progress','resolved'))`) and `LEGAL_TRANSITIONS` at
`incidents.service.ts:27-31` (`pending → in_progress → resolved`, terminal). The wider list in
`docs/tasks/1-BACKEND-MIGRATIONS.md` is not real.

`database/migrations/0014_status_history.sql`:

```sql
-- 0014_status_history.sql
-- Transito Alerta SE — append-only incident status audit trail (T3.4)
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Rollback: database/rollback/0014_status_history.DOWN.sql

BEGIN;

-- 1. Table (columns + PK only; every named constraint is added guarded below,
--    because CREATE TABLE IF NOT EXISTS silently skips inline constraints on a
--    database where the table already exists).
CREATE TABLE IF NOT EXISTS status_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid        NOT NULL,
  changed_by_user_id uuid            NULL,
  previous_status    varchar(20) NOT NULL,
  new_status         varchar(20) NOT NULL,
  event_id           varchar(64) NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- No updated_at: the table is append-only and a mutation column would imply otherwise.

-- 2. Constraints (PG has no ADD CONSTRAINT IF NOT EXISTS — pattern from 0013)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_status_history_incident') THEN
    ALTER TABLE status_history ADD CONSTRAINT fk_status_history_incident
      FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE;
  END IF;
END $$;

-- SET NULL, deliberately not CASCADE: deleting a user must never delete the
-- audit of what that user did. Nullable is the price of that FK action.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_status_history_user') THEN
    ALTER TABLE status_history ADD CONSTRAINT fk_status_history_user
      FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
  END IF;
END $$;

-- The idempotency key (proposal D4). This constraint IS the ON CONFLICT target.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_status_history_event_id') THEN
    ALTER TABLE status_history ADD CONSTRAINT uq_status_history_event_id UNIQUE (event_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_status_history_previous_status') THEN
    ALTER TABLE status_history ADD CONSTRAINT chk_status_history_previous_status
      CHECK (previous_status IN ('pending', 'in_progress', 'resolved'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_status_history_new_status') THEN
    ALTER TABLE status_history ADD CONSTRAINT chk_status_history_new_status
      CHECK (new_status IN ('pending', 'in_progress', 'resolved'));
  END IF;
END $$;

-- Only real transitions are recorded (L2). Turns a future no-op-update bug into
-- a loud constraint violation instead of a noise row.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_status_history_transition') THEN
    ALTER TABLE status_history ADD CONSTRAINT chk_status_history_transition
      CHECK (previous_status <> new_status);
  END IF;
END $$;

-- 3. Indexes -----------------------------------------------------------------
-- Serves the one read route verbatim: WHERE incident_id = $1 ORDER BY created_at, id.
CREATE INDEX IF NOT EXISTS idx_status_history_incident_created
  ON status_history (incident_id, created_at, id);
-- changed_by_user_id has no index: nothing queries by actor, and the ON DELETE
-- SET NULL scan is a rare admin operation.
-- event_id needs none: uq_status_history_event_id already creates a unique index.

-- 4. Permission catalog ------------------------------------------------------
-- Hyphenated 'status-history' — the exact string
-- formatPermissionString('READ', 'status-history') produces, and the exact
-- string the controller's explicit override passes (D6). READ only: under
-- proposal D7 there is no write route, so CREATE/UPDATE/DELETE rows would be
-- grantable permissions mapping to nothing — a lie in the catalog.
INSERT INTO permissions (resource, action) VALUES
  ('status-history', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
```

`database/rollback/0014_status_history.DOWN.sql`:

```sql
-- database/rollback/0014_status_history.DOWN.sql
-- T3.4: drops the audit trail table and its permission row. Destructive: the
-- rows cannot be reconstructed — incidents.status keeps only the current value.

BEGIN;

DELETE FROM permissions WHERE resource = 'status-history';

-- Drops the table with its constraints and idx_status_history_incident_created.
DROP TABLE IF EXISTS status_history;

COMMIT;
```

`test/support/run-migrations.ts` applies `database/migrations/[0-9]*.sql` in numeric order, so 0014
is picked up by the e2e harness with no harness edit.

---

## D6 — The permission override: **verified, no decorator change needed**

Read at `require-permission.decorator.ts:17-21` and `permission.guard.ts:39-56`:

- `RequirePermission(action: PermissionAction, resource?: string)` — the second positional argument
  **is supported today** and is stored as `{ action, resource }` under `REQUIRE_PERMISSION_KEY`. Its
  own docstring example is `@RequirePermission('UPDATE', 'incidents')`.
- `PermissionGuard.canActivate` line 49: `const resource = required.resource ?? inferResourceFromPath(request.path ?? '')`
  — the explicit value wins outright, inference is only the fallback.
- Line 52 → `hasPermission(userPermissions, 'READ', 'status-history')` → line 26
  `userPermissions.includes(formatPermissionString('READ','status-history'))` → the literal string
  **`"READ status-history"`**, which is exactly what migration 0014 catalogs and what
  `provisionUser([...])` writes into `users.permissions`.

No change to `backend/src/common/**`. Without the override, `inferResourceFromPath('/api/incidents/<uuid>/status-history')`
returns `'incidents'` (it takes the segment after `api`, lines 37-43) and the route silently opens to
every citizen — the risk the e2e 403 test exists to catch.

---

## D7 — Module wiring and the "zero import edges" criterion

```
StatusHistoryModule
  imports:     TypeOrmModule.forFeature([StatusHistoryEntity, IncidentEntity])
  controllers: StatusHistoryController
  providers:   IncidentStatusHistoryListener, StatusHistoryService, StatusHistoryRepository
  exports:     (none)
```

| Import | Why sanctioned |
|---|---|
| `IncidentEntity` from `../../entities/incident.entity` | Entities are flat and module-agnostic by house rule; `notifications.module.ts:8,11` does exactly this. Needed only for the parent-existence 404. |
| `INCIDENTS_STREAM_KEY` from `../incidents/incidents.service` | A Redis key string, not a class — `incident-mail.listener.ts:8` precedent. Flagged in the proposal as a future relocation to a neutral file (touches Mail + Realtime, out of scope). |
| `decodeStreamEntry` from `../realtime/stream-event.util` | Pure function, not an Incidents edge at all (`incident-mail.listener.ts:9`). |
| `STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` from `../../core/core.module` | `@Global()` provider; a token, no module import. |
| `IncidentsService` / `IncidentsModule` / `IncidentsRepository` / Incidents DTOs | **Forbidden.** |
| Anything in `incidents/` importing `status-history/` | **Forbidden** — Incidents must not know the audit exists. |

**Why the nested route needs no Incidents import**: Nest has no route-nesting or parent-resource API —
`@Controller('incidents/:incidentId/status-history')` is a *path prefix string* on an ordinary
controller registered by its own module. The only cross-controller concern is route collision, and
there is none: `IncidentsController` owns two-segment `incidents/:id` paths, this is a distinct
three-segment path, so Express's matcher separates them regardless of module registration order in
`app.module.ts` (the house "static before `:id`" rule is about siblings within one segment position
and does not apply). `StatusHistoryModule` can therefore sit anywhere in `AppModule.imports`.

---

## D8 — Read path and persistence style

- **Insert** — raw `@InjectDataSource().query()` with `$n` params (house rule: raw SQL for what
  TypeORM cannot express). `INSERT … ON CONFLICT (event_id) DO NOTHING RETURNING id`; `rows.length`
  is the insert/duplicate signal the ACK table (D3) branches on. TypeORM's `orIgnore()` does not give
  a reliable per-row conflict signal across drivers.
- **Read** — plain TypeORM repository: `find({ where: { incidentId }, order: { createdAt: 'ASC', id: 'ASC' } })`.
  Nothing here needs SQL.
- **Service** — `exist()` on `IncidentEntity` first → `NotFoundException` (404) for an unknown
  incident; then `{ items, total: items.length }` (no `{data}` envelope, house rule; no pagination,
  proposal D6). Note the ordering versus Laravel: the **guard runs before the handler**, so an
  unauthorised caller gets **403 even for a non-existent incident**, where Laravel 404s first. That
  is the safer order (no existence oracle) and is the documented contract.
- **Entity** — `backend/src/entities/status-history.entity.ts`, flat, camelCase props with
  `@Column({ name: 'snake_case' })`, no self-relations. `SnakeCaseResponseInterceptor` converts the
  camelCase props back to `previous_status` / `changed_by_user_id` on the wire.

## Data Flow

```
PATCH /api/incidents/:id/status
        │
        ▼
IncidentsService.updateStatus()  ── current.status captured at :113 ──┐
        │  UPDATE incidents SET status                                │
        ▼                                                             │
publish('incident.status_changed', {...updated, actor_id,  ◄──────────┘  ← the ONE line, :131
                                    previous_status})
        ├── EventEmitter2 ──► Notifications  (unchanged, ignores the new key)
        └── XADD incidents:events
                 │
                 ├── group 'realtime'  (unchanged)
                 ├── group 'mail'      (unchanged)
                 └── group 'status-history'  ◄── NEW, own blocking connection
                          │  XREADGROUP '>' BLOCK        ┌── XPENDING/XCLAIM sweep (10 s)
                          ▼                              │      deliveryCount >= 5 → log+ACK
                    processEntry(entryId, fields)  ◄─────┘
                          │  INSERT … ON CONFLICT (event_id) DO NOTHING
                          ▼
                    status_history  ──► GET /api/incidents/:incidentId/status-history
                                          (RequirePermission('READ','status-history'))
```

The trail is **eventually consistent by construction**: a read issued immediately after a 200 `PATCH`
may not see the row yet (typically sub-100 ms). Documented contract, not a defect.

## File Changes

| File | Action | Description |
|---|---|---|
| `database/migrations/0014_status_history.sql` | Create | Table, guarded constraints, index, permission row (D5) |
| `database/rollback/0014_status_history.DOWN.sql` | Create | `DROP TABLE` + delete the permission row |
| `backend/src/entities/status-history.entity.ts` | Create | Flat entity, camelCase + `@Column({name})` |
| `backend/src/modules/status-history/status-history.module.ts` | Create | Wiring per D7 |
| `backend/src/modules/status-history/incident-status-history.listener.ts` | Create | Streams consumer + sweep (D2/D3/D4) |
| `backend/src/modules/status-history/status-history.repository.ts` | Create | Raw idempotent insert + ordered read (D8) |
| `backend/src/modules/status-history/status-history.service.ts` | Create | 404 on unknown incident, `{items,total}` |
| `backend/src/modules/status-history/status-history.controller.ts` | Create | `GET`, explicit permission override (D6) |
| `backend/src/core/core.module.ts` | Modify | `STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` provider + export (D1) |
| `backend/src/app.module.ts` | Modify | Register `StatusHistoryModule` |
| `backend/src/modules/incidents/incidents.service.ts` | Modify | **One line** (131): `previous_status: current.status` (L3) |
| `backend/test/support/test-environment.ts` | Modify | Hold + `disconnect()` the new client; 3 env tunables; add `status_history` to the `TRUNCATE` list |
| `backend/src/modules/status-history/*.spec.ts` | Create | Unit specs (co-located, mail precedent) |
| `backend/test/e2e/status-history.e2e-spec.ts` | Create | E2E |

## Testing Strategy (Strict TDD — `npm test` from `backend/`)

| Layer | What | How |
|---|---|---|
| Unit | **The D3 decision table**, row by row | Construct the listener with a plain mocked ioredis object (`mail-outbox.consumer.spec.ts:34-54` shape) and call `processResponse` / `processEntry` **directly** — never `onModuleInit`, no timers, no real Redis. Assert `xack` called / not called and the datasource `query` args per row. |
| Unit | Sweep reachability (anti-regression for the `running` bug) | Call `sweep()` directly on a freshly constructed instance (`running === false`) with `xpending` mocked; assert it reclaims and processes. If this test ever needs `onModuleInit` first, D4 has been violated. |
| Unit | Attempt cap | `xpending` returns `deliveryCount = 5`; assert `xack` + `error` log and **no** `xclaim`. |
| Unit | Permission metadata | `Reflect.getMetadata(REQUIRE_PERMISSION_KEY, StatusHistoryController.prototype.list)` equals `{ action: 'READ', resource: 'status-history' }` — catches a dropped override at unit speed. |
| Unit | Service | 404 when the incident does not exist; `{items,total}` and `created_at ASC, id ASC` ordering. |
| E2E | 2-row lifecycle | `pending→in_progress→resolved`; **poll**, never sleep. Row 1 `previous_status='pending'`, `changed_by_user_id === operator.userId`. Asserts **2** rows, not 3 (L2). |
| E2E | Permission matrix | 401 (no header), **403**, 200. |
| E2E | 404 / immutability | Unknown-but-valid uuid → 404; `PATCH`/`DELETE` on the path → 404 (no route exists). |
| E2E | Idempotency | Call `env.app.get(StatusHistoryRepository).insert(...)` twice with the same `event_id` against real Postgres; assert exactly 1 row. (Cannot be driven through XADD: stream ids are monotonic, so a replayed *entry id* is not producible from a test.) |
| Regression | `flows.e2e-spec.ts:245` `statusChangedCount === 2` and the mail/notifications/realtime suites | Unchanged — the payload widen is additive and every consumer reads named keys. |

**Flake hardening — this is the THIRD consumer group on `incidents:events`:**

- `beforeEach`: `await env.reset()`, then `await env.redisStreams.xtrim(INCIDENTS_STREAM_KEY, 'MAXLEN', '~', 0)`.
  **Do NOT `XGROUP DESTROY`/`CREATE` the `status-history` group.** `mail:outbox` is a private stream
  and can tolerate it; `incidents:events` has three live loops parked in `XREADGROUP … BLOCK`, and
  the window between `DESTROY` and `CREATE` is a `NOGROUP` race — which is the exact class of
  flakiness the last three commits on this branch fought (`test-environment.ts:239-256` documents why
  `reset()` refuses to `flushdb` the streams DB at all). `XTRIM MAXLEN 0` clears entries while
  preserving every group registration.
- `xtrim` does not clear PELs. Follow it with a bounded best-effort drain: `XPENDING incidents:events status-history - + 100`
  → `XACK` each id, wrapped in `try/catch`. Otherwise a prior test's unacked entry gets swept
  mid-next-test and inserts a row the current test did not create.
- Polling: copy the local `waitUntil(check, 15_000, 100)` helper from `mail.e2e-spec.ts:8-19`. Copy,
  do not promote to `test/support/` — T3.4 is not the place for a shared-helper refactor.
- `env.reset()`'s `TRUNCATE … CASCADE` already reaches `status_history` through the `incidents` FK,
  but add it to the explicit table list anyway so the cleanup is legible rather than incidental.
- Keep `maxWorkers=1` for e2e (already set on this branch).

**403 setup, with `provisionUser` exactly as it is today** — no harness change needed.
`provisionUser` writes its `permissions` array straight into `users.permissions` (jsonb) at
`test-environment.ts:273-276` and logs in through the real `/api/auth/login`, so the token carries
whatever strings were passed; the `permissions` catalog table is informational only (see the comment
at `0013_geo_zones_hierarchy.sql:72-77`) and no role row is involved.

```ts
const denied  = await env.provisionUser(['READ incidents', 'UPDATE incidents']);   // → 403
const allowed = await env.provisionUser(['READ incidents', 'READ status-history']); // → 200
```

`denied` deliberately holds `READ incidents` — the whole point is that the *inferred* resource would
have let it through.

## Migration / Rollout

Migration 0014 is applied **manually** (house rule) before the code ships; the table is empty and no
backfill exists or is possible. The group is created with `'$'` + `MKSTREAM`, so events published
before the first boot after deploy are not seen — a one-time window that coincides with an empty
table. Rollback: apply the `.DOWN.sql`, unregister the module and the Redis token, delete the module
directory and entity, `XGROUP DESTROY incidents:events status-history`. The one-line
`previous_status` addition may stay — additive and inert without a consumer.

## Open Questions

None blocking. Two flagged non-blockers, both explicitly out of scope: relocating
`INCIDENTS_STREAM_KEY` to a neutral file (touches Mail + Realtime), and correcting
`docs/tasks/1-BACKEND-MIGRATIONS.md`'s "3 filas de auditoría" to 2 (owned by that file's author).
