# Design: T7.9.C/D — Geography + Organizations Seed & Demo/Volume Seeding

## Technical Approach

Two independent tracks against one immutable-migration rule (nothing ≤ 0040 is edited).

**Fase C** is *data only* — no DDL. `geo_zones` already has `level`, `parent_id`, `code` (0013 + 0035) and `chk_geo_zones_level` already accepts `'parroquia'`. A new `0041_geography_organizations_seed.sql` backfills the four NULL `code` values, inserts ~30 parroquias with deterministic v5 UUIDs, and inserts the single `CTE - Santa Elena` organization. `database/seeds/generate-geo-zones-seed.js` gains a second-arity mode that emits the parroquia block; the existing 1-arg path stays byte-identical so `0003`'s registered checksum can never drift.

**Fase D** is a dependency-free JS seeding pipeline under `database/seeds/` (R22.2) plus one thin Nest script for the Redis feed. No new entities, no TypeORM in the seeders, no new frameworks.

## Architecture Decisions

### D0 — Parish source: OpenStreetMap `admin_level=8`, not INEC DPA

**INEC DPA is rejected — no license exists, not merely unfavourable terms.** Inspecting the actual shapefile and geoportal turned up:
- The shapefile's own embedded FGDC metadata (`nxparroquias.shp.xml`) leaves `<accconst>` and `<useconst>` as unfilled ESRI template placeholder text: "REQUIRED: Restrictions and legal prerequisites for accessing/using the data set." Nobody ever filled them in.
- The geoportal's "términos y condiciones" link resolves to INEC's *personal-data privacy* policy — unrelated to geodata licensing.
- The only scope statement INEC publishes points away from redistribution: the cartography "se emplea únicamente para la ejecución de operativos de campo con fines estadísticos".
- No attribution string exists anywhere in the dataset or portal.

