# Design: T3.2 Organizations — Multi-Tenancy + RBAC

Source: `proposal.md` (D1-D14), `specs/organizations-scoping/spec.md`. Artifact store: hybrid.

## Architecture Overview

```
HTTP                                     WebSocket
────                                     ─────────
Bearer token                             handshake.auth.token
   │                                        │
JwtStrategy.validate(payload)             EventsGateway.handleConnection
   │                                        │
   └──► AuthService.getAuthContextByUserId(sub) ◄──┘   [one SQL + Redis perm:v2:uid:]
              │
              ├─ permissions, organizationId, roleName
              └─ scope = resolveSubjectScope(roleName, organizationId)   [pure]
   │                                        │
req.user: AuthContext                    socket.data = { userId, permissions, scope }
   │                                        │
PermissionGuard (unchanged)              handleJoin(room)
   │                                        │
Controller passes req.user.scope         RoomAuthorizer.authorize(ctx, room)
   │                                        └─ pure canJoinRoom(ctx, room, ownerOrgId?)
Service ──► Repository(…, scope)            (ownerOrgId pre-fetched for geo:/incident:)
   │
SQL WHERE fragment from scopeToSql(scope)
```

Enforcement is a **parameter**, not ambient state (D3): the scope reaches SQL only by being passed
down explicitly, so a scoped method called without it fails `tsc`.

## Component Design

### `common/authz/subject-scope.ts` (D1)

Union exactly as pinned in the proposal: `global | org | org_assigned | public | deny`.
`deny` carries `reason: 'staff_without_organization'` so logs distinguish "no rows" from "bug".
`public` and `global` stay separate constructors even though incidents SQL is identical today —
narrowing the public view later must not widen or narrow the other (D1).

`resolveSubjectScope(roleName: string | null, organizationId: string | null): SubjectScope` — pure,
zero I/O, `switch` on `roleName` with an **explicit `case 'operador_sistema'`** (never a fallthrough
— the GeoReporta accident, D1/D3) and `default: public` (D2, covers `role_id IS NULL` and unknown
names). `admin_organizacion`/`operador_organizacion` with `organizationId === null` → `deny`.

### `common/authz/scope-sql.ts` (D3)

`scopeToSql(scope, opts: { table: string; paramOffset: number }) → { fragment, params }`.
Per-resource translation lives here, once, instead of in five repositories:

| scope | incidents fragment |
|---|---|
| `global`, `public` | `TRUE` |
| `org` | `organization_id = $n` |
| `org_assigned` | `organization_id = $n AND EXISTS (SELECT 1 FROM assignments a WHERE a.incident_id = <t>.id AND a.operator_id = $n+1)` |
| `deny` | `FALSE` |

`FALSE` (not `WHERE 1=0` on a NULL comparison) makes `deny` an intentional value, never an
accidental `organization_id = NULL`.

### `common/authz/role-rank.ts` (D9/D10/D14)

`ROLE_RANK: Record<string, number>` = `admin_sistema:1, operador_sistema:2, admin_organizacion:3,
operador_organizacion:4, reporter:5`. `rankOf(roleName)` returns `Number.MAX_SAFE_INTEGER` for
unknown/NULL (safe: manages nobody). Code constant, not a column — a column is writable through the
very API it protects (D9).

`assertCanManage(actor: AuthContext, target: { id; organizationId; roleName })`:

1. visible under `actor.scope`? no → `NotFoundException` (**404**, D11 — a 403 would confirm the id
   exists and, by elimination, leak org membership).
2. `rankOf(actor.roleName) < rankOf(target.roleName)`? no → `ForbiddenException` with code
   `INSUFFICIENT_ROLE_RANK` (**403**, D11 — the actor already sees this user in their own listing).

Strict `<`: equal rank blocked, so `admin_sistema` peers cannot remove each other or self-demote.
Service-level, not a guard (D14) — the check needs the target row the service is fetching anyway.

