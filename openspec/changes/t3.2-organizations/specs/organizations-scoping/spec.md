# Organizations Scoping Specification

## Purpose

Establish the organization as a real authorization boundary: a per-request subject scope, resolved once and enforced at the repository layer, that governs which incidents, comments, assignments, users, and realtime rooms a staff identity can see or act on — while preserving today's unscoped public incident view and existing e2e behaviour.

## Scope Summary

**In scope**
- `organizations` CRUD module (controller/service/repository, routes under `/api/organizations`)
- `SubjectScope` union, `resolveSubjectScope()`, `ROLE_RANK`, `assertCanManage()`
- `incidents.organization_id` column, index, backfill, derivation on create
- Scope threading into incidents, comments, assignments, users repositories/services
- Auth-context resolution + `perm:v2:` cache reshape
- Realtime room authorization (`org:`, `geo:`, `incident:` rooms)
- `PATCH /api/users/:id/organization`, rank check on `POST /roles/:id/assign`
- Migration `0015_organizations_scoping.sql` (+ rollback), role/permission seeds
- E2E: tenant isolation (HTTP + WebSocket), rank protection

**Out of scope**
- Inviting new users into an org (T3.6); `DELETE /api/users/:id`
- A "cross-org visibility" permission string (cross-org access is a system-role property, not a permission)
- Org hierarchy, category routing, `max_active_claims`, soft deletes
- Re-homing incidents when a zone boundary moves (org resolved once at write time)
- Field-level redaction of the public incident view
- Scoping `notifications`, `menus`, `geo-zones`, `incident-categories`
- Frontend work

## Requirements

### Subject Scope Model

The system MUST represent authorization scope as a discriminated union `SubjectScope` with exactly five variants: `global`, `org`, `org_assigned`, `public`, `deny`. The system MUST NOT represent scope as a role-name string, numeric rank, or optional `organizationId`.

`resolveSubjectScope()` MUST be a pure function (no I/O) that maps `(roleName, organizationId)` to a `SubjectScope` per this table: `admin_sistema`→`global`; `operador_sistema`→`global` (explicit branch); `admin_organizacion` with org set→`org`, with org NULL→`deny`; `operador_organizacion` with org set→`org_assigned`, with org NULL→`deny`; `reporter`→`public`; `role_id IS NULL` (unranked)→`public`.

An identity with `role_id IS NULL` MUST resolve to `public` scope, reproducing today's unscoped behaviour exactly, so that T3.2 is additive and no pre-existing identity's observable behaviour changes.

### Authorization Enforcement

Scope MUST be threaded as an explicit, required parameter into every repository/service method that returns tenant data (`IncidentsRepository.findAll/findOne`, `CommentsService.findByIncident`, `AssignmentsService.list`, `UsersService.list`). Scope MUST NOT be enforced via controller post-filtering, AsyncLocalStorage, or an ORM-level global scope. An unscoped call to a scoped method MUST fail at compile time, not silently default to `global`.

### Rank Protection

The system MUST enforce a strict role rank ordering (`admin_sistema` < `operador_sistema` < `admin_organizacion` < `operador_organizacion` < `reporter`) via a code constant `ROLE_RANK`, not a database column. An actor MAY write to (assign a role to, or move the organization of) a target user only when `rank(actor) < rank(target)`, strictly — equal rank MUST be blocked. Unknown or NULL role MUST resolve to `Number.MAX_SAFE_INTEGER` (unmanageable).

The system MUST evaluate checks in this order and MUST NOT let one override the other: (1) permission guard, (2) scope visibility (can the actor see the target at all), (3) rank (may the actor act on the target).

### Org Derivation on Create

`organization_id` on a new incident MUST be derived from the incident's resolved zone (`resolveZone(lat,lng)` → `zoneId` → `organizations.zone_id = zoneId`), never from the creator's own `organization_id`. An incident outside every zone, or whose zone has no organization, MUST persist `organization_id = NULL` and MUST still be accepted with `201`.

### Data Visibility

Each scoped resource MUST translate `SubjectScope` per the following table:

| Scope | Incidents | Comments/Assignments (parent scope) | Users |
|---|---|---|---|
| `global` | all rows | all | all |
| `org` | `organization_id = $org` | in scope, else 404 | `organization_id = $org` |
| `org_assigned` | `organization_id = $org AND assigned to $me` | in scope, else 404 | `organization_id = $org` |
| `public` | all rows (unchanged) | all comments; assignments denied (403, unreachable) | self only |
| `deny` | none (`[]`/404) | 404 | `[]` |

`public` MUST NOT be implemented as `WHERE 1=0`; it MUST return the full unscoped incident/comment view, identical to `global` for incidents today, because the incident corpus is public by design and the tenant boundary protects operational data only.

### Realtime Room Authorization

`canJoinRoom(ctx: AuthContext, room: string)` MUST authorize the specific requested room, not just a global permission. Rules: `user:{id}` — self only. `org:{id}` — `global` allowed; `org`/`org_assigned` allowed only if `id === ctx.organizationId`; `public`/`deny` denied. `geo:{zoneId}` — mirrors incident read scope, resolved by the zone's owning org. `incident:{id}` — resolved via that incident's `organization_id` compared to the caller's scope. `socket.data.scope` MUST be set at connect time from the same auth-context resolution used for HTTP.

### Cache Key Reshape