**The fallbacks in the original plan also fail — do not re-explore them:**
- **CONALI**, the actual owner of the boundary lines (a body distinct from INEC's statistical layer), requires "autorización expresa de CONALI" to publish.
- **IGM** does not publish parish boundaries at all — that is CONALI's product.
- **GADM** is academic/non-commercial only; redistribution needs prior permission.

**Choice: OpenStreetMap, `admin_level=8` = parroquia in Ecuador.** Confirmed by an actual Overpass query on `area["ISO3166-2"="EC-SE"]`, not by wiki inference. Hierarchy: 2=country, 4=provincia, 6=cantón, 8=parroquia. All 11 Santa Elena parishes exist as complete `admin_level=8` relations: 7 in cantón Santa Elena, 1 in La Libertad, 3 in Salinas.

**License: ODbL 1.0.** Explicitly permits redistribution and derivative/produced databases, with attribution + share-alike obligations on the derived database.

**Code convention survives unchanged (see D2).** OSM contributors already tag each relation with `municipality_code` in `"PP-CC-XX"` form (e.g. `24-01-54`), which maps directly onto INEC's historical 6-digit DPA code (`240154`, Manglaralto). `municipality_code` becomes the cross-reference key instead of a shapefile `DPA_PARRO` field — the `EC-24-<canton>-<parish>` code itself is untouched by this pivot.

**Extraction — no shapefile, no `-where` on DPA fields, no reprojection** (OSM ships WGS84 natively — EPSG:4326):
1. **Overpass API** query for `admin_level=8` within `area["ISO3166-2"="EC-SE"]`, output GeoJSON. Lighter for 11 relations than a country-wide download. **Recommended.**
2. Geofabrik `ecuador-latest.osm.pbf` (~113 MB) filtered with `osmium`/`osmosis`. Useful as an offline/reproducible fallback if Overpass rate-limits.

The raw Overpass QL text is committed to `database/data/README.md` alongside the result so extraction is reproducible without depending on Overpass's live index.

**Still mandatory regardless of source:** promotion to MultiPolygon. `geo_zones.polygon` is `geometry(MultiPolygon, 4326)`; OSM `admin_level=8` relations commonly export as `Polygon` (or need multipolygon assembly), so `-nlt PROMOTE_TO_MULTI` at extraction time (or `ST_Multi` downstream, per D3) is still required — this gotcha is about Ecuadorian boundary data generally, not specific to INEC.

**Open question — NOT resolved here; this is a legal judgment, not an engineering one.** ODbL's share-alike scope: whether shipping a NOTICE/attribution file alongside the committed GeoJSON is sufficient, or whether the obligation reaches further into the repo. This blocks T7.9.C1 until the operator decides. Nothing downstream assumes an answer either way.

**INEC path retained only as a dead branch** — kept for the record in case written permission is ever obtained from INEC/CONALI. Three corrections found while inspecting the real shapefile apply if that branch is ever revived: source CRS is **EPSG:32717** (not PSAD56 as originally assumed); source geometry is **Polygon**, needing `-nlt PROMOTE_TO_MULTI`; the DBF ships no `.cpg` and is **CP1252**-encoded, needing `-oo ENCODING=CP1252`. The corrected command:
```
ogr2ogr -f GeoJSON \
  -s_srs EPSG:32717 -t_srs EPSG:4326 \
  -oo ENCODING=CP1252 \
  -where "DPA_PROVIN='24'" \
  -nlt PROMOTE_TO_MULTI \
  -simplify 0.0001 \
  santa_elena_parroquias.geojson nxparroquias.shp
```
This is moot unless the license question above is resolved in INEC's favour — it is not on the critical path.

**Containment implication.** The original `1e-4` degree tolerance was derived to match the INEC path's `-simplify 0.0001`. The OSM path above has no simplification step — Overpass/osmium output is full-resolution — so that figure carries no information here and has been dropped. More importantly, parishes now come from OSM while the cantons they are compared against come from Ecuador-geoJSON via the immutable `0003` seed: the comparison is unavoidably cross-source. D5 therefore replaces buffered containment with an interior-point test plus an overlap ratio.

### D1 — Parroquia UUIDs: RFC-4122 v5 derived from `code`

**Choice.** A local `uuidV5(name, ns)` helper in the generator using only `node:crypto`:

```js
const NS_GEO_ZONE = '3f2b1a90-7c6d-5e48-9b21-0a1d4e7c88f1'; // frozen constant, never regenerate
function uuidV5(name, ns) {
  const nsBytes = Buffer.from(ns.replace(/-/g, ''), 'hex');            // 16 bytes
  const h = crypto.createHash('sha1')
    .update(Buffer.concat([nsBytes, Buffer.from(name, 'utf8')])).digest();
  const b = h.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;   // version 5
  b[8] = (b[8] & 0x3f) | 0x80;   // RFC-4122 variant
  const hex = b.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const id = uuidV5(code, NS_GEO_ZONE);   // code = 'EC-24-01-50'
```

**Collision with the existing literals is structurally impossible, not merely improbable.** `8f14e45f-ceea-4c1f-8f2c-0000000000XX` carries version nibble `4` (third group `4c1f`); `uuidV5` forces the same nibble to `5`. Two UUIDs with different version nibbles can never be equal. Duplicate parroquia codes are additionally caught by `uq_geo_zones_code`, and re-runs by `ON CONFLICT (id) DO NOTHING`.

**Alternatives rejected.** Extending the hand-maintained `ZONE_IDS` map (~30 rows, every addition a merge conflict and a chance to typo a UUID); `gen_random_uuid()` (destroys idempotence — a second apply would duplicate every parish); adding the `uuid` npm package (a dependency in a directory that deliberately has none).

### D2 — Code convention `EC-24-<canton>-<parish>`

`EC-24-01-54` = provincia 24, cantón 01, parroquia 54. The convention is unchanged by the OSM pivot (D0): OSM tags each `admin_level=8` relation with a `municipality_code` property in `PP-CC-XX` form (e.g. `24-01-54`), which cross-references INEC's historical 6-digit DPA code (`240154`, Manglaralto) without depending on INEC for anything beyond that numbering scheme. Extends the existing `EC-24` / `EC-24-01` prefix scheme rather than introducing a second vocabulary, and keeps `parent_id` derivable by string prefix. `municipality_code` is preserved twice: as a `municipality_code` property on each GeoJSON feature (native from OSM) and as a trailing `-- municipality_code 24-01-54` comment on each generated INSERT. Rejected: using the bare `municipality_code` as `code` (breaks the `EC-` prefix contract that `0035`'s unique index and any future import/export matching assume).