`RoleRankAudit` (`OnApplicationBootstrap`): `SELECT name FROM roles` and log an error naming any
role missing from `ROLE_RANK`. Rank ∞ is safe but silent; the log makes it loud.

### `AuthService.getAuthContextByUserId(userId)` (D6)

```sql
SELECT u.permissions, u.organization_id, u.device_uuid, r.name AS role_name
FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1
```

**Correction to the proposal's wording**: the anonymous branch cannot short-circuit *before* the
query on the uid path — `userId` alone does not reveal the device. `device_uuid` is added to the
SELECT and, when it equals `authConfig.anonymousDeviceUuid`, `permissions` is replaced by
`anonymousPermissions` and org/role forced to `null` → `public`. The anonymous ceiling therefore
still comes from `auth.config.ts` alone; the DB row's own `permissions` are ignored for it. Cost is
the same single query.

Cached under `perm:v2:uid:{userId}` for `permissionCacheTtlSeconds` as `{ permissions,
organizationId, roleName }` (never the derived `scope` — derivation is free and caching it would
create a second thing to invalidate). `getPermissionsByUserId()` becomes
`(await getAuthContextByUserId(id)).permissions`, so `PermissionGuard` and every existing caller are
untouched. `invalidatePermissionCache` deletes `perm:v2:{deviceUuid}` and `perm:v2:uid:{id}`.
Legacy `perm:` keys are abandoned, not migrated (D6: mutating a cached value's shape under its own
key 403s every warm-Redis request for a full TTL).

### `common/interfaces/authenticated-request.ts`

One `AuthenticatedRequest { user?: AuthContext }` replacing the three duplicates in
`incidents.controller.ts:25`, `comments.controller.ts:22`, `users.controller.ts:24` — three copies
drift the instant `scope` is added to two of them.

### Repository / service signatures (D3)

Every scoped method takes `scope: SubjectScope` as a **required, non-optional, no-default**
parameter:

```ts
IncidentsRepository.findAll(filters, scope)         findOne(id, scope)
CommentsService.findByIncident(incidentId, scope)   AssignmentsService.list(incidentId, scope)
UsersService.list(page, limit, scope)
```

Comments/assignments do not scope their own rows — they resolve the **parent incident** under the
caller's scope first and throw 404 when it is invisible (D3 table).

### `canJoinRoom` (D11)

`canJoinRoom(ctx: AuthContext, room: string, ownerOrgId?: string | null): boolean` stays **pure**.
`geo:` and `incident:` rooms need a DB lookup, so a new `RoomAuthorizer` (in `realtime/`, injecting
`DataSource` directly, matching the raw-SQL repository convention) pre-fetches the owning
`organization_id` and then calls the pure function. This keeps room rules unit-testable without a
gateway and without RealtimeModule importing IncidentsModule or OrganizationsModule.

| room | rule |
|---|---|
| `user:{id}` | `id === ctx.userId` (never joinable via `join`; auto-joined at connect) |
| `org:{id}` | `global` → yes; `org`/`org_assigned` → `id === ctx.organizationId`; `public`/`deny` → no |
| `geo:{zoneId}` | `global`/`public` → yes; `org`/`org_assigned` → `ownerOrgId === ctx.organizationId`; `deny` → no |
| `incident:{id}` | `global`/`public` → yes; `org`/`org_assigned` → `ownerOrgId === ctx.organizationId`; `deny` → no |

Unknown namespace → `false` (default-deny, as today).

### Organizations module (D8)

Mirrors `geo-zones/`: `organizations.controller.ts` (`@Controller('organizations')`,
`@UseGuards(JwtAuthGuard, PermissionGuard)`, `@RequirePermission('READ'|'CREATE'|'UPDATE'|'DELETE')`,
`DELETE` → 204), `organizations.service.ts`, `organizations.repository.ts` (raw
`dataSource.query`), `dto/create-organization.dto.ts`, `dto/update-organization.dto.ts`. Fields:
`id, name, zone_id, created_at` only — no `parent_id`, no `incident_category_id`, no
`max_active_claims`, no soft delete (D8). `findByZone(zoneId)` returns the single org or `null`,
relying on the partial UNIQUE index for determinism. Zone rooms are **not** scoped resources, so
this module needs no scope parameter itself.

