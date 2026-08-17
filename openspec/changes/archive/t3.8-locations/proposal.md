# Proposal: T3.8 Locations — `geo_zones` Admin CRUD + Hierarchy

Source: `sdd/t3.8-locations/explore` (#412). Artifact store: hybrid. Next free migration: **0013**.

## Intent

`geo_zones` is today a read-only, seed-populated table. Boundaries can only be changed by hand-editing SQL, which means jurisdiction changes require a DBA and a deploy. T3.8 gives admins a governed CRUD over zone boundaries, with **geometric validity enforced at write time** and **the geofencing cache purged on every boundary change** so the next containment lookup reflects the new shape. The user additionally directed that the hierarchy from the Laravel `Locations` domain (`parent_id` + `level`) be ported, so the seeded province→cantón relationship stops being four disconnected flat rows.

## Scope

### In Scope
- New module `backend/src/modules/geo-zones/` (controller/service/repository/module + DTOs), mirroring the `incident-categories` module shape.
- Migration `0013_geo_zones_hierarchy.sql` + `database/rollback/0013_geo_zones_hierarchy.DOWN.sql`: add `parent_id` (self-FK), `level` (CHECK-constrained), index on `parent_id`, permission catalog rows for resource `geo-zones`, and an **inline idempotent backfill** of the 4 seeded rows.
- Routes: `GET /api/geo-zones`, `GET /api/geo-zones/tree`, `GET /api/geo-zones/:id`, `POST`, `PATCH /:id`, `DELETE /:id` (deactivate).
- GeoJSON `polygon` contract with `ST_IsValid` rejection + `ST_IsValidReason()` diagnostic.
- Cycle guard (ancestor walk) + recursive-CTE subtree, reusing T3.7's proven shape.
- Cache invalidation on boundary change: call existing `GeofencingService.purgeZoneCache()`, plus a new `purgePointCache()` (see D8 — this is the one genuinely new cache code).
- Unit specs + `backend/test/e2e/geo-zones.e2e-spec.ts`, including the shrink-zone / resubmit-incident acceptance test.

### Out of Scope
- Citizen-facing catalog endpoint (Laravel's `LocationCatalogController`). This repo's incidents take raw lat/lng, not a `location_id` cascade — **confirmed unnecessary**, not silently dropped.
- Re-zoning existing incidents after a boundary edit (see "Non-Retroactivity" — architecturally out of scope, not deferred).
- Relaxing `geo_zones.polygon` to NULL-able (Laravel allowed geometry-less locations; this repo does not, and T3.8 does not change that).
- A `code` column, bulk GeoJSON import, `parroquia`-level seed data, and any frontend work.
- Changing `organizations.zone_id` / `incidents.zone_id` FK actions (no FK migration needed under D2).
- Hard delete of a zone row, in any form.

## Capabilities

### New Capabilities
- `geo-zones-admin`: authenticated admin CRUD over jurisdiction polygons — validity-checked geometry writes, hierarchy (parent/level/tree/subtree), deactivation semantics, and cache-purge-on-boundary-change.

### Modified Capabilities
- None at the spec-file level (`openspec/specs/` is currently empty). `GeofencingService` gains one method (`purgePointCache`) but its externally observed behaviour — "lookups reflect the current active polygons" — is unchanged in contract, only made true sooner.

## Locked Design Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| D1 | Route / resource | `@Controller('geo-zones')` → `/api/geo-zones`; resource infers as `geo-zones` | `@Controller('admin/locations')` from the task doc | `inferResourceFromPath` takes the first segment after `/api/`; an `admin/` prefix makes every nested route infer resource `admin`, forcing an explicit resource string on every `@RequirePermission` — the codebase calls that the exception, not the rule. No existing controller uses an `admin/` prefix. **User-locked.** |
| D2 | Delete semantics | `DELETE /:id` sets `active = false`; row survives | Hard delete (`ON DELETE SET NULL` silently detaches orgs/incidents); hard delete + `RESTRICT` | `active` is already respected by both geofencing reads (`WHERE active = true`). Satisfies "archivar para pista de auditoría" with zero migration and zero new soft-delete machinery (this codebase has none). **User-locked.** |
| D3 | Hierarchy | Add `parent_id uuid REFERENCES geo_zones(id) ON DELETE SET NULL` + `level` | Stay flat | Ported by explicit user direction; makes T3.7's cycle guard + CTE machinery directly reusable. **User-locked.** |
| D4 | `level` vocabulary | CHECK IN (`'provincia'`, `'canton'`, `'parroquia'`, `'zona'`); ASCII, unaccented, lowercase; NOT NULL DEFAULT `'zona'` | Laravel's `country/province/city/neighborhood` | The real administrative chain here is provincia→cantón→parroquia; `city`/`neighborhood` do not map onto cantón/parroquia and would mislead every future importer. Unaccented `canton` avoids encoding/query-param breakage. `'zona'` covers admin-drawn operational zones that are not administrative divisions — and gives the column a safe NOT NULL default for any non-seed row. |
| D5 | Seed backfill | **Inline, idempotent, matched by literal UUID**, inside migration 0013 | Name matching; a new `code` column; separate data migration | The seed rows carry deterministic UUIDs by design (`generate-geo-zones-seed.js:31-37`: `EC-24`→`…000024`, `EC-24-01/02/03`→`…000101/102/103`, explicitly "so the seed is idempotent/reproducible and other tables can reference a stable id"). Name matching is unusable — `'Santa Elena (Provincia)'` and `'Santa Elena (Cantón)'` both start with "Santa Elena". Backfill: `…024` → `level='provincia', parent_id=NULL`; `…101/102/103` → `level='canton', parent_id='…024'`. Guarded `UPDATE … WHERE id = $literal` is naturally idempotent and no-ops on a DB where the seed was never run. |
| D6 | Level/parent consistency | Service-level guard: if `parent_id` is set, parent's `level` must be the immediate ancestor (`canton`→`provincia`, `parroquia`→`canton`, `provincia`→must be NULL). `'zona'` is unconstrained in both directions. NULL parent allowed at any level. | Laravel's strict "non-country must have a parent"; a DB CHECK | Cross-row rule, so not expressible as a CHECK. Requiring a parent would block creating a lone cantón before its province exists — a real import order. Returns 400 `INVALID_PARENT_LEVEL`. |
| D7 | Geometry contract | `polygon` = GeoJSON object, `type` ∈ {`Polygon`,`MultiPolygon`}; **silent** `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))` coercion; then `ST_IsValid` guard | Rejecting bare `Polygon` with a 400; accepting WKT | Every browser drawing library (Leaflet.draw, Mapbox GL Draw) emits a bare `Polygon`; rejecting it pushes a pointless wrapping burden onto every client, and `ST_Multi` is lossless and a no-op on an already-multi geometry. WKT is named in the task doc but is spoken nowhere in this codebase. `polygon` is required on POST (column is NOT NULL), optional on PATCH. |
| D8 | Cache purge trigger | Purge **only** when `polygon` changed or `active` flipped — not on a rename. Purge = `purgeZoneCache(zoneId)` + `purgeZoneCache(ALL_ZONES_TAG)` + new `purgePointCache()` | Purge on every PATCH; reuse `purgeZoneCache` alone | Zone name does not participate in containment/proximity results, so a rename cannot stale any cached payload. **Gap found:** `purgeZoneCache` covers the per-zone tagged list cache but NOT the 60 s point cache (`geo:point:{lat3}:{lng3}`), whose keys are not zone-tagged. Without a point-cache purge, acceptance criterion CC5 ("next lookup reflects it") is false for up to 60 s and the e2e would be flaky. `purgePointCache()` = SCAN + DEL over `geo:point:*`; boundary edits are rare so the cost is acceptable. Design phase must pin **which Redis DB** holds those keys (the DB0/DB1 split that `purgeZoneCache`'s inline comment already warns about). |
| D9 | Deactivating a parent | Does **not** cascade to descendants | Cascade-deactivate the subtree | `active` is a geofencing-resolution flag, not a lifecycle flag. An incident inside La Libertad must keep resolving to La Libertad even if the province row is deactivated; cascading would silently un-zone live data across three cantons in one click. |
| D10 | Tree visibility | `GET /geo-zones/tree` returns **all** zones with their `active` flag; the client filters | Filter inactive out of the tree | Under D9 a deactivated parent can have active children; hiding it would orphan them in the UI. Declared **before** `GET /:id` or Nest matches `tree` as an id. |
| D11 | Cycle guard | Ancestor walk from the candidate `parent_id` inside the write transaction → 400; recursive CTE with depth cap 1000 for subtree reads | DB trigger | Verbatim reuse of T3.7 D3/D4 (shipped and verified). Catches self-parent too. |

### List / read semantics under D2

| Question | Answer |
|---|---|
| `GET /geo-zones` default | Active only. `?include_inactive=true` returns both. Response `{items, total}` (no `{data}` envelope). |
| `GET /geo-zones/:id` on an inactive zone | **200**, with `active: false`. The row exists; audit reads must work. |
| Re-activate path | Yes — `PATCH /:id {"active": true}`, gated by `UPDATE geo-zones`. Triggers the D8 purge. |
| `DELETE /:id` on an already-inactive zone | Idempotent **204**, not 404/409. |
| Re-activating a child of an inactive parent | Allowed — no cascade in either direction (D9). |

### Error contract

| Condition | Status | Code | Message |
|---|---|---|---|
| `polygon` not an object / bad `type` / missing `coordinates` | 400 | `INVALID_GEOMETRY_FORMAT` | class-validator, before any DB round-trip |
| `ST_GeomFromGeoJSON` parse failure (PG `22023`/`XX000`) | 400 | `INVALID_GEOMETRY_FORMAT` | PG detail, sanitized |
| `ST_IsValid` false | 400 | `INVALID_GEOMETRY` | `ST_IsValidReason()` verbatim, e.g. `Self-intersection at or near point -80.7 -2.1` |
| Geometry empty | 400 | `EMPTY_GEOMETRY` | — |
| `parent_id` not found | 400 | `PARENT_NOT_FOUND` | — |
| Parent level mismatch (D6) | 400 | `INVALID_PARENT_LEVEL` | — |
| `parent_id` creates a cycle / self-parent | 400 | `CYCLIC_PARENT` | — |
| Zone id not found | 404 | — | — |

**`ST_IsValid` is a new guarantee, not a port.** Laravel's `StoreLocationRequest`/`UpdateLocationRequest` validate `geom` only as `nullable|json` — well-formed JSON, never geometric validity. A self-intersecting polygon was accepted by GeoReporta and would silently corrupt containment results. T3.8 closes that hole.

## Non-Retroactivity (must survive into the spec and the e2e description)

`incidents.zone_id` is resolved **once**, at incident-write time (`incidents.service.ts:55-71` → `geofencing.resolveZone()`), and stored as a plain column. There is no trigger, no recompute-on-read, and no backfill job. **Editing a zone boundary does not move, re-tag, or re-zone any existing incident row.** The task doc's acceptance criterion — "reducir zona Santa Elena, re-enviar incidente en borde previo → ahora fuera" — holds **only for a new incident POSTed after the edit and cache purge**. It is not a claim about historical incidents, and nothing in T3.8 makes it one. The e2e test name and the spec text must both say "newly submitted incident" so this cannot be misread as retroactive re-zoning.

## Deviations from `docs/tasks/1-BACKEND-MIGRATIONS.md`

| Doc says | We ship | Why |
|---|---|---|
| `POST/PATCH/DELETE /api/admin/locations/{id}` | `/api/geo-zones[/:id]` | D1 — the `admin/` prefix breaks `inferResourceFromPath` and is used by zero existing controllers. Resource string in the permission catalog is `geo-zones`. |
| "eliminar" / `DELETE` | Sets `active = false`; row is never removed | D2 — the doc's own gloss is "archivar (soft-delete) para pista de auditoría". A real delete would silently null out `organizations.zone_id` and `incidents.zone_id` via the existing `ON DELETE SET NULL`. |
| "GeoJSON/WKT" | GeoJSON only | D7 — WKT is spoken nowhere in this codebase. |
| Flat `geo_zones` CRUD (no hierarchy mentioned) | Adds `parent_id` + `level` + `/tree` | D3 — explicit user direction; the seed data is hierarchical in origin and currently misrepresented as four flat roots. |
| — (silent) | New `GeofencingService.purgePointCache()` | D8 — CC5 is not actually satisfiable without it; the 60 s point cache is untagged. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `database/migrations/0013_geo_zones_hierarchy.sql` | New | `parent_id`, `level`, index, permission rows, seed backfill |
| `database/rollback/0013_geo_zones_hierarchy.DOWN.sql` | New | Drop columns + index; permission rows |
| `backend/src/entities/geo-zone.entity.ts` | Modified | `parentId`, `level` (flat columns, no self-relation) |
| `backend/src/modules/geo-zones/**` | New | controller, service, repository, module, 2 DTOs |
| `backend/src/modules/geofencing/geofencing.service.ts` | Modified | Add `purgePointCache()` |
| `backend/src/app.module.ts` | Modified | Register `GeoZonesModule` |
| `backend/test/e2e/geo-zones.e2e-spec.ts` | New | CRUD, tree, cycle 400, invalid geometry 400, deactivate, shrink-zone/resubmit |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Point cache (`geo:point:*`) lives on a different Redis DB than assumed → purge no-ops and CC5 e2e flakes | Med | Design phase must confirm the client/DB before writing `purgePointCache`; `purgeZoneCache`'s existing inline comment documents the DB0/DB1 trap. Assert cache-miss in the e2e, not just the response body. |
| Backfill runs on a DB where the seed was never applied | Med | Guarded `UPDATE … WHERE id = '<literal>'` — no-ops on zero rows, no error. |
| `level` NOT NULL DEFAULT `'zona'` mislabels a future hand-inserted administrative row | Low | Default is deliberately the neutral value; administrative rows are set explicitly by the backfill or by the API. |
| Silent `ST_Multi` coercion surprises a client that round-trips `polygon` (sends `Polygon`, reads back `MultiPolygon`) | Med | State it in the spec as the documented response contract: reads are **always** `MultiPolygon`. |
| Deactivating a province leaves a visibly inactive node with active children | Med | D10 keeps it in `/tree` with its flag; document that `active` is a resolution flag, not a lifecycle flag. |
| `test-environment.ts reset()` preserves `geo_zones` — a test that mutates the seeded Santa Elena polygon leaks into later tests | High | E2E inserts its own throwaway zone for boundary-mutation tests (`env.pg.query` + `ST_GeomFromGeoJSON`); never mutate the seeded rows. |

## Rollback Plan

Apply `database/rollback/0013_geo_zones_hierarchy.DOWN.sql` (drops `parent_id`, `level`, the index, and the four `geo-zones` permission rows), revert the `GeoZonesModule` registration in `app.module.ts`, and delete the module directory. No data loss: `id`/`name`/`polygon`/`active` are untouched by 0013, and D2 means no zone row was ever deleted. `purgePointCache()` can stay — it is additive and harmless.

## Dependencies

- Migration `0012` applied (numbering continuity only; no functional dependency).
- `GeofencingService` / `GeofencingModule` must be importable by `GeoZonesModule` — verify no circular import (geofencing does not depend on geo-zones today).
- Strict TDD is active: `npm test` from `backend/`, Testcontainers-backed E2E.

## Success Criteria

- [ ] `PATCH /api/geo-zones/:id` with a new `polygon` purges the zone cache **and** the point cache; the next containment lookup reflects the new shape with no sleep (CC5).
- [ ] A self-intersecting polygon is rejected 400 with `ST_IsValidReason()` text in the message.
- [ ] E2E: shrink a throwaway zone, then POST a **new** incident at a coordinate that was previously inside → resolves outside the zone.
- [ ] `DELETE /api/geo-zones/:id` returns 204, sets `active = false`, and the row plus every `organizations.zone_id` / `incidents.zone_id` reference still exists.
- [ ] After 0013, `GET /api/geo-zones/tree` returns Santa Elena (Provincia) with exactly 3 cantón children.
- [ ] Setting a zone's `parent_id` to its own descendant returns 400 `CYCLIC_PARENT`.
- [ ] Every route is denied 403 without the matching `ACTION geo-zones` permission.
