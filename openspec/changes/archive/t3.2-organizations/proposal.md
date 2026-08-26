# Proposal: T3.2 Organizations — Multi-Tenancy + RBAC Role Hierarchy

Source: `sdd/t3.2-organizations/explore` (#424), `sdd/t3.2-organizations/user-decisions` (#426).
Artifact store: hybrid. Next free migration: **0015** (T3.4 takes 0014 — see Dependencies).

## Intent

`organizations` has existed as a table since 0001 and as an entity since T1.2, and
`users.organization_id` has existed since 0006 — but **nothing reads either one**. Every
authenticated staff identity today sees every incident, every comment, every assignment, every
user, and can join every realtime room. That is invisible while there is one organization; it
becomes a data breach the day a second one is created.

T3.2 makes the organization a real authorization boundary. Concretely: it adds
`incidents.organization_id`, resolves a **subject scope** per request alongside the permissions
that are already resolved per request, threads that scope into every repository that returns
tenant data, seeds the four staff roles, and adds a rank-based protection so that no
organization-level administrator can act on a system-level account.

Treat this as a security boundary, not a feature. The success bar is not "org A cannot list org
B's incidents" — it is "there is no path, HTTP or WebSocket, by which org A observes org B".
That is why D5 puts every known leak inside this task: partial isolation is worse than none,
because it looks safe.

## Scope

### In Scope

- Migration `0015_organizations_scoping.sql` + `database/rollback/0015_organizations_scoping.DOWN.sql`:
  `incidents.organization_id`, its index, the partial UNIQUE on `organizations.zone_id`, the
  backfill, the `organizations` permission catalog rows, and the 4 role seeds.
- New module `backend/src/modules/organizations/` — controller/service/repository/module + DTOs,
  mirroring the `geo-zones` module shape. Routes: `GET /api/organizations`,
  `GET /api/organizations/:id`, `POST`, `PATCH /:id`, `DELETE /:id`.
- New `backend/src/common/authz/` — the `SubjectScope` union (D1), `resolveSubjectScope()` (pure),
  `ROLE_RANK` + `assertCanManage()` (D9/D10).
- `AuthService`: new `getAuthContextByUserId()` returning `{ permissions, organizationId, roleName }`
  under a **new** cache key prefix (D6); `getPermissionsByUserId()` retained as a thin wrapper.
- `JwtStrategy.validate` → `req.user` gains `organizationId`, `roleName`, `scope`.
- Scope threading (D3) into: `IncidentsRepository.findAll/findOne`, `CommentsService.findByIncident`,
  `AssignmentsService.list`, `UsersService.list`.
- `incidents.organization_id` derivation at create time (D4) + inclusion in emitted event payloads
  so `resolveRoomsForEvent` starts producing `org:{id}` rooms.
- Realtime: `socket.data.scope`, and `canJoinRoom` rewritten to authorize the **specific room**
  against that scope (D11).
- `PATCH /api/users/:id/organization` (D12) — the minimal admin assignment path.
- `RolesService.assignRole` gains the D9 rank check.
- `test-environment.ts provisionUser()` gains `organizationId` / `roleName` overrides (D13).
- Unit specs + `backend/test/e2e/organizations.e2e-spec.ts` (tenant isolation across HTTP **and**
  WebSocket) + a rank-protection e2e.

### Out of Scope

- **Invitations / inviting a new user directly into an org** — T3.6. T3.2 assigns an org to an
  *existing* user only.
- **`DELETE /api/users/:id`** — no such endpoint exists today and T3.2 does not add one. The D9
  rank machinery is built and enforced on the two write paths that DO exist (role assignment, org
  assignment) and is written so a future delete endpoint is one call away.
- **A cross-org visibility permission** (`READ cross-org incidents` from the task doc) — see
  Deviations. Cross-org visibility is a property of holding a *system* role, not of holding a
  magic permission string.
- **Org hierarchy** (`parent_id`), category-based routing, `max_active_claims`, soft deletes — D8.
- **Re-homing incidents when a zone boundary moves.** `incidents.organization_id` is resolved once
  at write time, exactly like `zone_id` (T3.8's Non-Retroactivity section). Editing
  `organizations.zone_id` does not move historical incidents.
- **Field-level redaction of the public incident view.** T3.2 changes *which rows* a subject sees,
  never *which columns*.
- Scoping `notifications` (already self-scoped by `user_id`), `menus` (static map), `geo-zones`,
  `incident-categories` (both global catalogs by design).
- Any frontend work.

## Capabilities

### New Capabilities

- `organizations-admin`: CRUD over tenant records, one-to-one with a `geo_zones` jurisdiction.
- `tenant-isolation`: a resolved-per-request subject scope enforced at the repository layer across
  incidents, comments, assignments, users, and realtime rooms.
- `role-hierarchy`: rank-ordered protection of user-management writes.

### Modified Capabilities

- `incidents`, `comments`, `assignments`, `users`, `realtime` — all gain a scope parameter. For
  every identity that exists **today** (all of which have `role_id IS NULL`) the observable
  behaviour is unchanged; see D2.

## Locked Design Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| D1 | Shape of the threaded scope | A **discriminated union**, `SubjectScope` (5 variants, below) | A role-name string; a numeric rank; `{ organizationId?: string }` | The repository must never branch on a role name — adding a sixth role would mean editing SQL in five files. A rank is an *ordering*, not a *filter*: it cannot express `org_assigned` (org AND assigned-to-me), which is two predicates. A bare optional `organizationId` cannot distinguish "global, no filter" from "misconfigured, deny everything" — and conflating those two is precisely GeoReporta's bug (D3 of the user decisions). The union makes the deny case a value you must handle, not an absence you might forget. |
| D2 | Default for an unranked identity | `role_id IS NULL` → scope `public` → **exactly today's behaviour** | Defaulting to `deny`; defaulting to `global` | Every user row in production and in every existing e2e has `role_id IS NULL` (`RolesService.assignRole` is the only writer and it is barely used; `users.role` varchar is a dead T1.4 stub that `assignRole` never updates — see D5). Defaulting to `deny` would 404 the entire existing test suite and every live citizen; defaulting to `global` would make the whole task a no-op. `public` makes T3.2 **additive**: isolation applies the moment a staff role is assigned, and not before. |
| D3 | Enforcement layer | Repository, scope passed as an explicit parameter | Controller post-filter; AsyncLocalStorage; a TypeORM global scope | **User-locked (D8).** Post-filtering fetches the other tenant's rows into process memory first and leaks them on any new endpoint that forgets to filter. ALS is invisible coupling and this codebase has none. The repositories are raw `dataSource.query()` (`incidents.repository.ts`), so a TypeORM-level global scope cannot see them at all. An explicit parameter follows the existing `citizenId`/`actorId` convention and makes an unscoped call a *compile error*, not a silent leak. |
| D4 | How `organization_id` is set on a new incident | **Derived from the resolved zone**: `resolveZone(lat,lng)` → `zoneId` → `organizations.zone_id = zoneId` → `organizationId`. NULL when the incident is outside every zone, or the zone has no org. The creator's own `organization_id` is **never** used. | Creator's org; NULL always; a client-supplied `organization_id` | This is the crux of the task. Incidents are created overwhelmingly by citizens and anonymous devices who have **no** organization — so "creator's org" yields NULL for the primary flow and the scoping never engages for the data that matters. Jurisdiction, not authorship, decides who works a case: an operator of org A reporting a pothole physically inside org B's canton must land in **B's** queue, and letting the creator's org win would let staff silently pull work into their own org. Client-supplied is trivially forgeable. Consequence, accepted and documented: an org-A operator who files an incident in org B's zone gets a 201 with the body, then **cannot read it back** — visibility follows jurisdiction. |
| D5 | Source of the role name | `users.role_id` → `roles.name`, via a LEFT JOIN inside the auth-context query | `users.role` (varchar) | `users.role` defaults to `'reporter'` for every row and `RolesService.assignRole` **never writes it** (`roles.service.ts:61-63` sets `roleId`, `permissions`, `permissionVersion` only). Reading it would report `reporter` for a user who was actually assigned `admin_sistema` — a scope decision based on a column the system stopped maintaining. `users.role` is hereby legacy; T3.2 does not drop it (out of scope) but nothing in the authorization path reads it. |
| D6 | Where the scope is resolved + cached | Folded into the existing per-user permission cache, under a **new key prefix** `perm:v2:` / `perm:v2:uid:` holding an `AuthContext` object | A second cache key `org:uid:{id}`; reusing the `perm:` prefix with a new value shape; putting it in the JWT | **User-locked (D8): not the JWT** — a user who changes organization would keep the old tenant until their token expired, the exact staleness problem `permission_version` exists to solve. A *second* key means two invalidation call sites, and the first writer that forgets one produces a user with fresh permissions and a stale tenant — the same failure in a new place. Folding gives one key, one TTL, one `del`. **The prefix must change**: keeping `perm:uid:` while changing the cached value from `string[]` to an object means a deploy against a warm Redis reads `cached.permissions === undefined` and 403s every request for up to the full 1h TTL. Old `perm:` keys are simply abandoned and expire. |
| D7 | Invalidation on org change | `PATCH /users/:id/organization` calls `invalidatePermissionCache()`; does **not** bump `permission_version` | Bumping `pv` too | `pv` means "the permission set changed"; an org move does not change it. Invalidation today is a direct `del`, not a `pv` comparison (`user.entity.ts:64-71` documents that `pv` is not yet compared against the token claim). **Forward-looking gotcha to carry into the design phase:** if a later release starts comparing the JWT `pv` against the row, org changes must start bumping it too, or a moved user keeps the old tenant. |
| D8 | Organization entity | Unchanged: `id, name, zone_id, created_at` | GeoReporta's `parent_id`, `incident_category_id`, `max_active_claims`, soft deletes | **User-locked (D7).** Self-relations are against convention (and T3.8/T3.7 already pay that complexity where it is earned); category routing and the claim/release workflow do not exist in this backend at all; this codebase has no soft deletes anywhere. |
| D9 | Where the rank lives | A **code constant**, `ROLE_RANK: Record<string, number>` in `common/authz/role-rank.ts`. Unknown or NULL role → `Number.MAX_SAFE_INTEGER` | A `roles.rank` integer column; deriving rank from permission count | A DB column is writable by anyone holding `UPDATE roles` — an org admin could set their own rank to 0 and then delete the master credential, which is the *precise* attack D4 exists to prevent. A security invariant must not be editable through the API it protects. The roles are seeded by migration and not user-creatable, so a code map loses no flexibility. Deriving from permission count produces a meaningless order (`operador_sistema` is read-heavy and would out-rank nobody). |
| D10 | Hierarchy vs org scope | **Both apply, ANDed.** Order: (1) `PermissionGuard`, (2) org scope — can the actor see the target at all, (3) rank — may the actor act on it. Neither overrides the other. | Hierarchy overrides scope; scope overrides hierarchy | They answer different questions: scope is "may I see this row", rank is "may I act on this row". If scope overrode rank, an `admin_organizacion` could act on an `admin_sistema` who happened to carry the same `organization_id` — the exact hole D4 was raised to close. If rank overrode scope, a high-rank actor would gain implicit cross-tenant reach that D4 never asked for. |
| D11 | Blocked-write status codes | Target **not visible under the actor's scope** → **404**. Target visible but `rank(actor) >= rank(target)` → **403 `INSUFFICIENT_ROLE_RANK`** | 403 for both; 404 for both | 404-when-invisible: a 403 confirms that a user id exists and, by elimination, that they belong to another org — org membership is exactly the tenant secret being protected. 403-when-visible: the actor can already see that user in their own org listing, so a 404 leaks nothing but *lies*, and a client cannot distinguish "gone" from "forbidden". The rule generalises: **404 when the actor could not have known the row exists; 403 when they demonstrably could.** |
| D12 | User → org assignment | `PATCH /api/users/:id/organization` `{ organization_id: uuid \| null }`, gated `@RequirePermission('UPDATE', 'users')` + D10 chain | Defer entirely to T3.6; a generic `PATCH /users/:id` | Deferring leaves no way to place two users in two orgs, so the core acceptance criterion has no e2e — the isolation would ship unverified. A *generic* user-update endpoint is a much larger surface (T3.6/T3.9 territory) and would need its own field-level authorization; a single-purpose route keeps the new attack surface to one field. `null` is accepted so a user can be removed from an org (and therefore falls to `deny`, not to `global` — see D1). |
| D13 | E2E provisioning | Extend `provisionUser(permissions, { organizationId, roleName, ... })` — direct SQL INSERT of `organization_id` and a `role_id` looked up by name | Driving provisioning through the new HTTP endpoints | The harness already inserts users directly (`test-environment.ts:273-276`) and then logs in through the real route so the token can never drift. Bootstrapping tenants through the API would make every isolation test depend on the correctness of the very authorization code under test. |
| D14 | Enforcement point for the rank check | A service-level `assertCanManage(actorCtx, targetUserId)`, not a guard decorator | A `RoleHierarchyGuard` | The check must load the target user row, which a decorator-driven guard cannot do without duplicating the fetch the service is about to perform anyway. Precedent: `CommentsService.delete` already enforces owner-only at the service layer for the same reason. |

### D1 — the scope object, pinned

```ts
// backend/src/common/authz/subject-scope.ts
export type SubjectScope =
  | { kind: 'global' }                                               // sees every organization
  | { kind: 'org'; organizationId: string }                          // sees one organization
  | { kind: 'org_assigned'; organizationId: string; userId: string } // one org, only own assignments
  | { kind: 'public' }                                               // citizen tier: public data only
  | { kind: 'deny'; reason: 'staff_without_organization' };          // explicit terminal deny

export interface AuthContext {
  userId: string;
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  scope: SubjectScope;
}
```

Role → scope (`resolveSubjectScope` — a pure function, zero I/O, exhaustively unit-tested):

| Role | `organization_id` | Scope | Note |
|---|---|---|---|
| `admin_sistema` | any | `global` | |
| `operador_sistema` | any | `global` | **Explicit branch (user D3)**, not a fallthrough. In GeoReporta this role matches none of the four `isX()` branches and ends up unscoped *by accident*; here it is a written-down decision. |
| `admin_organizacion` | set | `org` | |
| `admin_organizacion` | NULL | `deny` | GeoReporta produced `WHERE organization_id = NULL`, which matches nothing — right answer, wrong mechanism (implicit, and one `COALESCE` away from becoming `global`). |
| `operador_organizacion` | set | `org_assigned` | |
| `operador_organizacion` | NULL | `deny` | |
| `reporter` | any | `public` | |
| NULL / unknown role | any | `public` | D2 — every identity that exists today. |

`public` and `global` produce identical SQL for incidents **today**. They are nonetheless separate
constructors, because the day the public view is narrowed, `public` must narrow and `global` must
not — and a shared constructor would silently narrow both, or silently widen citizens to the admin
view.

### D3 — per-resource translation of the scope

The scope describes the **subject**, not the resource. Each repository translates it. This table is
normative; the spec phase turns each cell into a test.

| Scope | `GET /incidents` (+ `/:id`) | `GET /comments/incident/:id` | `GET /assignments/incident/:id` | `GET /users` |
|---|---|---|---|---|
| `global` | all rows | all | all | all users |
| `org` | `organization_id = $org` | only if parent incident is in scope, else **404** | only if parent incident is in scope, else **404** | `organization_id = $org` |
| `org_assigned` | `organization_id = $org AND EXISTS (SELECT 1 FROM assignments a WHERE a.incident_id = incidents.id AND a.operator_id = $me)` | parent incident in scope | parent incident in scope | `organization_id = $org` |
| `public` | **all rows — unchanged from today** | all comments on that incident | **deny** (`403`; also unreachable, the citizen tier holds no `READ assignments`) | **self only** |
| `deny` | `AND false` → `[]` / 404 | 404 | 404 | `[]` |

Two consequences are deliberate and must survive into the spec:

1. **`public` is not `WHERE 1=0`.** GeoReporta gives citizens `WHERE 1=0` on the org index *and* a
   separate unscoped Redis-backed public feed (`FeedController`). We have no feed module — for this
   product `GET /incidents` **is** the public feed. Denying citizens would (a) break the primary
   flow, in which a citizen posts a report and then sees it in the list, (b) break existing e2e
   coverage that lists incidents on the anonymous ceiling, and (c) hide public civic data that the
   product exists to publish. The incident corpus is public by design; the tenant boundary protects
   *operational* data — who is assigned, who the staff are, which rooms exist.
2. **Staff therefore see fewer incidents than the general public**, because an org-A operator is
   scoped to org A while any citizen sees all. This is intentional: an org user acts in a staff
   capacity, inside a tenant. The escape hatch is a *system* role, not a permission flag (see
   Deviations). Flagged in Risks as a product-surprise item.

### D4/D6 — the auth-context query

One query, cached under `perm:v2:uid:{userId}` for `permissionCacheTtlSeconds`:

```sql
SELECT u.permissions, u.organization_id, r.name AS role_name
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.id = $1
```

`getPermissionsByUserId()` survives as `(await getAuthContextByUserId(id)).permissions` so no
existing caller breaks. `invalidatePermissionCache` deletes the `v2` keys under both keying schemes,
exactly as it does today. The anonymous-device branch short-circuits to
`{ permissions: anonymousPermissions, organizationId: null, roleName: null }` → `public`, before any
DB round-trip — the anonymous ceiling stays governed by `auth.config.ts` alone (0009's header
comment).

The duplicated `AuthenticatedRequest` interface (`incidents.controller.ts:25`,
`comments.controller.ts:22`, `users.controller.ts:24`) must be replaced by one shared type in
`common/`, or three of them will drift the moment `scope` is added to only two.

### D11 — realtime room authorization (closes the D5 leak)

`canJoinRoom(permissions)` today checks only global `READ incidents` and ignores the room entirely
(`room.util.ts:59-61`), so any staff identity can join **any** `org:{id}`. New signature
`canJoinRoom(ctx: AuthContext, room: string)`, resolved per room namespace:

| Room | Rule |
|---|---|
| `user:{id}` | self only (already enforced at connect; never joinable via `join`) |
| `org:{id}` | `global` → yes. `org`/`org_assigned` → only if `id === ctx.organizationId`. `public`/`deny` → no. |
| `geo:{zoneId}` | mirrors the read scope: `global`/`public` → yes; `org`/`org_assigned` → only if that zone belongs to the caller's org; `deny` → no. |
| `incident:{id}` | one indexed PK lookup of that incident's `organization_id`, compared against the scope. Joins are rare; the cost is acceptable. |

`socket.data.scope` is set at connect from the same `getAuthContextByUserId` — no JWT claim, no
second source of truth.

### D9/D10 — the rank ladder

```
1 admin_sistema   2 operador_sistema   3 admin_organizacion   4 operador_organizacion   5 reporter
```

Rule: an actor may write to a target user only when `rank(actor) < rank(target)` — **strictly**.
Equal rank is blocked, so two `admin_sistema` accounts cannot remove each other. Enforced on
`POST /roles/:id/assign` and `PATCH /users/:id/organization`.

Recorded consequences:

- **A rogue second `admin_sistema` cannot be removed through the API.** The escape hatch is direct
  database access. This is the accepted price of the master credential being unrevokable by peers.
- `admin_sistema` **cannot demote itself** either (self is equal rank). Side benefit: no accidental
  self-lockout.
- `operador_sistema` holds zero `users.*`/`roles.*` permissions in the matrix below, so it is
  blocked twice over — by the guard and by the rank check. Defence in depth, deliberately redundant.

### Role matrix seeded by 0015

Permission strings are the flat `ACTION resource` form `PermissionGuard` already compares. Only
resources with catalog rows at 0015 appear (0009 + 0012 `incident-categories` + 0013 `geo-zones` +
`organizations`, new here). `reporter` is **not touched** — it is already seeded and applied.

| Resource | `admin_sistema` | `operador_sistema` | `admin_organizacion` | `operador_organizacion` |
|---|---|---|---|---|
| incidents | R C U D | R | R C U D | R U |
| comments | R C U D | R | R C U D | R C |
| assignments | R ASSIGN | R | R ASSIGN | R |
| users | R U | — | R U | — |
| roles | R ASSIGN | — | R ASSIGN | — |
| organizations | R C U D | R | R | — |
| geo-zones | R C U D | R | R | R |
| incident-categories | R C U D | R | R | R |

`operador_sistema` holding zero `users`/`roles` writes is the mechanism that makes the master
credential safe from colleagues (user D3); D9 is the second line for `admin_organizacion`, which
*does* hold them.

**Cross-task contract:** T3.2 seeds only resources that exist at 0015. When T3.4 (StatusHistory)
lands, **0014 must append its own `status-history` strings to these four roles** — T3.2 will not
pre-seed strings for a resource whose catalog rows it does not own. This keeps 0014 and 0015 fully
order-independent.

## Migration 0015 — shape and hazards

```sql
BEGIN;

-- 1. Enforce the one-org-per-zone assumption BEFORE anything relies on it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_zone
  ON organizations (zone_id) WHERE zone_id IS NOT NULL;

-- 2. The scoping column.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_org_created
  ON incidents (organization_id, created_at DESC);

-- 3. Backfill: idempotent, safe on a database with production rows.
UPDATE incidents i
   SET organization_id = o.id
  FROM organizations o
 WHERE i.zone_id = o.zone_id
   AND i.zone_id IS NOT NULL
   AND i.organization_id IS NULL;

-- 4. Catalog rows + 5. the four role seeds (ON CONFLICT DO NOTHING).
COMMIT;
```

**Q3 answered.** Existing incidents are backfilled from `zone_id` via `organizations.zone_id`. Rows
whose zone is NULL (R2 explicitly accepts incidents outside every boundary) or whose zone has no
organization stay **NULL** — meaning *unassigned to any tenant*, a real and expected state, not a
migration failure. NULL rows are visible to `global` and `public`, invisible to `org`/`org_assigned`.
This is also the standing argument for D1's column over a zone join: an unassigned incident can
later be *reassigned* to an org without moving it geographically, and an org keeps its historical
caseload when a zone boundary is redrawn.

Step 1 is ordered first on purpose. `organizations.zone_id` is today nullable and non-unique; with
two orgs on one zone the `UPDATE ... FROM` in step 3 would pick an arbitrary one, **silently and
non-deterministically assigning incidents to the wrong tenant**. Creating the index first makes the
migration abort loudly on such data instead. On a database with zero organizations the backfill
no-ops, which is the expected state today.

## Deviations from `docs/tasks/1-BACKEND-MIGRATIONS.md`

| Doc says (T3.2 section, lines 32-45) | We ship | Why |
|---|---|---|
| "usuarios ven solo incidentes en la **zona de su org**" (scoping through the zone) | Scoping through `incidents.organization_id` | **User D1.** R2 requires accepting incidents outside every zone; under a zone join those belong to no org and are unreachable by every tenant forever. A column also survives a boundary redraw (T3.8 non-retroactivity) and can be reassigned. |
| "a menos que se les otorgue permiso **`READ cross-org incidents`**" | No such permission. Cross-org visibility = holding a system role (`admin_sistema` / `operador_sistema`) | A per-permission cross-org flag is a **second, parallel authorization axis** that every repository must also consult; the first one that forgets it produces a leak that looks like a feature. It is also unrepresentable in the existing `ACTION resource` vocabulary that `PermissionGuard` compares — `READ cross-org incidents` would parse as resource `cross-org` — and would require widening the `permissions.action` CHECK in 0009. One axis: the role. |
| "Visibilidad cross-org denegada por defecto" (acceptance criterion) | **Upheld, with one deliberate exception**: the citizen/`public` tier keeps the unscoped incident list it has today | The criterion is about *staff*. There is no feed module to move the public list into, and denying it breaks the primary product flow plus existing e2e. Stated explicitly rather than silently. |
| `OrgService.findByZone(zoneId)` — "uno-a-uno para MVP" | Same method, plus a **partial UNIQUE index** enforcing it | The doc asserts one-to-one but nothing in the schema enforced it, which makes both `findByZone` and the backfill non-deterministic. |
| "~180 LOC, 4 unit + 2 e2e, 2-3h" | ~13h (below) | The doc scopes only the CRUD module. It does not account for the leak closures (D5), the auth-context cache reshape (D6), the role seeds, or the rank system (D4) — none of which are optional if the isolation is to be real. |
| — (silent) | Role-hierarchy rank protection | No GeoReporta precedent; a user requirement. Closes the `admin_organizacion` → `admin_sistema` write path. |
| — (silent) | WebSocket `handleJoin` room authorization | The doc treats scoping as an HTTP concern. `room.util.ts:59-61` is a live cross-tenant path the moment `org:` rooms carry data. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `database/migrations/0015_organizations_scoping.sql` (+ `.DOWN.sql`) | New | Column, indexes, backfill, catalog, 4 role seeds |
| `backend/src/entities/incident.entity.ts` | Modified | `organizationId` |
| `backend/src/common/authz/**` | New | `SubjectScope`, `resolveSubjectScope`, `ROLE_RANK`, `assertCanManage` |
| `backend/src/common/interfaces/authenticated-request.ts` | New | One shared type replacing 3 duplicates |
| `backend/src/modules/auth/auth.service.ts` | Modified | `getAuthContextByUserId`, `perm:v2:` prefix |
| `backend/src/modules/auth/jwt.strategy.ts` | Modified | `req.user` gains `organizationId`/`roleName`/`scope` |
| `backend/src/modules/organizations/**` | New | Controller, service, repository, module, 2 DTOs |
| `backend/src/modules/incidents/{repository,service,controller}.ts` | Modified | Scope param; org derivation on create; org in event payload |
| `backend/src/modules/comments/comments.service.ts` | Modified | Parent-incident scope check |
| `backend/src/modules/assignments/assignments.service.ts` | Modified | Parent-incident scope check |
| `backend/src/modules/users/{service,controller}.ts` | Modified | Scoped `list`; `PATCH /:id/organization` |
| `backend/src/modules/roles/roles.service.ts` | Modified | `assertCanManage` before assignment |
| `backend/src/modules/realtime/{room.util,events.gateway}.ts` | Modified | Room-aware `canJoinRoom`; `socket.data.scope` |
| `backend/test/support/test-environment.ts` | Modified | `provisionUser` org/role overrides |
| `backend/test/e2e/organizations.e2e-spec.ts` | New | HTTP + WS isolation, rank protection |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A repository is added later without a scope parameter → silent leak | **High** | Critical | Make `scope` a **required** parameter on every scoped repository method, never optional with a default. An unscoped call must fail `tsc`, not fall back to `global`. Verify phase greps for scoped tables reached without a scope argument. |
| Warm Redis serves the old `string[]` under a reused key after deploy → mass 403 | Med | Critical | D6's `perm:v2:` prefix change. Never mutate a cached value's shape under its existing key. |
| Backfill misassigns incidents because two orgs share a zone | Low | Critical | Partial UNIQUE index created **before** the backfill in the same transaction; migration aborts rather than guesses. |
| D4 surprises an operator: files an incident in a neighbouring zone, then 404s on read-back | Med | Med | Documented contract; the 201 response carries the full body. Spec must state it; e2e must assert it so it can never regress into an accidental "creator can always see own incident" rule. |
| Staff see fewer incidents than anonymous citizens — reads as a bug | Med | Low | Explicit in the spec and in the role-matrix docs: the incident corpus is public; the tenant boundary protects operational data. Cross-org staff visibility is granted by a system role. |
| Rank ladder is a code constant → a role added by migration but not to `ROLE_RANK` gets rank ∞ | Med | Med | ∞ is the *safe* default (can manage nobody). Add a boot-time assertion that every seeded role name in `roles` has a `ROLE_RANK` entry, logged loudly. |
| `incident:{id}` room join adds a DB query per join → WS join latency | Low | Low | Single indexed PK lookup; joins are rare relative to messages. Revisit only if measured. |
| 0014 (T3.4) and 0015 land out of order | Med | Low | They are independent by construction — T3.2 seeds no `status-history` strings and inserts no catalog rows it does not own. If 0015 is applied first, renumber; nothing in it references 0014. |
| Existing e2e suites break on the scope refactor | Med | Med | D2: every existing identity has `role_id IS NULL` → `public` → today's behaviour. Any existing test that changes is a **design bug**, not a test to update. Run the full suite before writing new tests. |
| `provisionUser` insert diverges from the real user-creation path | Low | Med | It already does (no `role_id`); D13 extends it minimally and it still logs in through the real `/api/auth/login` route. |

## Effort Estimate (~13h, matching the user's estimate)

| Slice | Est. |
|---|---|
| Migration 0015 + rollback + role seeds | 1.5h |
| `common/authz` (scope union, resolver, rank, `assertCanManage`) + unit specs | 2h |
| `AuthService` auth-context + cache reshape + `JwtStrategy` + shared request type | 2h |
| Organizations module (CRUD + `findByZone`) + unit specs | 2h |
| Incidents scoping + org derivation on create + event payload | 2h |
| Comments / assignments / users leak closures | 1.5h |
| Realtime `canJoinRoom` rewrite + gateway wiring | 1h |
| `PATCH /users/:id/organization` + rank check on `assignRole` | 0.5h |
| E2E (tenant isolation HTTP + WS, rank protection) + harness changes | 2h |

## Dependencies

- **Migration ordering**: T3.4 takes **0014**; T3.2 assumes **0015**. No functional dependency in
  either direction (see the cross-task contract above) — if T3.2 lands first, renumber to 0014 and
  T3.4 takes 0015.
- Migrations 0001-0013 applied to Supabase (confirmed 2026-08-16).
- T3.1 (Roles/Permissions), T2.1 (Incidents), T2.3 (Users), T2.5 (Realtime) shipped.
- `OrganizationsModule` must be importable by `IncidentsModule` (for `findByZone` at create time) —
  the design phase must confirm no circular import; if one appears, resolve it via the repository
  rather than the service, or by an event, not by a `forwardRef`.
- Strict TDD is active: `npm test` from `backend/`, Testcontainers-backed E2E.

## Success Criteria

- [ ] A user in Org A listing `GET /api/incidents` receives zero incidents belonging to Org B (R8),
      and `GET /api/incidents/:id` on an Org B incident returns **404**, not 403.
- [ ] `operador_organizacion` in Org A sees only incidents in Org A **that are assigned to them** —
      an unassigned Org A incident is absent.
- [ ] `operador_sistema` sees incidents from **both** organizations (D3, explicit branch), and the
      unit test for `resolveSubjectScope` asserts this by name, not by fallthrough.
- [ ] An `admin_organizacion` with `organization_id = NULL` receives **zero** incidents — not all.
- [ ] `GET /api/comments/incident/:id` and `GET /api/assignments/incident/:id` on another org's
      incident return 404 for an org-scoped caller, even though the caller holds `READ`.
- [ ] `GET /api/users` returns only same-org users for an org-scoped caller.
- [ ] A socket authenticated as Org A staff calling `join {room: "org:<B>"}` receives
      `{joined: false}` **and** receives no subsequent event broadcast to that room.
- [ ] An incident created by an anonymous device inside Org A's zone is persisted with
      `organization_id = <A>` and appears for Org A staff (D4 — the crux; without this the whole
      scoping is inert).
- [ ] An incident created outside every zone is still accepted 201 with `organization_id = NULL`
      (R2 preserved).
- [ ] `admin_organizacion` calling `POST /roles/:id/assign` against an `admin_sistema` in the same
      org is rejected **403 `INSUFFICIENT_ROLE_RANK`**; against a user in another org, **404**.
- [ ] `admin_sistema` cannot assign a role to, or move, another `admin_sistema` (equal rank → 403).
- [ ] After 0015, existing incidents are backfilled from their zone's organization; incidents with
      `zone_id IS NULL` have `organization_id IS NULL`.
- [ ] **Every pre-existing e2e suite passes unmodified** (D2 — additive by construction).
- [ ] Every `organizations` route is denied 403 without the matching `ACTION organizations`
      permission.