The auth-context (permissions + `organizationId` + `roleName` + derived `scope`) MUST be cached under a new key prefix `perm:v2:uid:{userId}`, distinct from the legacy `perm:uid:` prefix, because the cached value's shape changes from `string[]` to an object. The system MUST NOT reuse the `perm:` prefix for the new shape. Invalidation MUST delete both `v2` keying variants; no staleness bridging between old and new prefixes is required — old keys expire naturally.

### Lease Closures

Every access point that reads tenant-scoped data MUST accept and apply scope: `IncidentsRepository` (list/get), `CommentsService.findByIncident`, `AssignmentsService.list`, `UsersService.list`, and realtime room join. This list is exhaustive for T3.2; no scoped read path may be added later without an explicit scope parameter.

## Scenarios

#### Scenario: Org-scoped operator sees only own org's incidents

- GIVEN an `admin_organizacion` in Org A
- WHEN they call `GET /api/incidents`
- THEN the response contains only incidents with `organization_id = A`
- AND contains zero incidents belonging to Org B

#### Scenario: Cross-org read returns 404, not 403

- GIVEN an `admin_organizacion` in Org A and an incident belonging to Org B
- WHEN they call `GET /api/incidents/:id` for that Org B incident
- THEN the response is `404`
- AND the response is never `403`

#### Scenario: `operador_organizacion` sees only assigned incidents in own org

- GIVEN an `operador_organizacion` in Org A with one incident assigned to them and one unassigned Org A incident
- WHEN they call `GET /api/incidents`
- THEN the assigned incident is present
- AND the unassigned Org A incident is absent

#### Scenario: `admin_organizacion` with NULL org sees zero incidents

- GIVEN an `admin_organizacion` whose `organization_id` is `NULL`
- WHEN they call `GET /api/incidents`
- THEN the response contains zero incidents, not all incidents

#### Scenario: WebSocket room join blocked across orgs

- GIVEN a socket authenticated as Org A staff
- WHEN it emits `join {room: "org:<B>"}`
- THEN it receives `{joined: false}`
- AND it receives no subsequent event broadcast to `org:<B>`

#### Scenario: Rank check blocks org admin acting on a system admin

- GIVEN an `admin_organizacion` and an `admin_sistema` in the same organization
- WHEN the `admin_organizacion` calls `POST /roles/:id/assign` targeting the `admin_sistema`
- THEN the response is `403 INSUFFICIENT_ROLE_RANK`

#### Scenario: Equal rank is blocked

- GIVEN two `admin_sistema` accounts
- WHEN one calls `POST /roles/:id/assign` or `PATCH /users/:id/organization` targeting the other
- THEN the response is `403 INSUFFICIENT_ROLE_RANK`

#### Scenario: Incident created outside every zone still succeeds

- GIVEN a citizen report at coordinates outside every configured zone
- WHEN `POST /api/incidents` is called
- THEN the response is `201`
- AND the persisted incident has `organization_id = NULL`

#### Scenario: Backfill assigns organization from zone

- GIVEN existing incidents with non-NULL `zone_id` mapped to an organization via `organizations.zone_id`
- WHEN migration `0015` runs
- THEN each such incident's `organization_id` is set to the matching organization
- AND incidents with `zone_id IS NULL` retain `organization_id = NULL`

#### Scenario: `operador_sistema` sees incidents across both organizations

- GIVEN an `operador_sistema` identity
- WHEN they call `GET /api/incidents`
- THEN incidents from both Org A and Org B are present
- AND `resolveSubjectScope` unit tests assert this by name as an explicit `global` branch, not a fallthrough

## Acceptance Criteria

- [ ] A user in Org A listing `GET /api/incidents` receives zero incidents belonging to Org B (R8), and `GET /api/incidents/:id` on an Org B incident returns **404**, not 403.
- [ ] `operador_organizacion` in Org A sees only incidents in Org A **that are assigned to them** — an unassigned Org A incident is absent.
- [ ] `operador_sistema` sees incidents from **both** organizations (D3, explicit branch), and the unit test for `resolveSubjectScope` asserts this by name, not by fallthrough.
- [ ] An `admin_organizacion` with `organization_id = NULL` receives **zero** incidents — not all.
- [ ] `GET /api/comments/incident/:id` and `GET /api/assignments/incident/:id` on another org's incident return 404 for an org-scoped caller, even though the caller holds `READ`.
- [ ] `GET /api/users` returns only same-org users for an org-scoped caller.
- [ ] A socket authenticated as Org A staff calling `join {room: "org:<B>"}` receives `{joined: false}` **and** receives no subsequent event broadcast to that room.
- [ ] An incident created by an anonymous device inside Org A's zone is persisted with `organization_id = <A>` and appears for Org A staff (D4 — the crux; without this the whole scoping is inert).
- [ ] An incident created outside every zone is still accepted 201 with `organization_id = NULL` (R2 preserved).
- [ ] `admin_organizacion` calling `POST /roles/:id/assign` against an `admin_sistema` in the same org is rejected **403 `INSUFFICIENT_ROLE_RANK`**; against a user in another org, **404**.
- [ ] `admin_sistema` cannot assign a role to, or move, another `admin_sistema` (equal rank → 403).
- [ ] After 0015, existing incidents are backfilled from their zone's organization; incidents with `zone_id IS NULL` have `organization_id IS NULL`.
- [ ] **Every pre-existing e2e suite passes unmodified** (D2 — additive by construction).
- [ ] Every `organizations` route is denied 403 without the matching `ACTION organizations` permission.
</content>
