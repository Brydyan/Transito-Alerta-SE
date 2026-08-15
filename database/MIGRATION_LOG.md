# Migration Log

Per CC3 (Manual Migration Integrity) and design decision "TypeORM
`synchronize: false`, `migrationsRun: false`" — schema changes are NEVER
applied automatically by the application. Every migration in
`database/migrations/` is a plain `.sql` file that a human operator copies
into the Supabase SQL editor (or `psql`) and runs manually, in numeric
order. After running a migration, update its row below (Status, Applied By,
Applied Date, Environment). Never mark a migration `✅ Applied` until it has
actually been run against that environment.

## Log

| ID | Name | Description | Status | Applied By | Applied Date | Environment |
|----|------|-------------|--------|-----------|---------------|-------------|
| 0001 | initial_schema | users, organizations, roles tables + anonymous identity seed row | ⏳ Pending | — | — | — |
| 0002 | add_postgis_and_geo_zones | PostGIS extension, geo_zones table + GIST index, organizations.zone_id FK | ⏳ Pending | — | — | — |
| 0003 | seed_geo_zones | Santa Elena province + 3 cantons (EC-24, EC-24-01/02/03) geo_zones seed data | ⏳ Pending | — | — | — |
| 0004 | incidents | incidents table (Point location, status/priority, zone_id/geofence_matched, GIST index) | ⏳ Pending | — | — | — |
| 0005 | comments | comments table (sanitized content, FK incidents/users) | ⏳ Pending | — | — | — |
| 0006 | users | users profile columns (first/last name, avatar_url, role, organization_id) + user_sessions table | ⏳ Pending | — | — | — |
| 0007 | assignments | assignments table (one active assignment per incident, unique constraint) | ⏳ Pending | — | — | — |
| 0008 | anonymous_read_comments | adds "READ comments" to the anonymous ceiling (product decision: read + contribute, never modify) | ⏳ Pending | — | — | — |

## Status legend

- ⏳ Pending — written, not yet applied to any environment
- ✅ Applied — applied and verified in the environment listed
- ❌ Rolled back — applied then reverted via the matching `database/rollback/*.DOWN.sql`
