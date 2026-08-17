# status-history Specification

Derived from proposal `openspec/changes/t3.4-status-history/proposal.md` (Engram
`sdd/t3.4-status-history/proposal`, #425). New capability — no prior spec exists.

## Purpose

Durable, append-only, per-transition audit trail of `incidents.status`, written by an
application-side Redis Streams listener (not a DB trigger, not the write path itself),
exposed through exactly one staff-gated read route distinct from the incident's own
`READ` permission.

## Assumptions

- `AS-1`: All Locked Design Decisions (L1–L3) and pinned Decisions (D1–D8) in the proposal
  are restated here as normative, not re-decided.
- `AS-2`: `docs/tasks/1-BACKEND-MIGRATIONS.md` states the 3-step workflow
  `pending → in_progress → resolved` produces "3 filas" of audit. This mis-counts: 3
  *states* is 2 *transitions*, and `pending` is the birth state, never transitioned into.
  Every requirement and test scenario in this spec asserts **2** rows, matching L2 and the
  existing `flows.e2e-spec.ts:245` assertion. This doc is not corrected by this change.
- `AS-3`: Non-existent parent incident on the read route returns **404**, not an empty
  200. `incidents/:id` already 404s for a bad id elsewhere in the API (`incidents.service.ts`
  `findOne`), so a nested resource under a non-existent parent following the same 404
  convention does not leak any information a citizen couldn't already get by hitting
  `GET /api/incidents/:id` directly (gated by `READ incidents`, which the requesting role
  already needs to reach this nested route meaningfully). An incident that exists but has
  no transitions yet returns **200 with an empty `items` array** — the incident is real,
  its history is legitimately empty (still `pending`, never PATCHed).
- `AS-4`: `changed_by_user_id` is returned **raw** (a uuid string), not expanded to a user
  object. The proposal fixes the response shape as `{items, total}` with no join/expansion
  mentioned anywhere in D3/D6; expanding to a user object would require a join or N+1 query
  Incidents-style endpoints don't otherwise do for actor fields, and no consumer (frontend
  is out of scope) is specified as needing display names in this change.
- `AS-5`: The read route does not paginate (D6, explicit) — the row count is bounded by the
  status graph (`pending→in_progress→resolved`, terminal), max 2 rows per incident today, so
  `{items, total}` returns the full trail unconditionally.

## Requirements

### Data Model
- **MUST**: New table `status_history` per the schema in proposal D3: `id` (uuid PK),
  `incident_id` (uuid NOT NULL, FK `incidents(id)` `ON DELETE CASCADE`),
  `changed_by_user_id` (uuid NULL, FK `users(id)` `ON DELETE SET NULL`), `previous_status`
  (varchar(20) NOT NULL), `new_status` (varchar(20) NOT NULL), `event_id` (varchar(64) NOT
  NULL UNIQUE), `created_at` (timestamptz NOT NULL DEFAULT now()).
