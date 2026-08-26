# Proposal: T7.9.C/D — Geography + Organizations Seed & Demo/Volume Seeding

## Intent

Close the last two gaps of `t7-database-schema-parity`. Today `geo_zones` holds only 1 provincia + 3 cantones (via `0003_seed_geo_zones.generated.sql`); there are **zero parroquias**, **zero organizations**, and **no seeding pipeline at all** (`backend/package.json` has no `db:seed`). Consequences: org routing/geofencing cannot be exercised below canton level, R21/R22 are unverifiable, and there is no reproducible dataset for demo or performance work.

## Scope

### In Scope
- **C.1** Source real parroquia boundaries for Santa Elena from **OpenStreetMap** (`admin_level=8`, ODbL 1.0); commit extracted GeoJSON + provenance/license record. INEC DPA cartography is **rejected** — see Approach.
- **C.2** Extend `database/seeds/generate-geo-zones-seed.js` to emit `level='parroquia'` rows with `code`, `parent_id`, real MULTIPOLYGON.
- **C.3/C.4** New migration `database/migrations/0041_geography_organizations_seed.sql`: backfill `geo_zones.code` on the 4 existing rows, then parroquia INSERTs + `CTE - Santa Elena` organization INSERT.
- **C.5** Symmetric rollback in `database/rollback/0041_geography_organizations_seed.DOWN.sql`.
- **C.6** E2E R21.1–R21.5.
- **D.1–D.5** E2E R22.1–R22.4; users seeder (1 master, 1 operador_sistema, 2 admin_org, 2 operador_org); demo generator (~25 incidents); volume generator (1000 incidents with full lifecycle); in-process feed rebuild; `db:seed` / `db:seed:mass` npm scripts.

### Out of Scope
- Touching any migration ≤ 0040 (`0039_organizations_permissions.sql`, `0040_rename_roles.sql`, `0003_seed_geo_zones.sql` — all already executed against Supabase). Applied migrations are immutable; Fase C goes in a new file.
- `level='zona'` (sub-parish operational zones) — future work.
- Additional organizations beyond CTE - Santa Elena; org hierarchy (`parent_id`) stays null.
- Running any seeder against a shared/production database.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `database-schema`: R21.1–R21.5 and R22.1–R22.4 get concrete acceptance criteria. R21 currently anchors its scenarios to "0039"; since 0039 is the already-applied permissions migration, every R21 scenario must be re-anchored to **0041**.
- `database-schema`: R21.3 drops buffered containment in favour of an interior-point test plus an overlap ratio (design.md D5) — the parish/canton comparison is unavoidably cross-source, and a buffer large enough to absorb that stops discriminating.

## Approach