## Sequence Flows

**Login + context resolution.** `POST /auth/login` is unchanged (no scope in the token, D6). On the
next request: `JwtStrategy.validate` → `getAuthContextByUserId(sub)` → Redis hit or one SQL →
`resolveSubjectScope` → `req.user`. A citizen or anonymous device resolves `roleName = null` →
`public`; a staff member resolves their seeded role → `org`/`org_assigned`/`global`.

**Staff lists org incidents.**
```
GET /incidents ─► IncidentsController.findAll(query, req.user.scope)
                 ─► IncidentsService.findAll(zoneId, status, scope)
                    ├─ cache.get(listCacheKey(zoneId, status, scope))      ← scope in the key
                    └─ IncidentsRepository.findAll({zoneId,status}, scope)
                       └─ SELECT … WHERE <filters> AND <scopeToSql(scope)>
```

**WS connect + join.** connect → same auth context → `socket.data.scope`, auto-join `user:{id}`.
`join {room:"org:B"}` → `RoomAuthorizer.authorize(ctx,"org:B")` → pure check → `{joined:false}` and
**no `socket.join`**, so no later broadcast to `org:B` reaches this socket.

**Rank check.** `POST /roles/:id/assign` (or `PATCH /users/:id/organization`) → `PermissionGuard`
(`ASSIGN roles` / `UPDATE users`) → load target `{id, organizationId, roleName}` via a LEFT JOIN →
`assertCanManage(req.user, target)` → 404 (invisible) or 403 `INSUFFICIENT_ROLE_RANK` (out-ranked) →
write → `invalidatePermissionCache`.

## Data Flows

**Incident create (D4).** `POST /incidents` (often anonymous) → `GeofencingService.resolveZone(lat,
lng)` → `zoneId | null` → `OrganizationsService.findByZone(zoneId)` → `organizationId | null` →
`IncidentsRepository.create({…, zoneId, organizationId})`. The creator's own `organization_id` is
never read. Outside every zone, or a zone with no org → `organization_id = NULL`, still `201`.
`organization_id` is included in the returned row and in the published event payload, so
`resolveRoomsForEvent` starts emitting `org:{id}` rooms with no change to `room.util`'s resolver.

**Backfill (0015 step 3).** UNIQUE index on `organizations(zone_id)` first (aborts loudly on two
orgs per zone rather than assigning incidents non-deterministically), then column + index, then
`UPDATE incidents i SET organization_id = o.id FROM organizations o WHERE i.zone_id = o.zone_id AND
i.zone_id IS NOT NULL AND i.organization_id IS NULL`. Rows with `zone_id IS NULL` stay NULL — a real
state (visible to `global`/`public`, invisible to `org`/`org_assigned`), not a failure.

**Cache invalidation.** `PATCH /users/:id/organization` → write → `del perm:v2:uid:{id}` +
`del perm:v2:{deviceUuid}`; `permission_version` is **not** bumped (D7 — an org move does not change
the permission set). Carried forward gotcha: if a future release starts comparing the JWT `pv` claim
against the row, org moves must begin bumping it or a moved user keeps the old tenant.

## Trade-offs Pinned from the Proposal

