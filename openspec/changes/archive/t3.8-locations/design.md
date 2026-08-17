# Design: T3.8 Locations — `geo_zones` Admin CRUD + Hierarchy

Source: `sdd/t3.8-locations/proposal` (#414, D1–D11 locked). Artifact store: hybrid. Migration: **0013**.

## Technical Approach

A new **write-side** module `backend/src/modules/geo-zones/` (controller / service / repository / module + DTOs + a GeoJSON validator), all-raw SQL in its repository because every write goes through `ST_Multi(ST_GeomFromGeoJSON(...))` and every read must project `ST_AsGeoJSON(polygon)::json`. It reuses T3.7's shipped hierarchy machinery verbatim in shape (ancestor-walk cycle guard + depth-capped recursive CTE + in-memory `buildTree`), and depends on the existing read-side `GeofencingModule` for one thing only: cache invalidation after a boundary change.

The single genuinely new piece of infrastructure is **`GeofencingService.purgePointCache()`**, backed by a dedicated, globally-scoped tag-set. Everything else is a re-application of patterns already in the repo.

---

## The point-cache invalidation problem (D8, resolved)

### Facts established by inspection

| Fact | Evidence |
|---|---|
| Point-cache values live on **Redis DB 1**, written through `cache-manager` | `geofencing.service.ts:97` `this.cache.set(...)`; `core.module.ts:73-84` `redisStore({url: cacheConf.cacheUrl})`; `cache.config.ts:40,47` `REDIS_CACHE_DB` default **1** |
| Tag-sets live on **Redis DB 0**, written through the raw ioredis client | `geofencing.service.ts:117` `this.redis.sadd(...)`; `core.module.ts:89-102` `new Redis(cacheConf.streamsUrl)`; `cache.config.ts:41-43,48` `REDIS_STREAMS_DB` default **0** |
| `purgeZoneCache` already straddles the split correctly | `geofencing.service.ts:132-138` — `cache.del()` for values, `redis.del()` for the tag-set, with the trap documented inline |
| Point keys are tagged by **nobody** | only callers of `tagCacheKey` are `incidents.service.ts:92,95`, tagging `incidents:list:*` keys |
| A `null` containment result is **never** cached | `geofencing.service.ts:88-98` — `NoCacheableError` + the store's `null → undefined` collapse |
| `ALL_ZONES_TAG` is purged on **every** incident write | `incidents.service.ts:149-152` ← `create()` and `updateStatus()` |

### Q4 — does the expand case matter? (answered first, it narrows the rest)

**Partially no.** A point outside every zone is never cached, so a boundary that *grows* to cover a previously-unmatched point has **no stale entry** — the next lookup is a cold miss and reads the new shape. This is free correctness.

It is **not** the whole story, and the fix is still required:
- **Shrink** (the actual acceptance criterion): P was inside X and *is cached* under X. X shrinks → the entry is stale for up to 60 s. CC5 fails.
- **Deactivate**: X was cached for P; `active = false` makes `findZoneByPoint` skip it, but the cached row survives.
- **Overlap growth**: Y grows to cover P which is already cached as X. Stale relative to the new (arbitrary, `LIMIT 1`) resolution.

So the purge must cover the case where the stale entry is tagged with a zone **other than** the one being edited.

### Q1 — the cross-zone hole, and why `ALL_ZONES_TAG` is the wrong lid

Tagging point keys under the *editing* zone leaves the cross-zone hole wide open (P cached under X, Y is edited). Adding `ALL_ZONES_TAG` as a second tag does close the hole — and is **fatal for a different reason**:

> `incidents.service.ts:151` purges `ALL_ZONES_TAG` on **every incident create and every status change**. If point keys were members of that set, every incident write would flush the entire point cache — the exact cache whose stated purpose (`geofencing.service.ts:70-72`) is to survive 25 k users *at incident-write time*. Hit rate collapses toward zero and the cache becomes pure overhead: one extra `GET` + one extra `SADD` per write for a value that is deleted moments later by the same request.

The same argument, scoped, kills the per-zone tag: incidents cluster in a handful of zones, so `purgeZoneCache(zoneId)` on every write in zone X would evict most of X's point entries anyway.

**Conclusion: the point cache must NOT share a tag namespace with the incident-list caches.** Write amplification (2 SADDs) is not the problem; *namespace coupling to a hot purge path* is.

### Q2 — SCAN cost and correctness

| Concern | Finding |
|---|---|
| Does `cache-manager`'s `Cache` expose SCAN? | **No.** The `Cache` interface is `get/set/del/reset/wrap/store`. Reaching a scan-capable client requires `(this.cache.store as unknown as { client: RedisClientType }).client` — an untyped cast into `cache-manager-redis-yet` internals, whose client is **node-redis v4**, not ioredis (`test-environment.ts:304` already documents this mismatch). Different API surface (`scanIterator`), different error semantics. |
| Which DB would `this.redis` SCAN? | **DB 0** — the wrong one. `geo:point:*` lives on DB 1. The scan matches zero keys, deletes nothing, and `purgePointCache()` returns successfully. This is *precisely* the silent failure `purgeZoneCache`'s inline comment warns about, and the proposal's own top-ranked risk. |
| The alternative | Register a 5th ioredis connection on `cacheUrl` (DB 1) in `CoreModule` — new global infrastructure, a new connection per process, for one rare admin operation. |
| Cost / correctness | `SCAN` is O(keyspace of DB 1), which also holds `incidents:list:*` and any other cached payload; and it is cursor-based and non-atomic, so a key written mid-scan can be missed. |

### D-CACHE — chosen mechanism

**A dedicated, globally-scoped point-cache tag-set.** It is the tag mechanism (already proven across the DB0/DB1 split) with its own namespace, so it is coupled to nothing.

```ts
// geofencing.service.ts

/**
 * Tag-set for the point-containment cache. Deliberately NOT `geo:tags:{zoneId}`
 * and NOT ALL_ZONES_TAG: those are purged on every incident write
 * (incidents.service.ts:149-152), which would flush the very cache that exists
 * to make incident writes cheap. Global (not per-zone) because a boundary edit
 * on zone Y can stale an entry cached under zone X.
 * Lives on DB 0 (raw client), like every other tag-set. Its MEMBERS name keys
 * on DB 1 and must be deleted with `cache.del()`.
 */
export const POINT_CACHE_TAG_KEY = 'geo:tags:points';

/** SADD on REDIS_CLIENT (DB 0). Cold path only. */
private async tagPointCacheKey(cacheKey: string): Promise<void>;

/** SMEMBERS (DB 0) → cache.del() each (DB 1) → redis.del(tag-set) (DB 0). */
async purgePointCache(): Promise<void>;
```

Call sites — exactly two, both new:

1. `getCachedZoneByPoint`, inside the **existing** `if (zone !== null)` branch (`geofencing.service.ts:96-98`), immediately after the `cache.set`. Never on a cache hit; never on a `null` result (which is never cached, so there is nothing to track).
2. `GeoZonesService.purgeGeoCaches()`, after the write transaction commits.

**Q3 — hot-path cost.** Zero on a cache hit (the overwhelmingly common case; that is the path that runs on every incident write). One `SADD` on a cold miss, on the same request that already pays a PostGIS `ST_Contains` and a `cache.set` — a third round trip on top of two, in the branch that is already the slow one. Compare: `incidents.service.findAll` already pays 2 SADDs per cold read.

**Cardinality.** Members are 3-decimal grid cells (~110 m) that resolved *inside* a zone. Bounded by the deployment's geographic extent: Santa Elena is `lng[-81.008,-80.200] × lat[-2.508,-1.669]` → **≤ ~664 k** cells absolute worst case, realistically low thousands (incidents cluster). Members are short strings (~30 B). The set is truncated on every boundary edit. No `EXPIRE` is set: refreshing a TTL on each `SADD` would never let it expire under traffic, and a non-refreshed TTL would silently orphan entries younger than 60 s — reintroducing the exact staleness window being closed.

**Ordering.** The purge runs **after** the DB write commits. Purging before commit lets a concurrent cold lookup re-cache the old shape. A microsecond-wide race remains (a lookup that read the old polygon pre-commit and `set`s post-purge); it is the pre-existing write-through race present everywhere in this codebase, is not reachable in a sequential e2e, and is not worth a distributed lock for an admin-frequency operation.

### Rejected alternatives

| Alternative | Rejected because |
|---|---|
| `tagCacheKey(zone.id, key)` + `tagCacheKey(ALL_ZONES_TAG, key)` (the "cheap reuse") | `ALL_ZONES_TAG` is purged on **every** incident write → point cache hit rate → 0. Per-zone tag alone leaves the cross-zone hole. |
| `SCAN geo:point:* ` + DEL (the proposal's sketch) | `Cache` has no SCAN; `this.redis` is DB 0 and would silently match nothing; the fix needs either a cast into store internals (node-redis v4) or a 5th Redis connection. O(DB 1 keyspace), non-atomic. |
| Epoch-versioned key `geo:point:v{n}:{lat3}:{lng3}`, purge = `INCR` | Self-cleaning (old epoch keys age out in 60 s) and O(1) purge — but requires reading the epoch on **every** lookup including hits, doubling the round trips on the hot path; caching the epoch in-process reintroduces cross-instance staleness, which is the original problem. |
| Drop the point cache entirely; rely on PostGIS | Deletes the CC5 scalability guarantee to fix a 60 s staleness window. |
| Shorten TTL to ~5 s | Does not make CC5 *true*, only *less false*; multiplies PostGIS load by 12. |

---

## Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| **D1** | Module location | New `backend/src/modules/geo-zones/` (dir named for the route/resource, not for the change name `locations`) | `modules/locations/`; folding CRUD into `modules/geofencing/` | Directory, controller path, permission resource and entity all read `geo-zones` — one word end to end. Folding into geofencing would make the incidents hot path transitively depend on admin CRUD, and would invert the dependency this design needs (`GeoZonesModule → GeofencingModule`). `GeofencingRepository`'s own docblock frames it as a swappable read-side spatial engine. |
| **D2** | Persistence style | **All-raw** `GeoZonesRepository` via `@InjectDataSource().query()` with `$n` params | T3.7's split (TypeORM repo for CRUD + raw for CTE) | Unlike `incident_categories`, *every* geo-zone write touches `ST_Multi(ST_GeomFromGeoJSON($1))` and *every* read must project `ST_AsGeoJSON(polygon)::json`. A TypeORM repo could not express either without raw fragments, so the split would buy nothing and cost a second mental model. Follows `IncidentsRepository`. |
| **D3** | Entity | Extend the **existing** `geo-zone.entity.ts` with flat `parentId` / `level`; no self-relation, no new file | New entity; `@ManyToOne`/`@OneToMany` self-relation | Repo convention (T3.7 D2): 8 of 9 entities are flat. The entity stays truthful for any TypeORM read elsewhere, but this module does not read through it (D2). |
| **D4** | Cycle guard | Ancestor walk from the candidate `parent_id`, in the same transaction as the write → 400; plus a DB `CHECK (parent_id IS NULL OR parent_id <> id)` as depth-1 defence | DB trigger; CHECK only | Verbatim reuse of T3.7 D4 (shipped, verified). The CHECK cannot see transitive cycles — it is a backstop against direct-SQL mistakes, **not** a replacement. |
| **D5** | Subtree read | Depth-capped (`MAX_DEPTH = 1000`) recursive CTE → flat rows → in-memory `buildTree` | Recursive SQL JSON aggregation | T3.7 D3. `buildTree` is a pure function, unit-testable with no DB. The depth cap is the backstop if a cycle ever slips past D4. |
| **D6** | Geometry validation | One pre-flight round trip returning `ST_IsValid` / `ST_IsValidReason` / `ST_IsEmpty` / `ST_GeometryType` over `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326))`, then the same expression inline in the INSERT/UPDATE | Validating inside the write and mapping the PG error; a DB CHECK on the column | An explicit pre-flight yields a precise 400 with `ST_IsValidReason()` text instead of a generic constraint violation, and lets `ST_GeometryType` reject a well-formed GeoJSON `Point` (which `ST_Multi` would happily turn into a `MULTIPOINT` and only fail later on the column's type constraint). The double parse is one extra sub-millisecond query on an admin-frequency route. |
| **D7** | GeoJSON validation in the DTO | Custom class-validator constraint on a plain `object` property (`type ∈ {Polygon, MultiPolygon}`, non-empty `coordinates` array) | `@ValidateNested()` + a `GeoJsonPolygonDto` class | With the global `ValidationPipe` whitelist, a nested *class* would strip anything not decorated — and `coordinates` is an arbitrarily deep raw array that no DTO class can usefully model. Keeping it a plain object means the payload reaches PostGIS byte-identical. |
| **D8** | Purge trigger | Purge iff `polygon` was supplied **or** `active` changed value; also on `create`. Never on a rename, a `level` change, or a `parent_id` change | Purge on every mutation; never purge on create | `findZoneByPoint` (`geofencing.repository.ts:33-41`) selects on `active` and `ST_Contains(polygon, …)` only — `name`, `level` and `parent_id` cannot influence any cached containment or list payload. Create purges because a new active polygon may overlap an already-cached zone; it is an admin-frequency operation. `DELETE` on an already-inactive zone changes nothing → no purge (and still 204). |
| **D9** | Purge composition | `purgeZoneCache(zoneId)` → `purgeZoneCache(ALL_ZONES_TAG)` → `purgePointCache()`, all **after** commit | Fire-and-forget; before commit | Sequential and awaited so the HTTP 200 is a promise that the next lookup is cold (CC5, and it is what makes the e2e deterministic without a sleep). Pre-commit purge loses the race to a concurrent reader. |
| **D10** | `ALL_ZONES_TAG` home | Move the const to `geofencing.service.ts` and re-export it from `incidents.service.ts` (`export { ALL_ZONES_TAG } from '../geofencing/geofencing.service'`) | Import it from `incidents.service.ts` into `geo-zones.service.ts` | The tag machinery (`tagCacheKey`/`purgeZoneCache`) already lives in `GeofencingService`; the constant belongs with it. The re-export keeps every existing import and unit spec compiling unchanged — a two-line, behaviour-free move. Alternative would make an admin module import a symbol from the incidents hot path for no reason. |
| **D11** | Response shape | Rows returned directly; `polygon` always a GeoJSON **MultiPolygon** object; list is `{items, total}` | `{data}` envelope; WKT / EWKB passthrough | Global `SnakeCaseResponseInterceptor`, no envelope (T3.7 D7). `ST_Multi` coercion is silent per proposal D7, so reads are documented as always-MultiPolygon even when a bare `Polygon` was submitted. |
| **D12** | Migration constraints | `CHECK` constraints added inside a `DO $$ … pg_constraint` guard | `ADD CONSTRAINT IF NOT EXISTS` | PostgreSQL has no `IF NOT EXISTS` for table constraints; the `DO` block is the only way to keep 0013 re-runnable. |

---

## Data Flow

    POST /api/geo-zones ─→ Controller ─→ Service
       (JwtAuthGuard,                      ├─ assertValidParent()  → 400 PARENT_NOT_FOUND / INVALID_PARENT_LEVEL / CYCLIC_PARENT
        PermissionGuard,                   ├─ repo.validateGeometry() → 400 INVALID_GEOMETRY_FORMAT / INVALID_GEOMETRY / EMPTY_GEOMETRY
        RequirePermission('CREATE'))       ├─ repo.create()  ST_Multi(ST_GeomFromGeoJSON($1))
                                           └─ purgeGeoCaches(id)      [after commit]

    PATCH /api/geo-zones/:id ─→ Service ─→ (same guards) ─→ repo.update()
                                           └─ purgeGeoCaches(id)  ONLY if polygon supplied or active flipped (D8)

    purgeGeoCaches(zoneId)
        ├─ GeofencingService.purgeZoneCache(zoneId)        DB0 tag-set → DB1 values
        ├─ GeofencingService.purgeZoneCache(ALL_ZONES_TAG) DB0 tag-set → DB1 values
        └─ GeofencingService.purgePointCache()             DB0 geo:tags:points → DB1 geo:point:*

    GET /api/geo-zones/tree ─→ Service ─→ repo.getSubtree(null)
                                           │ recursive CTE, depth ≤ 1000, ALL zones incl. inactive (D10 of proposal)
                                           └─ buildTree() ─→ nested roots[]

    POST /api/incidents (unchanged) ─→ GeofencingService.resolveZone
                                        └─ getCachedZoneByPoint  ── hit? return
                                                                 └─ miss → PostGIS → cache.set (DB1) + tagPointCacheKey (DB0)

---

## Migration 0013

### `database/migrations/0013_geo_zones_hierarchy.sql`

```sql
-- 0013_geo_zones_hierarchy.sql
-- Transito Alerta SE — geo_zones hierarchy + admin CRUD permissions (T3.8)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
--
-- Adds the adjacency-list hierarchy (parent_id/level) that the seeded
-- Santa Elena rows have always had implicitly, plus the permission catalog
-- rows for resource 'geo-zones'. Does NOT touch id/name/polygon/active.
--
-- Rollback: database/rollback/0013_geo_zones_hierarchy.DOWN.sql

BEGIN;

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES geo_zones (id) ON DELETE SET NULL;

ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS level varchar(20) NOT NULL DEFAULT 'zona';

-- 2. Constraints (PG has no ADD CONSTRAINT IF NOT EXISTS — design D12) -------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_geo_zones_level') THEN
    ALTER TABLE geo_zones
      ADD CONSTRAINT chk_geo_zones_level
      CHECK (level IN ('provincia', 'canton', 'parroquia', 'zona'));
  END IF;
END $$;

-- Depth-1 backstop only. Transitive cycles are caught by the application's
-- ancestor walk (design D4) — this CHECK cannot see them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_geo_zones_parent_not_self') THEN
    ALTER TABLE geo_zones
      ADD CONSTRAINT chk_geo_zones_parent_not_self
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

-- 3. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_geo_zones_parent_id ON geo_zones (parent_id);
CREATE INDEX IF NOT EXISTS idx_geo_zones_level     ON geo_zones (level);

-- 4. Seed backfill (design D5 of the proposal) --------------------------------
-- Matched by the DETERMINISTIC UUIDs assigned in
-- database/seeds/generate-geo-zones-seed.js:33-38 — NEVER by name:
-- 'Santa Elena (Provincia)' and 'Santa Elena (Cantón)' both start with
-- "Santa Elena" and a LIKE/prefix match would mis-parent the canton to itself.
-- Every statement is a guarded UPDATE: on a database where the geo-zones seed
-- was never applied, all four match zero rows and the migration still succeeds.

UPDATE geo_zones
   SET level = 'provincia', parent_id = NULL
 WHERE id = '8f14e45f-ceea-4c1f-8f2c-000000000024';   -- EC-24  Santa Elena (Provincia)

-- The EXISTS guard keeps this a no-op (instead of an FK violation) on a
-- database that somehow has the cantons but not the province row.
UPDATE geo_zones
   SET level = 'canton', parent_id = '8f14e45f-ceea-4c1f-8f2c-000000000024'
 WHERE id IN (
         '8f14e45f-ceea-4c1f-8f2c-000000000101',      -- EC-24-01 Santa Elena (Cantón)
         '8f14e45f-ceea-4c1f-8f2c-000000000102',      -- EC-24-02 La Libertad
         '8f14e45f-ceea-4c1f-8f2c-000000000103'       -- EC-24-03 Salinas
       )
   AND EXISTS (
         SELECT 1 FROM geo_zones p
          WHERE p.id = '8f14e45f-ceea-4c1f-8f2c-000000000024'
       );

-- 5. Permission catalog ------------------------------------------------------
-- Resource is the HYPHENATED 'geo-zones', matching PermissionGuard's
-- inferResourceFromPath off the real route segment (/api/geo-zones/...).
-- Informational catalog row — the guard compares the flat "ACTION resource"
-- string on the caller's own permission set — but it must match exactly or
-- nothing here is ever grantable.
INSERT INTO permissions (resource, action) VALUES
  ('geo-zones', 'READ'),
  ('geo-zones', 'CREATE'),
  ('geo-zones', 'UPDATE'),
  ('geo-zones', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
```

### `database/rollback/0013_geo_zones_hierarchy.DOWN.sql`

```sql
-- database/rollback/0013_geo_zones_hierarchy.DOWN.sql
-- T3.8: Rollback geo_zones.parent_id/level + indexes + 'geo-zones' permissions.
--
-- Zone ROWS are never removed — including zones created through the T3.8 API.
-- Only the hierarchy columns go away; id/name/polygon/active survive, so
-- geofencing keeps working exactly as it did before 0013.

BEGIN;

DELETE FROM permissions WHERE resource = 'geo-zones';

DROP INDEX IF EXISTS idx_geo_zones_level;
DROP INDEX IF EXISTS idx_geo_zones_parent_id;

ALTER TABLE geo_zones DROP CONSTRAINT IF EXISTS chk_geo_zones_parent_not_self;
ALTER TABLE geo_zones DROP CONSTRAINT IF EXISTS chk_geo_zones_level;

ALTER TABLE geo_zones DROP COLUMN IF EXISTS level;
ALTER TABLE geo_zones DROP COLUMN IF EXISTS parent_id;

COMMIT;
```

---

## Entity — `backend/src/entities/geo-zone.entity.ts` (modify, do not create)

Append two flat columns; keep the existing four untouched, keep the docblock, add **no** self-relation (D3).

```ts
export const GEO_ZONE_LEVELS = ['provincia', 'canton', 'parroquia', 'zona'] as const;
export type GeoZoneLevel = (typeof GEO_ZONE_LEVELS)[number];

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'zona' })
  level!: GeoZoneLevel;
```

`GEO_ZONE_LEVELS` is the single source of truth shared by the DTO's `@IsIn`, the service's level-consistency table (proposal D6) and the migration's CHECK.

---

## Repository — `backend/src/modules/geo-zones/geo-zones.repository.ts`

All raw, `$n`-parameterized (D2). Never string-interpolate anything except `MAX_DEPTH`, matching `incident-categories.repository.ts:51`.

```ts
export const MAX_DEPTH = 1000;

export interface GeoZoneDetailRow {
  id: string;
  name: string;
  parent_id: string | null;
  level: GeoZoneLevel;
  active: boolean;
  polygon: GeoJsonMultiPolygon;   // ST_AsGeoJSON(polygon)::json
  created_at: Date;
}

/** Depth-annotated flat row for the CTE; omits `polygon` — a tree of 4 MultiPolygons
 *  with 647 points each is ~2 MB of JSON nobody renders. */
export interface GeoZoneTreeRow {
  id: string; name: string; parent_id: string | null;
  level: GeoZoneLevel; active: boolean; created_at: Date; depth: number;
}

export interface GeoZoneNode extends Omit<GeoZoneTreeRow, 'depth'> {
  children: GeoZoneNode[];
}

export interface GeometryCheck {
  valid: boolean;          // ST_IsValid
  reason: string | null;   // ST_IsValidReason, verbatim
  empty: boolean;          // ST_IsEmpty
  geom_type: string;       // ST_GeometryType, e.g. 'ST_MultiPolygon'
}

export interface ListFilters {
  search?: string;
  level?: GeoZoneLevel;
  parentId?: string | null;      // undefined = no filter, null = roots only
  includeInactive?: boolean;     // default false
  page?: number;                 // default 1
  perPage?: number;              // default 15, max 100
}

class GeoZonesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  validateGeometry(geoJson: unknown): Promise<GeometryCheck>;   // throws PG error on parse failure
  create(input: CreateZoneInput): Promise<GeoZoneDetailRow>;
  update(id: string, patch: UpdateZonePatch): Promise<GeoZoneDetailRow | null>;
  deactivate(id: string): Promise<{ changed: boolean } | null>; // null = not found
  findById(id: string): Promise<GeoZoneDetailRow | null>;
  findAll(filters: ListFilters): Promise<{ items: GeoZoneDetailRow[]; total: number }>;
  listFlat(rootId: string | null): Promise<GeoZoneTreeRow[]>;
  getSubtree(rootId: string | null): Promise<GeoZoneNode[]>;    // listFlat + buildZoneTree
  findParentLevel(parentId: string): Promise<GeoZoneLevel | null>;
  validateNoCycles(zoneId: string | null, proposedParentId: string | null): Promise<boolean>;
}
```

### Key SQL

**Geometry pre-flight** (one round trip, D6):

```sql
SELECT ST_IsValid(g)        AS valid,
       ST_IsValidReason(g)  AS reason,
       ST_IsEmpty(g)        AS empty,
       ST_GeometryType(g)   AS geom_type
  FROM (
    SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)) AS g
  ) t
```

`ST_SetSRID` is applied because `ST_GeomFromGeoJSON` only carries an SRID when the payload declares a `crs` member — without it the insert would land SRID 0 into a `geometry(MultiPolygon, 4326)` column and fail with a type error instead of a domain 400. `ST_GeometryType` catches a well-formed GeoJSON `Point`/`LineString` that `ST_Multi` silently promotes to `MULTIPOINT`/`MULTILINESTRING`; the DTO already rejects those, this is the second line.

**Create** (`polygon` NOT NULL, so always supplied):

```sql
INSERT INTO geo_zones (id, name, parent_id, level, active, polygon)
VALUES (gen_random_uuid(), $1, $2, $3, $4,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326)))
RETURNING id, name, parent_id, level, active,
          ST_AsGeoJSON(polygon)::json AS polygon, created_at
```

**Update** — partial patch. `parent_id` needs an explicit *provided* flag because `null` is a meaningful value (detach to root), which `COALESCE` cannot distinguish from "absent":

```sql
UPDATE geo_zones SET
  name      = COALESCE($2, name),
  parent_id = CASE WHEN $3::boolean THEN $4::uuid ELSE parent_id END,
  level     = COALESCE($5, level),
  active    = COALESCE($6::boolean, active),
  polygon   = CASE WHEN $7::text IS NULL THEN polygon
                   ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326)) END
WHERE id = $1
RETURNING id, name, parent_id, level, active,
          ST_AsGeoJSON(polygon)::json AS polygon, created_at
```

**Deactivate** (idempotent, D8 — reports whether anything actually changed so the service can skip a pointless purge):

```sql
UPDATE geo_zones SET active = false
 WHERE id = $1
RETURNING (active IS DISTINCT FROM false) AS changed
```
…evaluated pre-update via a `WITH prev AS (SELECT active FROM geo_zones WHERE id = $1)` CTE; a missing row returns zero rows → 404.

**Subtree CTE** (T3.7 shape, `polygon` deliberately not projected):

```sql
WITH RECURSIVE subtree AS (
  SELECT id, name, parent_id, level, active, created_at, 0 AS depth
    FROM geo_zones
   WHERE parent_id IS NULL          -- or `id = $1` for the rooted variant
  UNION ALL
  SELECT z.id, z.name, z.parent_id, z.level, z.active, z.created_at, s.depth + 1
    FROM geo_zones z
   INNER JOIN subtree s ON z.parent_id = s.id
   WHERE s.depth < 1000
)
SELECT id, name, parent_id, level, active, created_at, depth FROM subtree
```

**Cycle guard** — verbatim port of `incident-categories.repository.ts:90-121` against `geo_zones` (self-parent short-circuit, ancestor walk capped at `MAX_DEPTH`, break on a missing row).

**`buildZoneTree(rows)`** — pure function mirroring `buildTree`; `Map` link pass, `localeCompare` sort per level, a node whose `parent_id` is absent from the row set becomes a root.

---

## Service — `backend/src/modules/geo-zones/geo-zones.service.ts`

```ts
class GeoZonesService {
  constructor(
    private readonly repo: GeoZonesRepository,
    private readonly geofencing: GeofencingService,
  ) {}

  create(dto: CreateGeoZoneDto): Promise<GeoZoneDetailRow>;
  update(id: string, dto: UpdateGeoZoneDto): Promise<GeoZoneDetailRow>;
  deactivate(id: string): Promise<void>;                 // DELETE /:id → 204
  findById(id: string): Promise<GeoZoneDetailRow>;       // 200 even when inactive
  list(filters: ListFilters): Promise<{ items; total }>;
  getTree(): Promise<GeoZoneNode[]>;                     // ALL zones, active flag included

  private async assertValidParent(zoneId: string | null, parentId: string | null | undefined,
                                  level: GeoZoneLevel): Promise<void>;
  private async assertValidGeometry(polygon: unknown): Promise<void>;
  private async purgeGeoCaches(zoneId: string): Promise<void>;
}
```

**`assertValidParent`** — proposal D6 table, evaluated against the *effective* level (the patch's `level` if supplied, else the row's current one):

| child `level` | required parent `level` | on violation |
|---|---|---|
| `provincia` | parent must be `NULL` | 400 `INVALID_PARENT_LEVEL` |
| `canton` | `provincia` | 400 `INVALID_PARENT_LEVEL` |
| `parroquia` | `canton` | 400 `INVALID_PARENT_LEVEL` |
| `zona` | unconstrained (any level, or none) | — |

A `zona` may also be *anyone's* parent. `parent_id = null` is valid at every level. Order of checks: parent exists → level compatible → no cycle.

**`update`** purge condition (D8), evaluated against the pre-image:

```ts
const boundaryChanged = dto.polygon !== undefined;
const activityChanged = dto.active !== undefined && dto.active !== before.active;
if (boundaryChanged || activityChanged) await this.purgeGeoCaches(id);
```

**`deactivate`** purges only when `changed === true`; an already-inactive zone is a 204 no-op with no Redis traffic.

**`purgeGeoCaches`** — D9 order, awaited, post-commit:

```ts
await this.geofencing.purgeZoneCache(zoneId);
await this.geofencing.purgeZoneCache(ALL_ZONES_TAG);
await this.geofencing.purgePointCache();
```

`GeoZonesModule` imports `GeofencingModule` (which must `export GeofencingService` — verify; it is already exported for `IncidentsModule`). No cycle: geofencing knows nothing about geo-zones.

---

## Controller — `backend/src/modules/geo-zones/geo-zones.controller.ts`

`@Controller('geo-zones')` (never `'api/geo-zones'` — `setGlobalPrefix('api')` supplies it), class-level `@UseGuards(JwtAuthGuard, PermissionGuard)`, resource inferred as `geo-zones`.

| Order | Route | Permission | Status | Notes |
|---|---|---|---|---|
| 1 | `GET /geo-zones/tree` | `READ` | 200 | **Must precede `:id`** or Nest matches `tree` as an id (and `ParseUUIDPipe` would 400 it). All zones, `active` flag included (proposal D10). |
| 2 | `GET /geo-zones` | `READ` | 200 | `{items, total}`. Query: `search`, `level`, `parent_id` (`'null'` → roots only), `include_inactive`, `page`, `per_page`. Active-only by default. |
| 3 | `GET /geo-zones/:id` | `READ` | 200 / 404 | `ParseUUIDPipe`. **200 with `active: false`** for a deactivated zone. |
| 4 | `POST /geo-zones` | `CREATE` | 201 | `polygon` required. |
| 5 | `PATCH /geo-zones/:id` | `UPDATE` | 200 / 400 / 404 | All fields optional; `active: true` is the re-activation path. |
| 6 | `DELETE /geo-zones/:id` | `DELETE` | 204 / 404 | `@HttpCode(HttpStatus.NO_CONTENT)`; sets `active = false`, row survives. Idempotent 204 on an already-inactive zone. |

---

## DTOs — `backend/src/modules/geo-zones/dto/`

`create-geo-zone.dto.ts`
```ts
@IsString() @IsNotEmpty() @MaxLength(255)          name!: string;
@IsGeoJsonPolygon()                                 polygon!: GeoJsonPolygonInput;   // required (column NOT NULL)
@IsOptional() @IsIn(GEO_ZONE_LEVELS)                level?: GeoZoneLevel;            // default 'zona'
@IsOptional() @IsUUID('4') @ValidateIf(o => o.parent_id !== null)  parent_id?: string | null;
@IsOptional() @IsBoolean()                          active?: boolean;                // default true
```

`update-geo-zone.dto.ts` — same fields, **all** `@IsOptional()`, including `polygon`. Snake_case wire names (`parent_id`), matching T3.7.

`is-geojson-polygon.validator.ts` — custom `ValidatorConstraint` (D7):
1. value is a non-null, non-array object;
2. `value.type` is exactly `'Polygon'` or `'MultiPolygon'`;
3. `value.coordinates` is a non-empty array.

Nothing deeper — depth/winding/self-intersection is PostGIS's job (`ST_IsValid`), and duplicating it in TypeScript would be a second, drifting implementation. Failure message: `polygon must be a GeoJSON Polygon or MultiPolygon object`.

---

## Error Table

| # | Condition | Where detected | HTTP | Body `message` |
|---|---|---|---|---|
| E1 | Missing/blank `name`, `name` > 255 | `ValidationPipe` | **400** | class-validator default |
| E2 | `polygon` absent on POST | `ValidationPipe` | **400** | `polygon must be a GeoJSON Polygon or MultiPolygon object` |
| E3 | `polygon` not an object / wrong `type` / missing-or-empty `coordinates` | `IsGeoJsonPolygon` (D7) | **400** | `polygon must be a GeoJSON Polygon or MultiPolygon object` |
| E4 | `level` not in `GEO_ZONE_LEVELS` | `ValidationPipe` `@IsIn` | **400** | `level must be one of the following values: provincia, canton, parroquia, zona` |
| E5 | `parent_id` not a UUID | `ValidationPipe` | **400** | class-validator default |
| E6 | `:id` not a UUID | `ParseUUIDPipe` | **400** | Nest default |
| E7 | `ST_GeomFromGeoJSON` parse failure (PG `22023` / `XX000`) | repo `validateGeometry` try/catch | **400** | `Invalid GeoJSON geometry` (PG detail appended, sanitized — never the raw SQL) |
| E8 | `ST_GeometryType(g)` ≠ `ST_MultiPolygon` after `ST_Multi` | repo `validateGeometry` | **400** | `polygon must resolve to a Polygon or MultiPolygon` |
| E9 | `ST_IsValid(g) = false` | service, from `GeometryCheck` | **400** | `Invalid geometry: {ST_IsValidReason() verbatim}` — e.g. `Invalid geometry: Self-intersection at or near point -80.7 -2.1` |
| E10 | `ST_IsEmpty(g) = true` | service | **400** | `Geometry is empty` |
| E11 | `parent_id` references a nonexistent zone | service `assertValidParent` | **400** | `Parent zone not found` |
| E12 | Parent level incompatible with the child's effective level (D6 table) | service `assertValidParent` | **400** | `Invalid parent level: a {child} must have a {expected} parent` / `a provincia cannot have a parent` |
| E13 | `parent_id` equals the zone's own id | service (`validateNoCycles` short-circuit) | **400** | `Circular reference detected` |
| E14 | `parent_id` is a transitive descendant | service `validateNoCycles` | **400** | `Circular reference detected` |
| E15 | Zone id not found (GET / PATCH / DELETE) | service `findById` / repo returning no row | **404** | `Zone not found` |
| E16 | No JWT / expired JWT | `JwtAuthGuard` | **401** | Nest default |
| E17 | Missing `{ACTION} geo-zones` permission | `PermissionGuard` | **403** | existing guard message |

Notes: **409 is never used by T3.8** — under proposal D2 no zone row is ever deleted, so the FK-violation path that produced T3.7's 409 (`23503`) has no analogue here. Every hierarchy/geometry rejection is a domain **400**.

---

## File Changes

| File | Action | Description |
|---|---|---|
| `database/migrations/0013_geo_zones_hierarchy.sql` | Create | Columns, 2 CHECKs (DO-guarded), 2 indexes, seed backfill, 4 permission rows |
| `database/rollback/0013_geo_zones_hierarchy.DOWN.sql` | Create | Reverse; `.DOWN.sql` suffix is required by the runner |
| `backend/src/entities/geo-zone.entity.ts` | **Modify** | `parentId`, `level`, `GEO_ZONE_LEVELS`, `GeoZoneLevel` |
| `backend/src/modules/geo-zones/geo-zones.controller.ts` | Create | 6 routes, `tree` before `:id` |
| `backend/src/modules/geo-zones/geo-zones.service.ts` | Create | CRUD, parent/level guard, geometry guard, purge orchestration |
| `backend/src/modules/geo-zones/geo-zones.repository.ts` | Create | Raw PostGIS + CTE + cycle walk + `buildZoneTree` |
| `backend/src/modules/geo-zones/geo-zones.module.ts` | Create | Imports `GeofencingModule` |
| `backend/src/modules/geo-zones/dto/{create,update}-geo-zone.dto.ts` | Create | class-validator DTOs, snake_case wire names |
| `backend/src/modules/geo-zones/dto/is-geojson-polygon.validator.ts` | Create | Custom constraint (D7) |
| `backend/src/modules/geofencing/geofencing.service.ts` | **Modify** | `POINT_CACHE_TAG_KEY`, `tagPointCacheKey()`, `purgePointCache()`, one call in `getCachedZoneByPoint`'s existing `zone !== null` branch, `ALL_ZONES_TAG` moved here (D10) |
| `backend/src/modules/incidents/incidents.service.ts` | **Modify** | Re-export `ALL_ZONES_TAG` (D10) — two lines, no behaviour change |
| `backend/src/app.module.ts` | Modify | Register `GeoZonesModule` |
| `backend/src/modules/geo-zones/*.spec.ts` | Create | Unit specs (see below) |
| `backend/test/e2e/geo-zones.e2e-spec.ts` | Create | CRUD, tree, cycle, geometry, deactivate, CC5 |

---

## Testing Strategy (Strict TDD — `npm test` from `backend/`)

Red → green per unit, smallest failing test first. Suggested order: geometry validation → parent/level guard → cycle guard → `buildZoneTree` → cache purge → controller wiring → e2e.

| Layer | File | What |
|---|---|---|
| Unit | `geofencing.service.spec.ts` (extend) | `getCachedZoneByPoint` SADDs the key into `geo:tags:points` **only** when `zone !== null` and **only** on a miss (mock `cache` + `redis`, assert no `sadd` on a hit); `purgePointCache` calls `smembers` on the **raw** client, `cache.del` (not `redis.del`) per member, then `redis.del(POINT_CACHE_TAG_KEY)` — this assertion is the DB0/DB1 regression guard and must exist |
| Unit | `geo-zones.service.spec.ts` | Level matrix (D6) all 4×5 combinations; parent-not-found 400; cycle 400; 404 on missing; `ST_IsValid=false` → 400 carrying `ST_IsValidReason` verbatim; empty geometry 400; **purge fires on `polygon`/`active` change and does NOT fire on a rename or a `level`/`parent_id`-only change** (D8); already-inactive `deactivate` → no purge, no throw |
| Unit | `geo-zones.repository.spec.ts` | `buildZoneTree` flat→nested + `MAX_DEPTH` cap (pure, no DB); `validateNoCycles` self/direct/transitive with a mocked `DataSource` |
| E2E | `test/e2e/geo-zones.e2e-spec.ts` | Everything below |

### E2E fixture rule (non-negotiable)

`test/support/test-environment.ts:219-229` documents that `reset()` **deliberately preserves `geo_zones`** (only `assignments, comments, incidents, incident_categories, user_sessions, users` are truncated). Therefore:

- **Never mutate the four seeded Santa Elena rows.** A shrunk seed polygon persists for the rest of the suite and silently breaks every geofencing-dependent test that runs after it, in a way that only reproduces in full-suite order.
- Every boundary-mutation test **creates its own throwaway zone** (via `POST /api/geo-zones` — the code under test — or `env.pg.query` with `ST_GeomFromGeoJSON` for arrange-only fixtures) and **deletes it in `afterEach`** with a real `DELETE FROM geo_zones WHERE id = $1`. This is the one place a hard delete is legitimate: it is test teardown, not the API's semantics.
- Throwaway polygons must sit **outside** the seeded province bbox (`lng[-81.008,-80.200] × lat[-2.508,-1.669]`, from `generate-geo-zones-seed.js:21-22`). Use e.g. a square around `lat 0.500, lng -78.000`. `findZoneByPoint` uses `LIMIT 1` with no `ORDER BY`, so overlapping a seeded polygon makes the resolved zone nondeterministic.
- The hierarchy assertion on seeded data (`/tree` → Santa Elena (Provincia) with exactly 3 cantón children) is a **read-only** test and is safe.
- `reset()` also does `redisCache.flushdb()` (DB 1) but deliberately **not** `redisStreams.flushdb()` (DB 0) — so `geo:tags:points` members survive a reset while the values they name do not. Harmless (`cache.del` on an absent key is a no-op) but tests must not assert on the tag-set's *size* across resets; assert on the DB 1 keys instead.

### CC5 — deterministic, no sleep

```
arrange  admin = env.provisionUser(['CREATE geo-zones','UPDATE geo-zones','READ geo-zones','DELETE geo-zones'])
         citizen = env.provisionUser(['CREATE incidents'])
         POST /api/geo-zones  → zone Z, a LARGE square around (0.500, -78.000)   // far from the seed
   act 1 POST /api/incidents at P = (0.500, -78.000)
 assert  201, zone_id === Z.id, geofence_matched === true
         env.redisCache.exists('geo:point:0.500:-78.000') === 1        // point cache is warm
         env.redisStreams.sismember('geo:tags:points', 'geo:point:0.500:-78.000') === 1
   act 2 PATCH /api/geo-zones/Z  { polygon: a SMALL square that excludes P }
 assert  200
         env.redisCache.exists('geo:point:0.500:-78.000') === 0        // ← the purge actually happened, on DB 1
         env.redisStreams.exists('geo:tags:points') === 0
   act 3 POST /api/incidents at the SAME P
 assert  201, zone_id === null, geofence_matched === false             // ← CC5, with no sleep
teardown DELETE FROM geo_zones WHERE id = Z.id
```

Act-2's two Redis assertions are what make this a *cache* test rather than a lucky *behaviour* test: without them, a purge that silently ran against the wrong Redis DB would still be caught only by timing (60 s TTL) and the failure would look like flake. Assert the DB-1 key is gone with `env.redisCache` (which is explicitly `db: 1` at `test-environment.ts:202`).

Act 3 asserts a **newly submitted** incident. Per the proposal's Non-Retroactivity section, the incident created in act 1 keeps `zone_id = Z` forever; the test name must say "a newly submitted incident", never "the incident is re-zoned".

### Other e2e cases

| Case | Expectation |
|---|---|
| `GET /geo-zones/tree` on seeded data | Santa Elena (Provincia) root with exactly 3 cantón children (read-only) |
| Self-intersecting polygon (bow-tie) POST | 400, message contains `Self-intersection` |
| GeoJSON `Point` submitted as `polygon` | 400 (DTO, E3) |
| Bare `Polygon` in → read back | 200; response `polygon.type === 'MultiPolygon'` (silent `ST_Multi`, proposal D7) |
| `PATCH` setting `parent_id` to a descendant | 400 `Circular reference detected` |
| `PATCH` setting a `canton`'s parent to another `canton` | 400 `Invalid parent level` |
| `DELETE /:id` | 204; row still `SELECT`able with `active = false`; a referencing `incidents.zone_id` still points at it |
| `DELETE /:id` twice | 204 both times |
| `GET /:id` on an inactive zone | 200 with `active: false` |
| `GET /geo-zones` default vs `?include_inactive=true` | inactive zone absent, then present |
| `PATCH { active: true }` re-activation | 200, and a subsequent incident inside it resolves to it again |
| Each verb without its permission | 403 (reader token with only `READ geo-zones` gets 403 on POST/PATCH/DELETE) |
| No token | 401 |

---

## Migration / Rollout

0013 is applied **manually** (CC3 — `synchronize` and `migrationsRun` stay `false`). The e2e harness picks it up automatically via the numeric scan in `test/support/run-migrations.ts`. Existing rows are unaffected except the four seeded zones, which gain `level`/`parent_id`; every other row defaults to `level = 'zona', parent_id = NULL`. Zero downtime, zero backfill job, no FK changes to `organizations.zone_id` / `incidents.zone_id`.

Deployment order matters in one direction only: **apply 0013 before shipping the code**, because `GeoZonesRepository` selects `parent_id`/`level` unconditionally. The reverse (0013 applied, code not yet shipped) is inert.

## Open Questions

- [ ] `geo_zones` has no `updated_at` column (unlike `incident_categories`). 0013 deliberately does not add one — confirm no admin UI needs a "last edited" timestamp before this ships, or it becomes a 0014.
- [x] ~~Confirm `GeofencingModule` exports `GeofencingService`~~ — **verified**: `geofencing.module.ts:13` `exports: [GeofencingService]`. `GeoZonesModule` only needs `imports: [GeofencingModule]`. Note its docblock says "owns geo_zones; other modules inject GeofencingService rather than querying geo_zones directly" — T3.8 deliberately breaks that clause for the **write** side (D1/D2); update the docblock to say "owns geo_zones *reads*" so the comment does not become a lie.
- [ ] Permission resource ships as the hyphenated `geo-zones`; confirm no admin UI expects `geo_zones` or `locations`.