### C.1 — Data sourcing
| Item | Decision |
|------|----------|
| Source | **OpenStreetMap**, `admin_level=8` = parroquia in Ecuador (hierarchy: 2=country, 4=provincia, 6=cantón, 8=parroquia). Confirmed by an actual Overpass query on `area["ISO3166-2"="EC-SE"]`, not wiki inference: all 11 Santa Elena parishes exist as complete relations (7 in cantón Santa Elena, 1 in La Libertad, 3 in Salinas). **INEC DPA is rejected** — its shapefile carries no license at all (unfilled FGDC template placeholders, a "términos y condiciones" link that resolves to INEC's personal-data privacy policy, and a published scope restricted to internal field operations); CONALI (the actual boundary owner) requires express authorization, IGM doesn't publish parish boundaries, and GADM is non-commercial-only. Full rationale in design.md D0. |
| License | **ODbL 1.0** — explicitly permits redistribution and derivative/produced databases, with attribution + share-alike obligations on the derived database. **Open question, not resolved here**: whether a NOTICE/attribution file next to the committed GeoJSON satisfies share-alike, or whether the obligation reaches further into the repo — this is the operator's legal call (design.md D0), and it is the actual blocker on C.1, not source availability. |
| Extraction | Overpass API query for `admin_level=8` within `area["ISO3166-2"="EC-SE"]` (recommended — lighter than a full-country download for 11 relations), or Geofabrik `ecuador-latest.osm.pbf` (~113 MB) filtered with `osmium`/`osmosis`. OSM ships WGS84 natively, so **no reprojection step** — unlike the INEC path this replaces. Output must be promoted to MultiPolygon (`-nlt PROMOTE_TO_MULTI` or `ST_Multi` downstream, per design.md D0/D3). |
| Committed artifact | `database/data/santa-elena-parroquias.geojson` (keyed by code, matching `ecuador-locations-geom.json` shape) + `database/data/README.md` with source query, extraction date, ODbL 1.0 license + attribution/share-alike determination, checksum, exact extraction command. Raw `.osm.pbf` / Overpass cache is **not** committed. |
| Code convention | Keep the existing `EC-24-<canton>-<parish>` code unchanged. OSM tags each relation with `municipality_code` in `PP-CC-XX` form (e.g. `24-01-54`), which maps directly onto INEC's historical 6-digit DPA code (`240154`, Manglaralto) — `municipality_code` becomes the cross-reference key, preserved in the generator map + SQL comment. |
| INEC path (dead branch) | Retained only in case written permission is ever obtained from INEC/CONALI: the corrected `ogr2ogr` command (source CRS is actually EPSG:32717, not PSAD56; geometry is `Polygon`, needing `-nlt PROMOTE_TO_MULTI`; the DBF is CP1252 with no `.cpg`, needing `-oo ENCODING=CP1252`) is recorded in design.md D0. Not on the critical path. |

### C.2–C.6 — Implementation
- Generator takes a **second argument** (parroquias file); existing provincia/canton path unchanged. Parroquia UUIDs are **derived deterministically** from `code` (sha1 + fixed namespace → UUID form) instead of a hand-maintained map, so regeneration is stable at ~30 rows.
- Emit `id, name, level, code, parent_id, polygon, active`; `parent_id` resolved via subselect on `geo_zones.code` (not hardcoded UUID) so it survives environments where cantons were seeded differently.
- **Verified against Supabase (2026-08-25)**: `level` and `parent_id` *are* correctly populated — `0013_geo_zones_hierarchy.sql` backfills them by literal UUID for the provincia and the 3 cantones. But `code` is **`NULL` on all 4 rows**: `0035_domain_columns.sql` only adds the column and its partial UNIQUE index, and the 0003 seed predates it. The `chk_geo_zones_level` CHECK already accepts `'parroquia'`, and PostGIS is 3.3 with GEOS — no schema change needed.
- **Consequence**: 0041 must open with a `code` backfill (`EC-24`, `EC-24-01/02/03`) **before** any parroquia INSERT, because `parent_id` is resolved by subselect on `geo_zones.code`. Ordering inside the file is load-bearing.
- Idempotence: `ON CONFLICT (id) DO NOTHING` + partial UNIQUE on `code`. Org: `INSERT ... SELECT ... WHERE NOT EXISTS (name = 'CTE - Santa Elena')`, `zone_id` = subselect on `code='EC-24-01'`, `parent_id` null.
- Rollback: `DELETE FROM organizations WHERE name='CTE - Santa Elena'`, then `DELETE FROM geo_zones WHERE level='parroquia' AND code LIKE 'EC-24-%'`, then null out the backfilled `code` values — same transaction. Fase B grants are **not** touched: they belong to 0039, which has its own rollback.
- Tests: new `backend/test/e2e/t7-geography-orgs-seed.e2e-spec.ts` asserting on **really migrated** data (`TestEnvironment` runs the migration chain), not synthetic `ST_MakeEnvelope` fixtures — R21.3 is only meaningful against real geometry.

### D.1–D.5 — Seeding pipeline
- **Location**: `database/seeds/` (R22.2 is explicit). Plain JS + `pg`, matching `generate-geo-zones-seed.js` — no Nest, no TypeORM: `users.js`, `demo-incidents.js`, `volume-incidents.js`.
- **Idempotence**: demo by `title` with fixed `[DEMO]` prefix + existence check (mirrors `SantaElenaIncidentSeeder`); volume by `[VOL]` prefix + row-count auto-skip; deterministic PRNG (fixed seed) so re-runs produce identical rows. Users idempotent by `email`; password hashing must reuse the backend's hasher, credentials from env with dev-only defaults.
- **Feed rebuild**: new `backend/scripts/rebuild-feed.ts` → `NestFactory.createApplicationContext(AppModule)` → `FeedRecoveryService.rebuildFeed()` → `close()`. In-process by design: the authenticated `POST /admin/feed/rebuild` route is unusable from a script, and reimplementing the Redis write path would duplicate T6 logic.
- **Order**: `db:seed` = users → demo incidents → feed rebuild. `db:seed:mass` = `db:seed` → volume incidents → feed rebuild. Geo/orgs come from migration 0041, **not** from the seed scripts.
- **Guard**: both scripts abort if `NODE_ENV=production` or the target host looks non-local, unless `--force` is passed; documented in `backend/package.json` and `database/MIGRATION_LOG.md`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/data/santa-elena-parroquias.geojson`, `database/data/README.md` | New | Sourced OSM (`admin_level=8`) geometry + provenance |
| `database/seeds/generate-geo-zones-seed.js` | Modified | Parroquia emission, level/code/parent_id |
| `database/seeds/0004_seed_parroquias.generated.sql` | New | Generator output, pasted into 0041 |
| `database/migrations/0041_geography_organizations_seed.sql` | New | `code` backfill → parroquias → CTE org |
| `database/rollback/0041_geography_organizations_seed.DOWN.sql` | New | Symmetric deletes + `code` un-backfill |
| `database/seeds/{users,demo-incidents,volume-incidents}.js` | New | Seeders |
| `backend/scripts/rebuild-feed.ts` | New | Nest app-context feed rebuild |
| `backend/package.json` | Modified | `db:seed`, `db:seed:mass` |
| `backend/test/e2e/t7-geography-orgs-seed.e2e-spec.ts` | New | R21.1–R21.5, R22.1–R22.4 |
| `openspec/changes/infra/t7-database-schema-parity/{tasks,specs}` | Modified | R21 re-anchored 0039→0041, task check-off |

## Timeline & Effort

| Block | Effort | Dependency |
|-------|--------|------------|
| C.1 sourcing + license + conversion | ~1 day (technical extraction is simpler than the former INEC shapefile path — no reprojection, no encoding fix — but the day is now dominated by the operator's ODbL 1.0 share-alike legal determination, not portal/GDAL friction) | **External** (operator's ODbL 1.0 legal determination; the OSM dataset itself is already verified available via Overpass) |
| C.2–C.6 generator, 0041, rollback, E2E | ~1 day | Blocked by C.1 |
| D.1–D.5 seeders, feed rebuild, npm scripts | ~1 day | **Parallel** — independent of C.1 |

Critical path: C.1 → C.2–C.6. D can start immediately.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ODbL 1.0 share-alike scope unclear (NOTICE-file-only vs. repo-wide obligation) | Med | Legal judgment call for the operator, recorded as an explicit open question — not resolved by this proposal; do not commit any GeoJSON until determined (design.md D0) |
| Strict `ST_Within(parroquia, canton)` false on legit boundaries — **certain**, not merely likely: parishes come from OSM, cantons from Ecuador-geoJSON via the immutable `0003` seed | **High** | Resolved in design.md D5: assert `ST_Within(ST_PointOnSurface(parroquia), canton)` (binary, no tolerance — catches mis-parenting exactly) plus an `OVERLAP_MIN` area ratio derived from measurement. A buffer tuned upward until it passes is not a test. Geometry is **never** edited |
| ~~Provincia/canton rows lack `level`/`code`~~ | **Resolved** | Verified against Supabase: `level`/`parent_id` are populated by 0013; only `code` is NULL. 0041 opens with the `code` backfill |
| R21 scenarios in the T7 spec are anchored to "0039", which is the applied permissions migration | High | Re-anchor every R21 scenario to 0041 during sdd-spec; never edit a migration ≤ 0040 |
| 1000-incident volume seed + full feed rebuild slow / Redis payload limits | Med | Batched multi-row INSERTs; measure rebuild time and cap `rebuildFeed(limit)`; `db:seed:mass` is opt-in |
| Geometry file size bloats the repo/migration | Med | Overpass output for 11 relations is typically small; apply a simplification pass only if the committed file exceeds budget; assert file < ~2 MB; 0041 uses `$geojson$` dollar-quoting like the existing generator |
| Volume-incident "realism" (assignments, nested comments, notifications) written directly to Postgres bypasses listeners | Med | Explicitly write `status_history`, `notifications`, comment trees; feed rebuild is the reconciliation step |

## Rollback Plan

1. `database/rollback/0041_geography_organizations_seed.DOWN.sql` removes the org, the parroquias, and the `code` backfill transactionally. Since 0041 is new and unapplied, pre-merge rollback is simply reverting the commit.
2. Seed data: `[DEMO]`/`[VOL]` title prefixes make deletion a single `DELETE FROM incidents WHERE title LIKE '[VOL]%'` (cascades handle children); re-run `rebuild-feed.ts` afterwards.
3. Committed GeoJSON removal is a file revert — no schema coupling.

## Dependencies

- **OpenStreetMap `admin_level=8` extraction** for the 11 Santa Elena parishes (verified available via Overpass; blocking C.2+) plus the operator's **ODbL 1.0 share-alike determination** (design.md D0 — not resolved by this proposal).
- Overpass API access (recommended), or `osmium`/`osmosis` + GDAL for the Geofabrik-extract fallback, for the one-time extraction.
- Migration 0040 (`rename_roles`) executed against Supabase but was never recorded in `schema_migrations`. The next `db:migrate` re-applies it as an idempotent no-op and registers it — this must happen before 0041 is applied anywhere.
- Redis + Postgres reachable for the feed-rebuild step of `db:seed`.

## Success Criteria

- [ ] R21.1–R21.5 pass against a database migrated through 0041 (real polygons, valid hierarchy, containment, org present, re-apply is a no-op).
- [ ] R22.1–R22.4 pass (no `INSERT INTO incidents` in `database/migrations/`, generators under `database/seeds/`, demo seed idempotent, Redis feed consistent with Postgres).
- [ ] `npm run db:seed` from clean → 6 users + ~25 demo incidents + non-empty feed; second run changes zero rows.
- [ ] `npm run db:seed:mass` produces 1000 incidents with lifecycle rows and completes within an agreed time budget.
- [ ] `database/data/README.md` records the Overpass query/source, extraction date, ODbL 1.0 license + attribution/share-alike determination, and reproduction command.

## Next Phase

`sdd-spec` (drill R21/R22 into scenarios + acceptance criteria, re-anchor R21 to 0041, decide the ST_Within tolerance clause) and `sdd-design` (generator/UUID derivation, seeder architecture, feed-rebuild bootstrap) — can run in parallel.