| # | Decision | Why not the alternative |
|---|---|---|
| D3 | Scope as a required repository parameter | Post-filter loads the other tenant's rows into memory and leaks on the next forgetful endpoint; ALS is invisible coupling absent from this codebase; a TypeORM global scope cannot see raw `dataSource.query()` at all. A parameter makes omission a compile error. |
| D4 | Org derives from the resolved zone | Creator's org yields NULL for the citizen/anonymous majority (scoping inert) **and** lets staff pull neighbouring work into their own tenant. Jurisdiction decides, not authorship. Accepted cost: an org-A operator filing in org B's zone gets 201 then 404 on read-back. |
| D5 | Exhaustive leak list | incidents (list + detail), comments-by-incident, assignments-by-incident, users list, realtime room join. Partial isolation is worse than none because it looks safe. |
| D11 | 404 invisible / 403 visible-but-out-ranked | 404 when the actor could not have known the row exists (org membership is the tenant secret); 403 when they demonstrably could — a 404 there would lie and leave the client unable to distinguish gone from forbidden. |
| D2 | Unranked → `public` | Every identity in production and in every existing e2e has `role_id IS NULL`; `deny` would 404 the suite and live citizens, `global` would make T3.2 a no-op. |

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| A later scoped read path forgets scope | Required parameter, no default, no optional marker — omission fails `tsc`. Verify phase greps scoped tables for calls without a scope argument. |
| Warm Redis serves the old `string[]` | New `perm:v2:` prefix; the value shape never changes under an existing key. |
| **Scope-blind list cache (found in code, not in the proposal)** | `IncidentsService.findAll` caches under `incidents:list:{zone}:{status}` — threading scope into the repository alone would serve org A's cached array to org B, defeating the whole task. `listCacheKey` gains a scope discriminator: `g` / `p` / `o:{org}` / `oa:{org}:{user}` / `deny`. `public` and `global` get **distinct** keys so a future narrowing of the public view cannot poison the admin view. Tag registration via `tagCacheKey` is unaffected (arbitrary key names). |
| Backfill misassigns across two orgs on one zone | Partial UNIQUE index created first, same transaction — abort, never guess. |
| A migration adds a role missing from `ROLE_RANK` | ∞ is the safe default; `RoleRankAudit` boot assertion logs it loudly. |
| Existing e2e regressions | D2 makes the change additive. Run the full suite **before** writing new tests; any pre-existing test that changes is a design bug, not a test to update. |

## Module Boundary (proposal Dependencies)

```
OrganizationsModule ──(exports OrganizationsService)──► IncidentsModule
GeofencingModule ──► IncidentsModule, GeoZonesModule, OrganizationsModule(optional zone check)
RealtimeModule ──► AuthModule  (+ DataSource for RoomAuthorizer — no domain-module edge)
```

**No cycle**: `OrganizationsModule` imports nothing from incidents, comments, assignments or
realtime; only `IncidentsModule` gains an import edge. `RealtimeModule` deliberately does **not**
import IncidentsModule/OrganizationsModule — `RoomAuthorizer` issues its own indexed PK lookups
through `DataSource`, matching the existing raw-SQL convention. Cost: one more place that names the
`incidents` and `organizations` tables; benefit: zero cycle risk in the module that already imports
Auth. If a cycle ever does appear on the incidents→organizations edge, resolve it by injecting
`OrganizationsRepository` instead of the service, or by inlining the org lookup as a subquery in the
INSERT — never with `forwardRef`.

## File Changes

