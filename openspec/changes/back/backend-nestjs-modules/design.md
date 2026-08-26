# Design: Backend NestJS Migration

## Technical Approach

NestJS modular monolith, stateless, horizontally scalable. Four cross-cutting pillars resolved here: auth (device-UUID + permission RBAC), real-time (Socket.io + Redis Streams), spatial (PostGIS materialized zones + tagged cache), and module wiring (explicit deps for reads, EventEmitter2 for passive listeners). Build order: Infra/schema -> CoreModule -> Auth -> Incidents (calibration slice) -> rest.

## Architecture Decisions

### D1: Identity is a spectrum, not two systems

**Choice**: One `users` row per identity. Anonymous device registration creates a user with `device_uuid` set and `account_type='anon'`; account signup promotes the same row (`account_type='account'`), preserving reported incidents. Permissions attach to the identity, not the auth method. Anonymous gets a default `reporter` role.

**Alternatives**: separate `devices` + `users` tables with a join at auth time (rejected: every FK — `incidents.citizen_id`, `comments.author_id` — would need a polymorphic owner, poisoning 16 domains); anonymous bypasses RBAC entirely (rejected: no way to rate-limit or ban an abusive device).

**Rationale**: Resolves the proposal's blocking Open Question #1. RBAC and anónimo-first coexist because anonymous is simply a low-permission identity. Guards stay uniform — no `if (anonymous)` branches.

### D2: Permissions in Redis, NOT JWT claims

**Choice**: JWT carries `sub`, `typ`, `jti`, `pv` (permission version). `PermissionGuard` reads `perm:{user_id}` from Redis (Set of `"ACTION resource"` strings, 15m TTL, rebuilt from DB on miss).

| Option | Tradeoff | Decision |
|---|---|---|
| Permissions in JWT claims | Zero lookup, but revocation lags a full access-token lifetime (15m) and 16 resources x 4 actions bloats every request header | Rejected |
| Redis lookup per request | +1 sub-ms roundtrip (already in the Redis path for rate limiting) | **Chosen** |
| DB lookup per request | Correct but an N+1 on every endpoint at 25k users | Rejected |

**Rationale**: Security posture wins. Revoking a compromised operator must be immediate; a 15-minute privilege window on an incident-assignment system is unacceptable. `pv` bump invalidates cached blobs on role change without touching issued tokens.

### D3: Permission strings derive from route metadata (zero hardcoded maps)

**Choice**: `@RequirePermission('READ', 'incidents')` decorator; resource defaults to the controller's path segment. Carries forward the RBAC spec's explicit rejection of `CheckResourcePermission.php`'s `$resourceMap`. `GET /api/me` returns the flat array (`['READ incidents', 'CREATE incidents']`) satisfying spec R1; guard returns 403 satisfying R4.

### D4: Materialized geofencing zones + ST_DWithin proximity (both, different jobs)

| Concern | Mechanism |
|---|---|
| Jurisdiction containment (which zone owns this incident?) | Materialized `geo_zones` polygon table, GIST index, `ST_Contains`. Resolved **once at incident write**, stored as `incidents.zone_id` |
| Proximity feed ("incidents near me") | `ST_DWithin(location, point, radius)` at read time |

**Alternatives**: compute containment on every read (rejected: repeated polygon math for static boundaries); zones as config constants (rejected: not queryable, no spatial join).

**Rationale**: The payoff is cache invalidation. Because every incident carries `zone_id`, the read cache is tagged by zone and purged precisely — otherwise you cannot reverse-map a written incident to the rounded lat/lng keys that might contain it, and you are stuck waiting out the TTL or flushing globally.

Cache key `geo:{zone_id}:{lat3}:{lng3}:{radius}:{status}`, 60s TTL, purged via `SMEMBERS geo:tags:{zone_id}` on `incident.created` / `incident.status_changed`. `lat3`/`lng3` = 3 decimals (~110m grid) to bound cardinality.

### D5: Redis Streams for events, Socket.io Redis adapter for fan-out

