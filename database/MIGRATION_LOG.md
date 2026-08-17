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
| 0001 | initial_schema | users, organizations, roles tables + anonymous identity seed row | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0002 | add_postgis_and_geo_zones | PostGIS extension, geo_zones table + GIST index, organizations.zone_id FK | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0003 | seed_geo_zones | Santa Elena province + 3 cantons (EC-24, EC-24-01/02/03) geo_zones seed data | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0004 | incidents | incidents table (Point location, status/priority, zone_id/geofence_matched, GIST index) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0005 | comments | comments table (sanitized content, FK incidents/users) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0006 | users | users profile columns (first/last name, avatar_url, role, organization_id) + user_sessions table | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0007 | assignments | assignments table (one active assignment per incident, unique constraint) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0008 | anonymous_read_comments | adds "READ comments" to the anonymous ceiling (product decision: read + contribute, never modify) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0009 | roles_permissions | roles.permissions jsonb column, permissions catalog table, users.role_id + users.permission_version (pv), seeded 'reporter' role replacing the T1.4 inline stub | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0010 | user_email | adds nullable `users.email` + unique partial index (design D11) — address source for Mail module (T3.5) event-routing recipients | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0011 | notifications | notifications table (user_id FK, incident_id FK, type, message, data jsonb, read bool, created_at + processed_at timestamps) + indexes on (user_id, created_at) and (user_id, read) for list and count queries (T3.3) | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0012 | incident_categories | incident_categories adjacency-list table (uuid PK, self-FK `parent_id` ON DELETE SET NULL) + index; `incidents.category_id` ON DELETE RESTRICT + index; permission catalog rows for the `incident-categories` resource (T3.7) | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0013 | geo_zones_hierarchy | adds `geo_zones.parent_id` self-FK ON DELETE SET NULL and `geo_zones.level` with a CHECK over (provincia, canton, parroquia, zona) + index; backfills the seeded Santa Elena province and its 3 cantons by deterministic UUID; permission catalog rows for the `geo-zones` resource (T3.8). Depends on the 0003 seed having run | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |

## Status legend

- ⏳ Pending — written, not yet applied to any environment
- ✅ Applied — applied and verified in the environment listed
- ❌ Rolled back — applied then reverted via the matching `database/rollback/*.DOWN.sql`

## Entorno local de desarrollo

`docker compose up -d postgres` levanta `postgis/postgis:16-3.4` vacío. Las
mismas migraciones se aplican ahí a mano, en el mismo orden:

```bash
for f in database/migrations/000*.sql; do
  docker exec -i tase-postgres psql -U postgres -d transito_alerta \
    -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

Estado local al 2026-08-15: 0001–0008 aplicadas y verificadas.

El job `migrations` de CI (`.github/workflows/ci.yml`) aplica las 13 en orden
contra un `postgis/postgis:16-3.4` vacío en cada PR, así que un archivo roto se
detecta antes de pegarlo en el editor SQL de Supabase. Verificado el 2026-08-16:
las 13 aplican limpio y el backfill de 0013 deja la provincia como raíz con sus
3 cantones colgando.

Este log rastrea **supabase**. El entorno local se recrea desde cero cuando
haga falta (`docker compose down -v`), así que no lleva registro propio.