| File | Action | Description |
|---|---|---|
| `database/migrations/0015_organizations_scoping.sql` | Create | UNIQUE index, `incidents.organization_id` + index, backfill, `organizations` catalog rows, 4 role seeds |
| `database/rollback/0015_organizations_scoping.DOWN.sql` | Create | Drop column/indexes, delete seeded rows |
| `backend/src/common/authz/{subject-scope,resolve-subject-scope,scope-sql,role-rank,assert-can-manage,role-rank.audit}.ts` | Create | Scope union, pure resolver, SQL translation, rank map, `assertCanManage`, boot audit |
| `backend/src/common/interfaces/authenticated-request.ts` | Create | Single `AuthenticatedRequest` |
| `backend/src/modules/organizations/**` | Create | Controller, service, repository, module, 2 DTOs, specs |
| `backend/src/modules/realtime/room-authorizer.service.ts` | Create | Async owner-org lookup wrapping the pure `canJoinRoom` |
| `backend/test/e2e/organizations.e2e-spec.ts` | Create | HTTP + WS isolation, rank protection |
| `backend/src/entities/incident.entity.ts` | Modify | `organizationId` |
| `backend/src/modules/auth/auth.service.ts` | Modify | `getAuthContextByUserId`, `perm:v2:`, `device_uuid` in the join |
| `backend/src/modules/auth/jwt.strategy.ts` | Modify | `req.user` = full `AuthContext` |
| `backend/src/modules/incidents/{repository,service,controller,module}.ts` | Modify | Scope param, **scope in the list cache key**, org derivation, org in event payload |
| `backend/src/modules/comments/{service,controller}.ts` | Modify | Parent-incident scope check |
| `backend/src/modules/assignments/{service,controller}.ts` | Modify | Parent-incident scope check |
| `backend/src/modules/users/{service,controller}.ts` | Modify | Scoped `list`, `PATCH /:id/organization` |
| `backend/src/modules/roles/roles.service.ts` | Modify | `assertCanManage` before assignment |
| `backend/src/modules/realtime/{room.util,events.gateway}.ts` | Modify | Room-aware `canJoinRoom`, `socket.data.scope` |
| `backend/src/app.module.ts` | Modify | Register `OrganizationsModule` |
| `backend/test/support/test-environment.ts` | Modify | `provisionUser` `organizationId` / `roleName` overrides (D13) |

## Interfaces

```ts
export type SubjectScope =
  | { kind: 'global' }
  | { kind: 'org'; organizationId: string }
  | { kind: 'org_assigned'; organizationId: string; userId: string }
  | { kind: 'public' }
  | { kind: 'deny'; reason: 'staff_without_organization' };

export interface AuthContext {
  userId: string;
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  scope: SubjectScope;
}

export function resolveSubjectScope(roleName: string | null, organizationId: string | null): SubjectScope;
export function scopeToSql(scope: SubjectScope, opts: { table: string; paramOffset: number }): { fragment: string; params: unknown[] };
export function scopeCacheKey(scope: SubjectScope): string;
export function rankOf(roleName: string | null): number;
export function assertCanManage(actor: AuthContext, target: { id: string; organizationId: string | null; roleName: string | null }): void;
export function canJoinRoom(ctx: AuthContext, room: string, ownerOrgId?: string | null): boolean;
```

## Testing Strategy

Strict TDD is active (`npm test` from `backend/`, Testcontainers E2E). Red test first, always.

| Layer | What | Approach |
|---|---|---|
| Unit | `resolveSubjectScope` — all 8 rows of the D1 table, `operador_sistema` **asserted by name** | pure function, table-driven |
| Unit | `scopeToSql`, `scopeCacheKey`, `rankOf`, `assertCanManage` (404 vs 403), `canJoinRoom` (4 namespaces × 5 scopes) | pure functions, no mocks |
| Unit | `getAuthContextByUserId` cache hit/miss, anonymous branch, `perm:v2:` key | mocked `Cache` + repo |
| Unit | `OrganizationsService` CRUD + `findByZone` | mocked repository, mirroring `geo-zones.service.spec.ts` |
| Integration | `IncidentsRepository.findAll/findOne` per scope; backfill on seeded rows | Testcontainers Postgres |
| E2E | Two orgs × HTTP isolation (incidents/comments/assignments/users), 404-not-403, `org_assigned`, NULL-org deny, WS `join org:B` → `{joined:false}` + no broadcast, rank 403, create-outside-zone 201 | `organizations.e2e-spec.ts` |
| Regression | **Every pre-existing e2e suite unmodified** | full suite run before any new test is written |

## Migration / Rollout

Single transactional migration `0015`, idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`),
independent of `0014` (T3.4) in both directions — renumber freely. Deploy order: migration, then
code. The `perm:v2:` prefix change means no cache flush is needed. No feature flag: D2 makes the
change a no-op for every identity that exists today, and isolation engages only when a staff role is
assigned.

## Open Questions

- [ ] None blocking. Two design clarifications recorded above rather than deferred: the anonymous
      short-circuit needs `device_uuid` in the auth-context query (it cannot precede it on the uid
      path), and the incidents list cache key must carry the scope discriminator.