Two distinct Redis roles, commonly conflated:
- **Streams** (`incidents:events`) — durable event log, consumer groups, replay after disconnect. Producer: domain services. Consumer: one group per concern (realtime, notifications, status-history).
- **socket.io-redis-adapter** — cross-instance room broadcast so instance 2 can emit to a socket held by instance 3.

**Alternatives**: Pub/Sub only (rejected per proposal — fire-and-forget loses events on disconnect); Streams only, no adapter (rejected: each instance would broadcast to its own sockets, but a consumer group delivers the message to exactly one instance, so other instances' clients get nothing).

**Rationale**: Consumer-group semantics (exactly-once per group) are what prevent duplicate broadcasts; the adapter is what makes the single delivery reach all connected clients. Both are required — dropping either breaks correctness.

### D6: WebSocket room strategy — multi-dimensional, permission-gated at join

**Choice**: Rooms `geo:{zone_id}`, `org:{org_id}`, `incident:{id}`, `user:{id}`. On connect, JWT is verified and the socket auto-joins `user:{id}` plus zone/org rooms it holds `READ` on. Target rooms are computed from the **event payload** (an incident's `zone_id`/`org_id`), not from connection state.

**Alternatives**: one room per role (rejected: city-wide fan-out to every admin for every incident — the 25k-user failure mode); location-only (rejected: operators need org-scoped visibility across zones).

**Rationale**: Bounds fan-out and makes authorization a join-time check rather than a per-message filter.

### D7: Passive domains listen, active domains inject

`StatusHistory` and `Notifications` subscribe via EventEmitter2 (in-process) / Streams (cross-instance); they are never imported by `Incidents`. `Incidents` directly injects `Users`, `IncidentCategories`, `Geofencing`. Prevents the circular dependency that a bidirectional Incidents<->Notifications import would create.

## Data Flow

**Auth**

    Device -> POST /auth/device (device_uuid)
      -> users row (account_type=anon, role=reporter)
      -> JWT access 15m + refresh 7d (dual secret), pv claim
      -> GET /api/me -> ['READ incidents', 'CREATE incidents']

    Request -> JwtGuard (verify sig, exp)
            -> PermissionGuard: GET perm:{sub} (miss -> DB rebuild -> SETEX)
            -> has "ACTION resource"? 200 : 403

**Incident write to client**

    IncidentsService.create()
      -> ST_Contains -> zone_id          (write-time containment, D4)
      -> INSERT incidents
      -> purge geo:tags:{zone_id}        (cache invalidation, D4)
      -> XADD incidents:events
             |
             +-> group:realtime      -> Gateway -> adapter -> rooms geo:{zone_id}, org:{org_id}
             +-> group:notifications -> Bull queue -> mail / telegram
             +-> group:status-history-> append-only audit row

## Module Dependency DAG

    CoreModule (Config, TypeORM, Redis, EventEmitter2)  <- imported by all
    AuthModule (Users, Permissions)                     <- guards used by all
      Incidents      -> Users, IncidentCategories, Geofencing, Locations
      Comments       -> Incidents, Users
      Assignments    -> Incidents, Users, Permissions
      Notifications  ~> [Incidents events], Users, Mail
      StatusHistory  ~> [Incidents events]                (passive, no imports)
      Roles          -> Permissions
      Users          -> Roles, Organizations (optional)
      Geofencing     -> (none — owns geo_zones)
      Realtime       -> Auth (JWT verify only)

`->` import  `~>` event subscription (no import). Acyclic in both directions.

## Interfaces

```ts
interface JwtPayload {
  sub: string;                        // user id (anon or account)
  typ: 'anon' | 'account';
  jti: string;                        // for refresh rotation / revocation
  pv: number;                         // permission version — bump invalidates perm:{sub}
}

// Guard usage — resource inferred from controller path if omitted
@RequirePermission('UPDATE', 'incidents')

interface DomainEvent<T> {
  type: 'incident.created' | 'incident.status_changed' | 'incident.assigned';
  zoneId: string; orgId?: string; actorId: string;
  data: T; occurredAt: string;
}
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/core/core.module.ts` | Create | Config, TypeORM (`synchronize: false`), Redis, EventEmitter2 |
| `backend/src/common/guards/jwt.guard.ts` | Create | Signature + expiry verification |
| `backend/src/common/guards/permission.guard.ts` | Create | Redis permission-set lookup, 403 on miss (R4) |
| `backend/src/common/decorators/require-permission.decorator.ts` | Create | Metadata; resource inferred from route |
| `backend/src/modules/auth/*` | Create | Device registration, dual-secret JWT, refresh rotation, `/api/me` (R1) |
| `backend/src/modules/geofencing/geofencing.repository.ts` | Create | Raw PostGIS SQL, isolated for swappability |
| `backend/src/modules/realtime/events.gateway.ts` | Create | Socket.io + Redis adapter, permission-gated room joins |
| `backend/src/modules/realtime/streams.consumer.ts` | Create | Redis Streams consumer groups |
| `backend/src/modules/incidents/*` | Create | Calibration slice — establishes Jest/Supertest conventions |
| `database/migrations/*.sql` | Create | Manual SQL incl. `geo_zones`, GIST + composite indices |
| `docs/tasks/T1_NESTJS_MODULES.md` | Modify | Remove `synchronize: true`; 4 -> 16 modules |
| `docs/tasks/T3_DATABASE_SCHEMA.md` | Modify | Manual SQL authoritative |
| `backend/TECH_STACK.md` | Modify | Auth model widened per D1 |

## Scale Patterns (25k+ users)

| Concern | Pattern |
|---|---|
| DB pool | 20-30 conns/instance; 3-5 instances = 60-150 total. Must stay under Postgres `max_connections`; add PgBouncer (transaction mode) beyond 5 instances |
| Redis | Single shared ioredis client per instance (built-in pooling). DB 0 = Streams/sessions, DB 1 = cache (mirrors GeoReporta) |
| Rate limiting | `rate:{device_uuid}:{window}` INCR + EXPIRE, sliding window, per-route limits |
| WebSockets | socket.io-redis-adapter; no sticky sessions (JWT re-auth on reconnect); target 5k sockets/instance |
| Geofencing | All proximity reads cached (D4); GIST on `location` and `geo_zones.geom`, composite `(status, created_at)`; `LIMIT 1000` hard cap |
| Async fan-out | Bull queue — one job per assignee, retries + backoff. Never fan out inline in a request |
| N+1 | Explicit `relations` / query-builder joins; DataLoader if GraphQL is added |

## Indices

    CREATE INDEX idx_incidents_location  ON incidents USING GIST (location);
    CREATE INDEX idx_geo_zones_geom      ON geo_zones USING GIST (geom);
    CREATE INDEX idx_incidents_status    ON incidents (status, created_at DESC);
    CREATE INDEX idx_incidents_zone      ON incidents (zone_id, status);

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Guards, permission resolution, cache-key builder, event mapping | Jest, mocked Redis/repos |
| Integration | Auth flows (anon -> account promotion, refresh rotation), PostGIS containment + proximity, assignment workflow | Supertest + Testcontainers (postgis:16-3.4, redis:7) |
| E2E / Load | 100+ concurrent sockets on assignment path; geofencing p95 < 100ms warm | Artillery / k6 |

Strict TDD active — tests precede implementation. Incidents module establishes conventions.

## Migration / Rollout

Greenfield; no data migration. Phased: infra+schema -> Core+Auth -> Incidents (recalibrate estimate here) -> remaining domains. Each domain is independently revertible by dropping its folder and `AppModule` import. Every migration ships a paired `*_down.sql`. GeoReporta runs untouched as fallback until parity is verified.

## Open Questions

- [ ] Firebase: keep `firebase-admin` multi-auth or drop? (proposal Q2 — D1 does not require it; recommend **drop** unless social login is a product requirement)
- [ ] Supabase managed Postgres: confirm PostGIS extension + GIST creation privileges before committing (proposal Q3) — blocks D4
- [ ] `geo_zones` source data: who supplies Santa Elena jurisdiction polygons, and in what format (GeoJSON/shapefile)?
- [ ] Anonymous permission ceiling: exactly which actions does `reporter` hold beyond `CREATE incidents` / `READ incidents`?
- [ ] Streams retention: `MAXLEN` cap and whether replay-on-reconnect is v1 or deferred