### D3 — Generator: arity-driven mode, byte-stable legacy path

| Args | Mode | Output |
|------|------|--------|
| 1 | legacy (unchanged code path) | `0003_seed_geo_zones.generated.sql`, byte-identical to the committed file |
| 2 | parroquia | `0004_seed_parroquias.generated.sql`, pasted into 0041 |

In 2-arg mode argv[2] is still read, used only to assert every parish's implied canton code exists in `ZONE_IDS`. A unit test asserts `generate(legacyInput) === readFileSync('0003_seed_geo_zones.generated.sql')` — the guard that keeps 0003's checksum stable. Rejected: a `--mode` flag (changes the documented invocation in the file header) and a second script (duplicates the MultiPolygon/dollar-quoting logic).

**Geometry gotcha.** `geo_zones.polygon` is `geometry(MultiPolygon, 4326)`. OSM `admin_level=8` relations commonly export as single `Polygon` (or need multipolygon assembly from the relation's member ways) — see D0 — so every emitted value is wrapped: `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($geojson$…$geojson$), 4326))`. Invalid rings are **not** repaired in SQL — the E2E asserts `ST_IsValid` and any failure is fixed upstream during extraction (`-nlt PROMOTE_TO_MULTI` / `-makevalid` if the pipeline runs through `ogr2ogr`, or an equivalent validity check on the Overpass output), so the committed artifact and the database always agree.

### D4 — 0041 statement order is load-bearing

```
BEGIN;
-- 1. code backfill, matched by LITERAL UUID (never by name — 0013's lesson:
--    'Santa Elena (Provincia)' and 'Santa Elena (Cantón)' share a prefix)
UPDATE geo_zones SET code='EC-24'    WHERE id='8f14e45f-…-000000000024' AND code IS NULL;
UPDATE geo_zones SET code='EC-24-01' WHERE id='8f14e45f-…-000000000101' AND code IS NULL;   -- 02, 03 idem
-- 2. parroquias — INSERT…SELECT so a missing parent yields ZERO rows, not an FK error
INSERT INTO geo_zones (id,name,level,code,parent_id,polygon,active,created_at,updated_at)
SELECT '<v5>','<name>','parroquia','EC-24-01-54', p.id,
       ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($geojson$…$geojson$),4326)), true, now(), now()
  FROM geo_zones p WHERE p.code='EC-24-01'
ON CONFLICT (id) DO NOTHING;   -- OSM municipality_code 24-01-54 (≈ DPA 240154, Manglaralto)
-- 3. organization
INSERT INTO organizations (id,name,zone_id,parent_id,max_active_claims,created_at,updated_at)
SELECT '<v5 of "CTE - Santa Elena">','CTE - Santa Elena', z.id, NULL, 5, now(), now()
  FROM geo_zones z WHERE z.code='EC-24-01'
   AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.name='CTE - Santa Elena');
COMMIT;
```

Step 1 must precede step 2 because `parent_id` resolves by subselect on `code` (chosen over a hardcoded canton UUID so the migration survives an environment seeded differently). The org's legal name *Comisión de Tránsito del Ecuador - Santa Elena* is recorded in a header comment; the `name` column carries the short form the rollback predicate and every UI list key on. `parent_id` NULL, `incident_category_id` NULL (transversal).

### D5 — Parish-in-canton: interior point + overlap ratio, not buffered containment

Geometry is **never** edited to force containment — `GeofencingService` runs `ST_Contains` on these exact rows at runtime, so a nudged polygon is a production bug, not a test fix.

**Rejected: `ST_CoveredBy(p, ST_Buffer(c, eps))`.** Parishes come from OSM (D0); the cantons they are compared against come from Ecuador-geoJSON via the immutable `0003` seed. Two sources, two generalizations, two vintages — the buffer needed to absorb that mismatch would have to grow until the assertion stops discriminating between "generalized edge" and "wrong canton". A test whose tolerance is tuned upward until it passes has stopped being a test.

**Adopted: two assertions that separate the two failure modes.**

1. `ST_Within(ST_PointOnSurface(p.polygon), c.polygon)` — **binary, zero tolerance.** An interior point of a parish cannot land in a *different* canton because of edge generalization; only a genuinely mis-parented row does that. This is the defect R21.3 exists to catch, and it is caught exactly. `ST_PointOnSurface` rather than `ST_Centroid`: the centroid of a concave polygon can fall outside the polygon itself.
2. `ST_Area(ST_Intersection(p.polygon, c.polygon)) / ST_Area(p.polygon) >= OVERLAP_MIN` — catches gross geometry corruption (a parish loaded at the wrong scale or offset) while staying immune to millimetre-level border disagreement between sources.

This is the same primitive GeoReporta's `LocationGeomConsistentRule` uses — point-in-polygon, not polygon-in-polygon — and it inherits that rule's stance: fail only on proof, stay silent otherwise.

Measurement (run once, output recorded in `database/data/README.md`):

```sql
SELECT p.code,
       ST_Within(ST_PointOnSurface(p.polygon), c.polygon)             AS parent_ok,
       ST_Area(ST_Intersection(p.polygon, c.polygon)) / ST_Area(p.polygon)
                                                                      AS overlap_ratio
FROM geo_zones p JOIN geo_zones c ON c.code = split_part(p.code,'-',1)||'-'||split_part(p.code,'-',2)||'-'||split_part(p.code,'-',3)
WHERE p.level='parroquia'
ORDER BY overlap_ratio;
```

The test expresses the contract through one exported constant:

```ts
export const OVERLAP_MIN = 0.75; // medido 2026-08-25; mínimo observado 0.8058
```

`parent_ok` must be `true` for every row with no constant involved — it is not tunable, and a `false` there is a mis-parented parish, full stop.

**Measured 2026-08-25** against the real OSM parishes and the `0003` canton polygons; full table in `database/data/README.md`. Results:

- `parent_ok` — **true on all 11**.
- `strict_within` — **false on all 11**. The original `ST_Within(parroquia, canton)` formulation would have failed every single row. Cross-source incompatibility was not a risk, it was a certainty.
- `overlap_ratio` — ranges 0.8058 (Anconcito) to 0.9993. `OVERLAP_MIN = 0.75` sits below the observed minimum with deliberate margin. The low outliers are coastal parishes where the two sources clip the shoreline differently — a generalization artifact, confirmed by `parent_ok` passing on both.

**Negative control**: GeoReporta's `EcuadorLocationSeeder` places Anconcito under cantón Santa Elena; it belongs to Salinas. The assertion rejects that pairing (`parent_ok = false`) and accepts the correct one. The test catches a real, pre-existing defect.

### D6 — Rollback `0041_…DOWN.sql`

Reverse order, one transaction, with a loud guard instead of a silent cascade:

```sql
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users u JOIN organizations o ON u.organization_id=o.id
              WHERE o.name='CTE - Santa Elena') THEN
    RAISE EXCEPTION 'Seeded users still reference CTE - Santa Elena; run the seed teardown first';
  END IF;
END $$;
DELETE FROM organizations WHERE name = 'CTE - Santa Elena';
DELETE FROM geo_zones WHERE level='parroquia' AND code LIKE 'EC-24-__-__';
UPDATE geo_zones SET code = NULL WHERE code IN ('EC-24','EC-24-01','EC-24-02','EC-24-03');
COMMIT;
-- Deliberately does NOT touch roles.permissions: the notifications grants belong
-- to 0039 and have their own DOWN file.
```

`code LIKE 'EC-24-__-__'` (not `'EC-24-%'`, which also matches the cantons) plus the `level` filter is a belt-and-braces pair. The runner (`run-migrations.ts --down`) already wraps each DOWN in BEGIN/COMMIT and deletes the `schema_migrations` row; the inner BEGIN is for humans pasting into the SQL editor.

**Prerequisite:** 0040 was executed but never registered. `db:migrate` must register it before 0041 is applied anywhere, or the checksum chain is inconsistent.

### D7 — Seeders reach the backend's `pg` and `bcrypt` via `createRequire` (the sharp coupling)

There is **no root `package.json`**; `pg` and `bcrypt` live only in `backend/node_modules` (pnpm). Node resolves `require()` from the *importing file's* directory, so a bare `require('pg')` inside `database/seeds/users.js` fails regardless of cwd. Shared `database/seeds/lib/deps.js`:

```js
const { createRequire } = require('module');
const backendRequire = createRequire(require('path').resolve(__dirname, '../../../backend/package.json'));
module.exports = { Client: backendRequire('pg').Client, bcrypt: backendRequire('bcrypt') };
```

This is not merely convenient — it is *correct*. `AuthService.loginWithPassword` verifies with `bcrypt.compare(plain, user.password_hash)`, and bcrypt reads algorithm, cost and salt **out of the hash itself**. Using the backend's own `bcrypt` build guarantees a `$2b$` hash it will accept. Cost is taken from `BCRYPT_COST` (default `12`) purely so seeded hashes are indistinguishable from `PasswordHasher`'s. `password_hash` is `char(60)` and bcrypt output is exactly 60 chars, so CHAR padding never occurs.

| Alternative | Rejected because |
|---|---|
| Root `package.json` with its own deps | Two native bcrypt builds, version drift, contradicts `working_dir: backend` |
| `NODE_PATH=../backend/node_modules` in the npm script | Legacy/deprecated resolver hook; breaks when a human runs `node database/seeds/users.js` directly |
| Precomputed hash literal in the file | A credential in git; drifts the moment `BCRYPT_COST` or the library changes; password becomes un-rotatable |
| Boot Nest to obtain `PasswordHasher` | Violates R22.2 (plain generators in `database/seeds/`); drags TypeORM + Redis + the whole DI graph in for one function |

Login preconditions the users seeder must satisfy: `email` set, `password_hash` set, `is_active = true`, `deleted_at IS NULL`, and **both** `role_id` (FK to post-0040 `roles.name`) and the legacy `role` varchar set to the same string. Plaintext from `SEED_PASSWORD`, dev default documented in `database/data/README.md`.

**Users (6):** 1 `master`, 1 `operador_sistema` (both `organization_id` NULL), 2 `admin_org` + 2 `operador_org` (all four → `CTE - Santa Elena`). Idempotent on `email` via `ON CONFLICT (email) DO NOTHING`.

### D8 — Determinism: seeded PRNG + derived row IDs

One inline `mulberry32(0x20260825)` instance, drawn in a fixed traversal order — no `Math.random`, no `Date.now`, no `gen_random_uuid()` anywhere in the seeders. Timestamps are computed as offsets from a frozen `EPOCH` constant. Row IDs reuse D1's helper: `uuidV5('vol/incident/' + i, NS_SEED)`. This gives two independent idempotence mechanisms — `ON CONFLICT (id) DO NOTHING` for the writes, and the `[DEMO]` / `[VOL]` title prefixes for human-driven deletion — instead of relying on title matching alone.

### D9 — What the volume seeder must write by hand

Bulk `INSERT`s bypass every Nest listener. `status_history` is an **application listener, not a Postgres trigger** (locked decision, T3.4), so nothing is reconstructed for free. Every row below is written explicitly, in this order, in batches of 250 via multi-row `INSERT`:

| Normally produced by | Seeder must write | Constraint that bites |
|---|---|---|
| `GeofencingService.resolveZone` | `zone_id`, `organization_id`, `geofence_matched` | resolved in SQL from `ST_Contains(gz.polygon, point)` ordered parroquia → cantón → provincia; outside all zones ⇒ `zone_id` NULL, `geofence_matched` false, status stays `pending` |
| `StatusHistoryListener` | one `status_history` row per transition | `chk_status_history_transition` (previous ≠ new) and — the gotcha — `chk_status_history_new_status` allows only `pending/in_progress/resolved`. **The approve step to `closed` writes NO history row.** `event_id` = `vol/<i>/<n>` (unique, deterministic) |
| `AssignmentsService.claim` | `assignments` row + `claimed_by`, `claimed_at`, `assigned_to` | `uq_assignments_incident` — exactly one assignment per incident |
| T5.6 approve/reject | `approved_by`+`approved_at` **or** `rejected_by`+`rejected_at`+`rejection_reason` | pair CHECKs and the XOR CHECK — never both sides on one row |
| resolve | `resolution_date` | set iff status ∈ {`resolved`, `closed`} |
| `NotificationsService` | `notifications` rows | `valid_type` CHECK: only `incident.created`, `incident.assigned`, `incident.status_changed`, `comment.added`, `incident_pending_approval` (0022) |
| `CommentsService.create` | `comments` tree | depth ≤ 2 is **application-only** (no DB constraint) — the generator caps `parent_id` chains at 2 in JS |
| feed cache write | nothing | reconciled by `rebuild-feed.ts` (D10) |

`created_at` / `updated_at` are written explicitly on every table. Status mix mirrors `MassIncidentSeeder`: `pending` ⇒ no assignment/claim/resolution; `in_progress` ⇒ assignment + claim; `resolved` ⇒ + `resolution_date` + pending-approval notification; `closed` ⇒ + approval pair.

### D10 — `rebuild-feed.ts`: in-process application context

`NestFactory.createApplicationContext(AppModule)` → `app.get(FeedRecoveryService).rebuildFeed(limit)` → `await app.close()`. `createApplicationContext` (not `create`) binds no HTTP port; `close()` releases the Redis and TypeORM handles so the process exits 0 without a dangling event loop. Run via `ts-node`, matching `db:migrate`.

**Rejected: `POST /admin/feed/rebuild`** — it sits behind `JwtAuthGuard` + `PermissionGuard`, so a seed script would have to mint or store a privileged token (a credential problem for a dev tool), and it requires a running server, which seeding does not. **Rejected: reimplementing the Redis write** — it would duplicate `FeedItemDto` mapping, `CITIZEN_FEED_KEY` and the 3 600 000 ms TTL from T6 and drift silently.

**Cost bound.** `rebuildFeed` defaults to `LIMIT 200`: one query with three LEFT JOINs, then one `cache.set` of ~200 items. 1000 incidents therefore do **not** make the rebuild 5× more expensive — the feed is a recency window, not a mirror. Budget < 2 s wall clock, dominated by Nest bootstrap (~1–3 s), not the query. `--limit 1000` would push a single ~600 KB Redis value; the default stays 200 and the README says why.

### D11 — Safety guard

Shared `database/seeds/lib/guard.js`, called first in every seeder and in `rebuild-feed.ts`:

1. `NODE_ENV === 'production'` ⇒ abort. `--force` alone does not lift this; it additionally requires `SEED_ALLOW_PRODUCTION=1`. Two independent gates, because `--force` gets typed reflexively.
2. Host parsed from `DATABASE_URL` (fallback `DB_HOST`) must match `localhost | 127.* | ::1 | 0.0.0.0 | *.local | host.docker.internal`. Anything else — notably `*.supabase.co` — aborts unless `--force`.
3. On abort, print the resolved host and exit 1.

### D12 — npm scripts (in `backend/package.json`, cwd = `backend/`)

```json
"db:seed":      "node ../database/seeds/users.js && node ../database/seeds/demo-incidents.js && ts-node scripts/rebuild-feed.ts",
"db:seed:mass": "npm run db:seed && node ../database/seeds/volume-incidents.js && ts-node scripts/rebuild-feed.ts"
```

Geography and the organization come from migration 0041, never from a seed script (R22.1: no `INSERT INTO incidents` in `database/migrations/`, and symmetrically no reference geography in `database/seeds/*.js`).

## Data Flow — seeding pipeline

```
 operator            npm            seeds/*.js         Postgres        rebuild-feed.ts      Redis
    │                 │                  │                 │                  │              │
    │ npm run db:seed │                  │                 │                  │              │
    ├────────────────>│                  │                 │                  │              │
    │                 │ node users.js    │                 │                  │              │
    │                 ├─────────────────>│                 │                  │              │
    │                 │                  │ guard(env,host) │                  │              │
    │                 │                  │ createRequire → backend/node_modules (pg, bcrypt) │
    │                 │                  │ bcrypt.hash(SEED_PASSWORD, cost=12)               │
    │                 │                  │ INSERT users … ON CONFLICT (email) DO NOTHING     │
    │                 │                  ├────────────────>│                  │              │
    │                 │ node demo-incidents.js             │                  │              │
    │                 ├─────────────────>│                 │                  │              │
    │                 │                  │ mulberry32(SEED); uuidV5('demo/…') │              │
    │                 │                  │ SELECT zone via ST_Contains (0041 rows)           │
    │                 │                  │ INSERT incidents + status_history + notifications │
    │                 │                  ├────────────────>│                  │              │
    │                 │ ts-node scripts/rebuild-feed.ts    │                  │              │
    │                 ├───────────────────────────────────────────────────────>│             │
    │                 │                  │                 │ createApplicationContext(AppModule)
    │                 │                  │                 │<─ SELECT … LIMIT 200 ─┤         │
    │                 │                  │                 │                  │ cache.del + cache.set
    │                 │                  │                 │                  ├────────────>│
    │                 │                  │                 │                  │ app.close() │
    │<── exit 0 ──────┤                  │                 │                  │              │
```

`db:seed:mass` inserts `node volume-incidents.js` (1000 incidents, batches of 250, full lifecycle rows per D9) between the demo step and a second feed rebuild.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `database/data/santa-elena-parroquias.geojson` | Create (human) | OSM `admin_level=8` extraction (Overpass or Geofabrik+osmium), EPSG:4326 native (no reprojection), keyed by `code`, `municipality_code` property retained for INEC DPA cross-reference |
| `database/data/README.md` | Create | Source query/URL, extraction date, ODbL 1.0 license + attribution/share-alike determination, checksum, exact extraction command, containment measurement output, `SEED_PASSWORD` default |
| `database/seeds/generate-geo-zones-seed.js` | Modify | Arity-2 parroquia mode, `uuidV5`, `ST_Multi` wrap; 1-arg path byte-stable |
| `database/seeds/0004_seed_parroquias.generated.sql` | Create | Generator output, pasted into 0041 |
| `database/migrations/0041_geography_organizations_seed.sql` | Create | `code` backfill → parroquias → `CTE - Santa Elena` (D4) |
| `database/rollback/0041_geography_organizations_seed.DOWN.sql` | Create | Guarded reverse deletes + `code` un-backfill (D6) |
| `database/seeds/lib/deps.js` | Create | `createRequire` bridge to `backend/node_modules` (D7) |
| `database/seeds/lib/guard.js` | Create | env/host safety gate (D11) |
| `database/seeds/lib/rand.js` | Create | `mulberry32` + `uuidV5` shared with the generator (D8) |
| `database/seeds/users.js` | Create | 6 users, bcrypt, idempotent on `email` |
| `database/seeds/demo-incidents.js` | Create | ~25 `[DEMO]` incidents |
| `database/seeds/volume-incidents.js` | Create | 1000 `[VOL]` incidents + lifecycle rows |
| `backend/scripts/rebuild-feed.ts` | Create | Nest application context → `rebuildFeed()` (D10) |
| `backend/package.json` | Modify | `db:seed`, `db:seed:mass` |
| `backend/test/e2e/t7-geography-orgs-seed.e2e-spec.ts` | Create | R21.1–R21.5, R22.1–R22.4 |
| `backend/test/unit/generate-geo-zones-seed.spec.ts` | Create | 0003 byte-stability + `uuidV5` vectors |
| `openspec/changes/infra/t7-database-schema-parity/{tasks,specs}` | Modify | R21 re-anchored 0039 → 0041 |

## Interfaces / Contracts

No new entities, no TypeORM decorator changes. `GeoZoneEntity` and `OrganizationEntity` already expose `level`, `parentId`, `code`, `zoneId` — Fase C only populates rows those columns already model.

**Redis:** unchanged. Single key `feed:incidents`, value = `FeedItemDto[]`, TTL 3 600 000 ms, written only by `FeedRecoveryService`.

**Seeder module contract** (each of the three exports the same shape, so a future `db:seed:reset` can compose them):

```js
module.exports = { name: 'users', async run(client, { force, seed }) { /* → { inserted, skipped } */ } };
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | 0003 byte-stability; `uuidV5` version nibble = `5`; `mulberry32` reproducibility; guard host allowlist | Jest, no DB |
| Integration | 0041 applies, re-applies as a no-op, and its DOWN restores the pre-state exactly | `TestEnvironment` runs the real migration chain (never `ST_MakeEnvelope` fixtures — R21.3 is only meaningful against real geometry) |
| E2E | R21.1–R21.5: parroquia count/level/`parent_id`/`code`, `ST_IsValid`, containment per D5, org present with `zone_id` = `EC-24-01` | `backend/test/e2e/t7-geography-orgs-seed.e2e-spec.ts` |
| E2E | R22.1–R22.4: no `INSERT INTO incidents` in `database/migrations/`; generators live in `database/seeds/`; `db:seed` twice ⇒ zero row delta; Redis feed matches Postgres | Same spec; second run asserted by row-count snapshot |
| Manual | `db:seed:mass` wall clock and rebuild time recorded in `database/data/README.md` | Operator, local only |

Strict TDD is active: every assertion above is written before the file it exercises.

## Migration / Rollout

1. Register 0040 in `schema_migrations` (`npm run db:migrate`) — **blocking prerequisite**.
2. Human applies 0041 via the Supabase SQL editor (CC3), then records version + SHA-256 in `schema_migrations`.
3. `npm run db:migrate` must report `✅ All checksums valid`.
4. Seeders are local-only; the D11 guard is the enforcement, not convention.

## Open Questions

- [ ] `organizations.name` — short `CTE - Santa Elena` (assumed here; the rollback predicate and UI lists key on it) vs the full legal name. Operator confirmation.
- [x] ~~Final `OVERLAP_MIN`~~ — **resolved 2026-08-25**: `0.75`, from a measured minimum of 0.8058. See D5 and `database/data/README.md`.
- [ ] **ODbL 1.0 share-alike scope** — whether shipping a NOTICE/attribution file alongside the committed GeoJSON satisfies the derived-database obligation, or whether it reaches further into the repo. This is a legal judgment for the operator, **not resolved by this design** (see D0). Blocks T7.9.C1.
