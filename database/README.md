# Database Migrations — Transito Alerta SE

## Policy (CC3 — Manual Migration Integrity)

TypeORM runs with `synchronize: false` and `migrationsRun: false`
(`backend/src/config/database.config.ts`). **No schema change is ever
applied automatically.** Every migration is a plain SQL file, applied
manually by a human in the Supabase SQL editor (or `psql` against the same
connection string). This keeps schema history auditable and reviewable in
git, and avoids ORM auto-sync surprises against a shared/production
database.

## Directory layout

```
database/
├── migrations/    forward migrations, numbered 0001, 0002, ...
├── rollback/       matching *.DOWN.sql for every migration
├── seeds/          seed-data generator scripts (e.g. geo_zones from GeoJSON)
├── MIGRATION_LOG.md  applied/pending status per environment
└── README.md        this file
```

## How to apply a migration

1. Open the Supabase project's SQL editor (or connect via `psql`).
2. Open the next `.sql` file in `database/migrations/` **in numeric order**
   (never skip ahead — later migrations may depend on earlier ones, e.g.
   0002 adds a FK to a table 0001 created).
3. Paste the full file contents and run it. Each file is wrapped in its own
   `BEGIN; ... COMMIT;` transaction.
4. If the file references a companion seed file (e.g. 0002 references
   `database/seeds/0003_seed_geo_zones.generated.sql` / the committed copy
   at `database/migrations/0003_seed_geo_zones.sql`), run that immediately
   after.
5. Verify: run a quick `SELECT` against the new table(s) to confirm rows
   exist / schema matches.
6. Update `database/MIGRATION_LOG.md`: change the row's Status to
   `✅ Applied`, fill in Applied By, Applied Date, and Environment
   (e.g. `staging`, `production`).

## How to roll back

1. Open the matching file in `database/rollback/` (e.g.
   `0002_add_postgis_and_geo_zones.DOWN.sql` for
   `0002_add_postgis_and_geo_zones.sql`).
2. Run rollbacks in **reverse numeric order** (highest migration number
   first) if rolling back more than one.
3. Update `MIGRATION_LOG.md`: change Status to `❌ Rolled back`.

## Regenerating the geo_zones seed

`database/seeds/generate-geo-zones-seed.js` reads
`GeoReporta/backend/database/data/ecuador-locations-geom.json` and emits
`INSERT INTO geo_zones ...` statements for Santa Elena province (`EC-24`)
and its 3 cantons (`EC-24-01/02/03`) using
`ST_SetSRID(ST_GeomFromGeoJSON($geojson$...$geojson$), 4326)`. It is not run
automatically — it is a one-time generator whose output is committed as
`database/seeds/0003_seed_geo_zones.generated.sql` (and mirrored at
`database/migrations/0003_seed_geo_zones.sql` for numeric-order clarity).

```bash
node database/seeds/generate-geo-zones-seed.js \
  GeoReporta/backend/database/data/ecuador-locations-geom.json \
  > database/seeds/0003_seed_geo_zones.generated.sql
```

Re-run only if the source GeoJSON changes; the zone UUIDs are fixed
constants in the script (not regenerated) so re-running is idempotent
(`ON CONFLICT (id) DO NOTHING`).