- **MUST**: CHECK constraints restrict `previous_status` and `new_status` to
  `{'pending', 'in_progress', 'resolved'}` (the real `IncidentEntity` status vocabulary, not
  the doc's wider list) and enforce `previous_status <> new_status`.
- **MUST NOT**: The table has no `updated_at` column and no `notes` column. It is
  append-only by construction; either column would imply otherwise or resurrect the
  out-of-scope D5 write path.
- **MUST**: Index `(incident_id, created_at, id)` supports the read route's ordering.
- **MUST**: Migration `0014_status_history.sql` also inserts exactly one permission catalog
  row: `('status-history', 'READ')`. No `CREATE`/`UPDATE`/`DELETE` rows — under D7 they would
  be grantable permissions mapping to no route.
- **MUST**: `database/rollback/0014_status_history.DOWN.sql` drops the table and deletes the
  one permission row.

### Append-Only Guarantee
- **MUST NOT**: Creating an incident (`incident.created`) writes no row to `status_history`.
  Only `incident.status_changed` events are consumed (L2).
- **MUST NOT**: A status transition rejected by `IncidentsService.updateStatus` before
  `publish()` is called (illegal transition, e.g. `pending → resolved` directly) writes no
  row — the event is never published, so the listener never sees it.
- **MUST**: The full `pending → in_progress → resolved` lifecycle on one incident writes
  exactly **2** rows: `{previous_status: 'pending', new_status: 'in_progress'}` then
  `{previous_status: 'in_progress', new_status: 'resolved'}`.
- **MUST**: No HTTP route exists to update or delete a `status_history` row. The
  `StatusHistoryRepository` exposes no update or delete method (D7). A DB-level
  DELETE-blocking trigger is explicitly rejected — `incident_id ON DELETE CASCADE` must be
  allowed to fire when the parent incident is deleted.
- **MUST**: Deleting the parent incident cascades and removes its `status_history` rows
  (`ON DELETE CASCADE` on `incident_id`).
- **MUST**: Deleting the acting user sets `changed_by_user_id` to `NULL` on their rows; the
  rows themselves are preserved (`ON DELETE SET NULL` on `changed_by_user_id`).

### Listener Contract
- **MUST**: A dedicated Redis Streams consumer, group name `status-history`, reading
  `INCIDENTS_STREAM_KEY` (`incidents:events`) — the same stream `IncidentMailListener` and
  `RealtimeStreamsConsumer` already consume, via its own group so delivery/ack state is
  isolated from theirs.
- **MUST**: The group is created with `'$'` + `MKSTREAM` at `onModuleInit`, tolerating
  `BUSYGROUP` (group already exists) the same way Mail's consumer does. Events published
  before the group first exists are not seen — a one-time first-deploy window that
  coincides with an empty table.
- **MUST**: Only `incident.status_changed` events are acted on. Any other decoded event type
  on the stream (`incident.created`, `incident.assigned`, …) is XACKed without an insert.
- **MUST**: On a successful insert, XACK the entry.
- **MUST**: On a unique-constraint conflict (the row for this `event_id` already exists),
  XACK the entry — this is the expected idempotent-replay outcome, not a failure.
- **MUST**: On an undecodable event payload, XACK the entry (it can never be processed;
  leaving it PENDING forever would poison the queue for no benefit).
- **MUST NOT**: On a transient DB error (e.g. connection failure), the entry is left PENDING
  for redelivery — no XACK.
- **MUST**: After a bounded number of delivery attempts on the same entry (cap fixed at
  design time), the entry is logged at `error` level and XACKed, preventing an unrecoverable
  entry from blocking the PENDING queue forever.

### Idempotency
- **MUST**: `event_id` (the Redis stream entry id, e.g. `1699999999999-0`) is stored as a
  `varchar(64) NOT NULL UNIQUE` column. Insert is performed via
  `INSERT ... ON CONFLICT (event_id) DO NOTHING`.
- **MUST**: Redelivering the same stream entry (consumer crash before XACK, `XCLAIM` after a
  pending-entry timeout, restart replaying pending entries) results in **at most one** row
  for that `event_id`, never a duplicate.

### Read Route — `GET /api/incidents/:incidentId/status-history`
- **MUST**: Require authentication (`JwtAuthGuard`) and an **explicit** resource override:
  `@RequirePermission('READ', 'status-history')`. Path-inference would yield resource
  `incidents` (`inferResourceFromPath` takes the first segment after `api`), which reporters
  already hold via `READ incidents` (`0009_roles_permissions.sql:56`) — the override exists
  specifically to prevent that silent privilege widening (D1).
- **MUST**: Return `{items, total}` (no `{data}` envelope, per house convention for list
  endpoints), each item carrying at minimum `id`, `incident_id`, `changed_by_user_id`
  (raw uuid, AS-4), `previous_status`, `new_status`, `created_at`.
- **MUST**: Order rows `created_at ASC, id ASC` — oldest first (matches GeoReporta's timeline
  convention). `id ASC` is the tiebreaker for rows sharing an identical `created_at`
  timestamp (theoretically possible since Postgres `timestamptz` has microsecond, not
  infinite, resolution).
- **MUST NOT**: The route does not paginate (D6, AS-5) — it always returns the full trail.
- **MUST**: Return **404** if `:incidentId` does not correspond to an existing incident row
  (AS-3).
- **MUST**: Return **200** with `{items: [], total: 0}` if the incident exists but has no
  status_history rows yet (still `pending`, never transitioned).
- **MUST**: Return **401** for an unauthenticated request.
- **MUST**: Return **403** for an authenticated request lacking `READ status-history`, even
  if the requester holds `READ incidents`.
- **MUST NOT**: No `PATCH`, `PUT`, or `DELETE` route exists on
  `incidents/:incidentId/status-history` or `incidents/:incidentId/status-history/:id`. Such
  requests return whatever Nest's routing produces for an unmatched method on a matched path
  prefix (404, since no route with that method+path exists in this module or any other).

### Eventual Consistency (documented contract, not a defect)
- **MUST**: The trail is eventually consistent with respect to a `PATCH
  /incidents/:id/status` call. A `200` response from the `PATCH` guarantees the transition
  was accepted and the event was published to the stream; it does **not** guarantee the
  `status_history` row exists yet — the listener consumes asynchronously, typically within
  low tens of milliseconds but with no upper bound guaranteed by this spec.
- **MUST NOT**: No test scenario in this spec (or in code written from it) asserts a
  `status_history` row exists immediately after a `PATCH` response without polling. Consumers
  of the read route (including the E2E suite) MUST treat an empty or short trail
  immediately after a write as expected, not as a bug, and poll with a bounded retry instead.

### Import Boundaries (carried from proposal D8, restated as a normative constraint)
- **MUST**: The `status-history` module may import: its own entity, `IncidentEntity` (flat,
  for the parent-existence 404 check), `INCIDENTS_STREAM_KEY` from
  `../incidents/incidents.service`, `decodeStreamEntry` from
  `../realtime/stream-event.util`, and shared `common/` guards/decorators.
- **MUST NOT**: The module may not import `IncidentsService`, `IncidentsModule`,
  `IncidentsRepository`, or any Incidents DTO. Incidents may not import anything from
  `status-history`.

## Test Scenarios

### TS-1: Single Transition Writes One Correct Row
GIVEN an incident in `pending`, owned/authenticated actor U. WHEN U calls
`PATCH /api/incidents/:id/status { status: 'in_progress' }` and succeeds (200). THEN,
polling `status_history` for that incident, exactly one row appears with
`previous_status = 'pending'`, `new_status = 'in_progress'`, `changed_by_user_id = U.userId`.

### TS-2: Full Lifecycle Yields Exactly 2 Rows, In Order
GIVEN an incident in `pending`. WHEN it is transitioned `pending → in_progress` then
`in_progress → resolved` (two successful `PATCH` calls). THEN, after polling,
`GET /api/incidents/:id/status-history` returns `{items: [...], total: 2}` with `items[0]`
= `{previous_status: 'pending', new_status: 'in_progress'}` and `items[1]` =
`{previous_status: 'in_progress', new_status: 'resolved'}`, ordered oldest-first.

### TS-3: Creating an Incident Writes No Row
GIVEN no incidents exist. WHEN `POST /api/incidents` succeeds (201), creating an incident in
`pending`. THEN, after a bounded wait, `status_history` has zero rows for that incident id.

### TS-4: Rejected Illegal Transition Writes No Row
GIVEN an incident in `pending`. WHEN `PATCH /api/incidents/:id/status { status: 'resolved' }`
is called (an illegal `pending → resolved` jump) and returns 400. THEN, after a bounded
wait, `status_history` has zero rows for that incident id — the event was never published
because the service throws before `publish()`.

### TS-5: Duplicate Stream Delivery Writes Only One Row
GIVEN a `status_history` listener has already durably recorded a transition for stream entry
id `E`. WHEN entry `E` is redelivered (simulated redelivery / replay of the same entry id).
THEN `status_history` still has exactly one row for `event_id = E` — the second insert hits
`ON CONFLICT (event_id) DO NOTHING` and the entry is XACKed without a second row.

### TS-6: Trail Survives Deletion of the Acting User
GIVEN a recorded transition with `changed_by_user_id = U.userId`. WHEN user U is deleted.
THEN the `status_history` row still exists; its `changed_by_user_id` is now `NULL`.

### TS-7: Deleting the Incident Removes Its Trail
GIVEN an incident with 2 recorded transitions. WHEN the incident is deleted. THEN both
`status_history` rows for that incident are gone (`ON DELETE CASCADE`).

### TS-8: `READ incidents` Alone Is Insufficient (403) — Security Regression Guard
GIVEN a user U holding `READ incidents` but NOT `READ status-history`. WHEN U calls
`GET /api/incidents/:id/status-history` for an existing incident. THEN **403**. This is the
guard for D1: if the explicit resource override on the route is ever dropped, the guard
falls back to inferring resource `incidents` and this test starts failing (turning silent
privilege widening into a loud CI failure).

### TS-9: Authorized Caller Gets the Trail
GIVEN a user U holding `READ status-history` (and any incident-related permission needed to
resolve `:incidentId`, e.g. `READ incidents`). WHEN U calls
`GET /api/incidents/:id/status-history` after two recorded transitions. THEN **200** with
`{items: [...], total: 2}` in oldest-first order.

### TS-10: No Route Exists to Modify or Delete a Row
GIVEN an existing `status_history` row for incident `:id`. WHEN a caller sends
`PATCH /api/incidents/:id/status-history` or `DELETE /api/incidents/:id/status-history`
(and, if a per-row path is guessed, `PATCH`/`DELETE /api/incidents/:id/status-history/:rowId`).
THEN **404** for all of the above — no such route is registered anywhere in the app.

### TS-11: Incident With No Transitions Yet Returns Empty 200
GIVEN a freshly created incident still in `pending`, never PATCHed. WHEN
`GET /api/incidents/:id/status-history` is called by an authorized user. THEN **200** with
`{items: [], total: 0}`.

### TS-12: Non-Existent Incident Returns 404
GIVEN no incident exists with id `X`. WHEN
`GET /api/incidents/:X/status-history` is called by an authorized user. THEN **404**.

### TS-13: Unauthenticated Request Returns 401
GIVEN no `Authorization` header. WHEN
`GET /api/incidents/:id/status-history` is called for an existing incident. THEN **401**.

### TS-14: Eventual Consistency — Read Immediately After Write May Be Empty (documented, not a bug)
GIVEN an incident in `pending`. WHEN `PATCH /api/incidents/:id/status { status:
'in_progress' }` returns 200 and `GET /api/incidents/:id/status-history` is called with **no
delay and no polling**. THEN the response may legitimately be `{items: [], total: 0}` — this
is not asserted as a failure. The suite instead polls with a bounded retry (see
Test-Setup Constraints) to observe the eventual `{items: [...], total: 1}` state, and this
scenario exists to document that a same-tick assertion of the populated state is invalid,
not to encode a flaky race in CI.

## Error Mapping

| Condition | Status | Notes |
|---|---|---|
| `:incidentId` is not a valid UUID | 400 | `ParseUUIDPipe` on the route param |
| `:incidentId` does not reference an existing incident | 404 | — |
| No `Authorization` header / invalid token | 401 | `JwtAuthGuard` |
| Authenticated, missing `READ status-history` | 403 | `PermissionGuard`; holding `READ incidents` alone is NOT sufficient (TS-8) |
| Incident exists, zero transitions recorded | 200 | `{items: [], total: 0}` — not an error |
| `PATCH` / `PUT` / `DELETE` on the status-history path (any variant) | 404 | No such route is registered |
| Same stream entry (`event_id`) delivered twice | — (listener-internal, not HTTP) | `ON CONFLICT (event_id) DO NOTHING`; XACKed, no error surfaced |

## Test-Setup Constraints

- **MUST**: E2E scenarios that assert on `status_history` content (TS-1, TS-2, TS-9) MUST
  poll with a bounded retry (e.g. the existing `waitUntil(check, timeoutMs, intervalMs)`
  helper pattern used in `mail.e2e-spec.ts`) rather than asserting immediately after the
  `PATCH` response — the listener consumes asynchronously (see Eventual Consistency).
  Sleeping a fixed duration is not an acceptable substitute for polling.
- **MUST**: This suite registers a **third** consumer group (`status-history`) on
  `incidents:events`, alongside `realtime` and any group Mail's `IncidentMailListener` uses.
  `TestEnvironment.reset()` deliberately does not `flushdb()` the streams database, because
  that would delete `incidents:events` itself and the consumer groups created once at boot
  by long-lived consumers (`RealtimeStreamsConsumer`, and now the status-history listener) —
  nothing recreates a destroyed group after app startup. The three most recent commits on
  this branch fixed exactly this class of flakiness for `mail:outbox`/`mail:dead` by
  switching from `XGROUP DESTROY` + `XGROUP CREATE` (which fails/hangs when a live consumer
  loop is mid-`XREADGROUP` against a group that briefly does not exist) to
  `XTRIM <stream> MAXLEN 0` (or `MAXLEN ~ 0`) per test in `beforeEach`, which clears entries
  while leaving the stream key and any registered consumer group intact. Any `beforeEach`
  reset logic this suite adds for `incidents:events` MUST reuse the `xtrim` pattern, not
  destroy/recreate the `status-history` group.
- **MUST NOT**: No test sleeps a fixed duration to "wait for the listener" — all waits are
  bounded polls with an explicit timeout that fails loudly, not silently, if the condition
  never becomes true.

## Out of Scope (carried from proposal)

- `notes` column / free-text annotation on transitions (D5).
- A synthetic creation-time row (L2).
- A Postgres trigger writing audit rows (L1).
- Embedding `status_history` inside the incident detail payload (`IncidentResource::withDetail()`
  equivalent) — one read path only.
- Pagination and filtering on the history endpoint (D6).
- Backfilling history for incidents that changed status before migration 0014.
- Any UPDATE/DELETE route, admin correction endpoint, or retention/purge job.
- Frontend work.
