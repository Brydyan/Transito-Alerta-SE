# geo-zones-admin Specification

Derived from proposal `openspec/changes/t3.8-locations/proposal.md` (Engram `sdd/t3.8-locations/proposal`, #414). New capability — no prior spec exists.

## Purpose

Governed CRUD over `geo_zones` jurisdiction polygons: geometry validity enforced at write time, provincia→cantón→parroquia→zona hierarchy, deactivate-not-delete lifecycle, and cache purge on boundary change so containment lookups reflect edits without stale reads.

## Assumptions

- `AS-1`: List/detail/tree response bodies follow the D-decisions table in the proposal verbatim (Active-only default list, 200 on inactive detail, re-activate via PATCH, `/tree` shows all zones) — restated here as normative, not re-decided.
- `AS-2`: `polygon` on read is **always** GeoJSON, always `MultiPolygon` (post-`ST_Multi` coercion), on both list and detail responses — no WKT, no omission. Payload-size concern from the proposal is accepted as a known cost; not addressed by this change.
- `AS-3`: `search` filters list results by `name ILIKE '%query%'`, mirroring T3.7.
- `AS-4`: Pagination mirrors T3.7: `page`/`per_page`, default 15/page, response `{ data: [...], meta: { total, page, per_page } }`.

## Requirements

### Data Model
- **MUST**: `GeoZoneEntity` (`backend/src/entities/geo-zone.entity.ts`) gains flat columns `parentId` (uuid, nullable, self-FK `ON DELETE SET NULL`) and `level` (varchar, `NOT NULL DEFAULT 'zona'`).
- **MUST**: Migration `0013_geo_zones_hierarchy.sql` adds `parent_id`, `level` (CHECK `level IN ('provincia','canton','parroquia','zona')`), an index on `parent_id`, permission catalog rows for resource `geo-zones`, and an idempotent backfill matched by literal seed UUID: `…000024`→`level='provincia', parent_id=NULL`; `…000101/102/103`→`level='canton', parent_id='…000024'`.
- **MUST**: `active` remains the sole lifecycle flag; no new soft-delete column.

### Hierarchy & Cycles
- **MUST**: `parent_id`, when provided, MUST reference an existing zone row (400 `PARENT_NOT_FOUND` otherwise).
- **MUST**: Parent's `level` MUST be the immediate ancestor of the child's level (`canton`→parent `provincia`, `parroquia`→parent `canton`); mismatch → 400 `INVALID_PARENT_LEVEL`. `zona` is unconstrained in both directions. `NULL` parent allowed at any level.
- **MUST**: Reject cycles (including self-parent) via ancestor walk from the candidate `parent_id`, inside the write transaction, on both create and update → 400 `CYCLIC_PARENT`.
- **SHALL**: Support arbitrary depth via recursive CTE for `/tree`, depth cap 1000 as a backstop.
- **MUST NOT**: Deactivating a zone cascade to its descendants — children keep their existing `active` value.

### Geometry Contract
- **MUST**: `polygon` accepts a GeoJSON object with `type` ∈ {`Polygon`, `MultiPolygon`}. Required on POST, optional on PATCH.
- **MUST**: A bare `Polygon` is silently coerced via `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`; no 400, no client-visible warning.
- **MUST**: `ST_IsValid` rejects geometrically invalid input → 400 `INVALID_GEOMETRY` with `ST_IsValidReason()` text in the message.
- **MUST**: All read responses (list and detail) return `polygon` as GeoJSON `MultiPolygon`, regardless of input shape.

### API: GET /geo-zones/tree
- **MUST**: Return every zone with parent/children linkage and its `active` flag — inactive zones are included, not filtered (a deactivated parent may appear above active children; this is correct, not a bug).
- **MUST**: Route declared before `GET /:id` so Nest does not match `tree` as an id param.
- **MUST**: Each level sorted by `name` ASC. Status 200.

### API: GET /geo-zones (list)
- **MUST**: Active-only by default; `?include_inactive=true` includes inactive zones.
- **MUST**: Support filters `search` (name ILIKE), `parent_id` (exact match, `null` = roots), `level`, `active`.
- **MUST**: Support pagination per AS-4. Response `{ items, total }` (no `{data}` envelope, per proposal).

### API: GET /geo-zones/:id
- **MUST**: Return 200 for both active and inactive zones (row existence, not `active`, gates visibility). 404 if the id does not exist.

### API: POST /geo-zones
- **MUST**: Require permission `CREATE` on resource `geo-zones`.
- **MUST**: Validate `name`, `polygon` (required), `level` (must be one of the 4 values, default `zona`), `parent_id` (optional).
- **MUST**: Return 201 with the created zone (GeoJSON `MultiPolygon` in response).

### API: PATCH /geo-zones/:id
- **MUST**: Require permission `UPDATE` on `geo-zones`. Accept partial `{ name?, polygon?, level?, parent_id?, active? }`.
- **MUST**: Setting `active: true` on an inactive zone re-activates it (idempotent re-activate path uses `UPDATE` permission, not a separate one).
- **MUST**: Purge zone cache (`purgeZoneCache(zoneId)` + `purgeZoneCache(ALL_ZONES_TAG)`) and point cache (`purgePointCache()`) when `polygon` changed or `active` flipped; a name-only rename purges nothing.
- **MUST**: Return 200 with the updated zone. 404 if id not found.

### API: DELETE /geo-zones/:id
- **MUST**: Require permission `DELETE` on `geo-zones`. Sets `active = false`; row, and every `organizations.zone_id` / `incidents.zone_id` reference, is preserved.
- **MUST**: Trigger the same cache purge as an `active`-flip PATCH.
- **MUST**: Return 204. Idempotent — deactivating an already-inactive zone also returns 204, not 404/409.

### Non-Retroactivity
- **MUST NOT**: A boundary edit re-zone any existing incident. `incidents.zone_id` is resolved once at incident-write time and stored; there is no recompute-on-read or backfill. Only incidents **submitted after** the edit and cache purge see the new boundary.

## Test Scenarios

### TS-1: Create Root Zone
GIVEN no custom zones exist. WHEN `POST /geo-zones { name: "Guayas", level: "provincia", polygon: <valid MultiPolygon> }`. THEN 201; `level: "provincia"`, `parent_id: null`.

### TS-2: Create Child Zone
GIVEN root zone G (id=G1, level=provincia). WHEN `POST /geo-zones { name: "Daule", level: "canton", parent_id: G1, polygon: <valid> }`. THEN 201; `parent_id === G1`.

### TS-3: Bare Polygon Coerced to MultiPolygon
GIVEN a valid bare GeoJSON `Polygon`. WHEN `POST /geo-zones` with that polygon. THEN 201; `GET /geo-zones/:id` returns `polygon.type === "MultiPolygon"`.

### TS-4: Invalid Geometry Rejected
GIVEN a self-intersecting bowtie polygon. WHEN `POST /geo-zones` with it. THEN 400 `INVALID_GEOMETRY` with `ST_IsValidReason()` text in the message.

### TS-5: Invalid Level Rejected
GIVEN `level: "ciudad"` (not in the allowed set). WHEN `POST /geo-zones`. THEN 400.

### TS-6: Parent Not Found
GIVEN `parent_id` referencing a non-existent uuid. WHEN `POST /geo-zones`. THEN 400 `PARENT_NOT_FOUND`.

### TS-7: Cycle Rejected on Re-parent
GIVEN chain A(zona)→B(zona)→C(zona). WHEN `PATCH /geo-zones/A { parent_id: C }`. THEN 400 `CYCLIC_PARENT`; no row mutated.

> **Corrected after verification.** This scenario originally read
> `A(provincia)→B(canton)→C(parroquia)`, which is unreachable: `provincia` is the
> only level whose required parent level is `null`, so re-parenting a `provincia`
> always fails the level-compatibility check (`INVALID_PARENT_LEVEL`) before the
> cycle guard ever runs. The unreachability is structural rather than an artifact
> of check ordering — for every level-constrained pair (`canton`→`provincia`,
> `parroquia`→`canton`) the required ancestor level is one that can never itself
> carry a non-null `parent_id`, so it can never become a descendant of the node
> closing the loop. `zona` is the only level with an unconstrained parent, and
> therefore the only level at which a genuine cycle can form and reach
> `CYCLIC_PARENT`. The requirement is unchanged; only the scenario that
> exercises it was wrong.

### TS-8: Tree Depth ≥ 2
GIVEN seeded Santa Elena (provincia) with 3 cantón children (post-0013 backfill). WHEN `GET /geo-zones/tree`. THEN 200; Santa Elena appears with exactly 3 children at depth 1.

### TS-9: Deactivate Preserves Children
GIVEN provincia P with active canton child K. WHEN `DELETE /geo-zones/{P.id}`. THEN 204; P row exists with `active: false`; K still `active: true`.

### TS-10: Inactive Zone Excluded from Geofencing
GIVEN a throwaway zone Z is deactivated. WHEN a new incident is submitted at a point inside Z's polygon. THEN the incident does NOT resolve to Z (containment ignores inactive zones).

### TS-11 (CC5): Boundary Shrink Affects Only New Incidents
GIVEN throwaway zone Z with a point P previously inside its boundary. WHEN `PATCH /geo-zones/{Z.id}` shrinks the polygon so P falls outside, THEN a NEW incident submitted at P after the PATCH does NOT resolve to Z. Existing incidents previously resolved to Z retain their stored `zone_id` unchanged — this scenario is about newly submitted incidents only, not retroactive re-zoning.

### TS-12: Permission Guards
GIVEN a user without `CREATE`/`UPDATE`/`DELETE` on `geo-zones`. WHEN calling the corresponding `POST`/`PATCH`/`DELETE`. THEN 403, request never reaches the service layer.

### TS-13: Seed Backfill Verification
GIVEN migration 0013 has run. WHEN querying the seeded Santa Elena province row. THEN `level = 'provincia'`, `parent_id IS NULL`; its 3 cantón rows have `level = 'canton'`, `parent_id` = the province id.

## Error Mapping

| Condition | Status | Code |
|---|---|---|
| `polygon` malformed / bad `type` / missing `coordinates` | 400 | `INVALID_GEOMETRY_FORMAT` |
| `ST_GeomFromGeoJSON` parse failure | 400 | `INVALID_GEOMETRY_FORMAT` |
| `ST_IsValid` false | 400 | `INVALID_GEOMETRY` (with `ST_IsValidReason()`) |
| Geometry empty | 400 | `EMPTY_GEOMETRY` |
| Invalid `level` value | 400 | validation error |
| `parent_id` not found | 400 | `PARENT_NOT_FOUND` |
| Parent level mismatch | 400 | `INVALID_PARENT_LEVEL` |
| `parent_id` creates a cycle / self-parent | 400 | `CYCLIC_PARENT` |
| Zone id not found (GET/PATCH/DELETE) | 404 | — |
| Permission denied | 403 | Standard `PermissionGuard` response |

## Test-Strategy Note

`backend/test/support/test-environment.ts` `reset()` PRESERVES `geo_zones` seed rows by design. Any scenario that mutates a boundary (TS-3, TS-11) MUST create a throwaway zone via `env.pg.query` + `ST_GeomFromGeoJSON`, never edit the seeded Santa Elena polygon — mutating seed data leaks into other suites.

## Out of Scope (carried from proposal)
- Citizen-facing location catalog endpoint.
- Re-zoning existing incidents after a boundary edit.
- Nullable `polygon`, `code` column, bulk GeoJSON import, `parroquia` seed data, frontend work.
- Hard delete of a zone row.
