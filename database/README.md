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

## Conexión a la base de datos

### Opción 1: Supabase (recomendado para dev/staging/prod — sin instalar nada)

**Ventajas**: cloud-managed, backups automáticos, sin instalar PostgreSQL localmente, acceso desde cualquier máquina.

1. Abre https://supabase.com → tu proyecto
2. SQL Editor → pega y ejecuta los `.sql` files
3. O usa `psql` remoto (ver más abajo)

No requiere Docker ni instalación local de PostgreSQL.

### Conexión manual a Supabase (vía UI o CLI)

1. Abre el proyecto Supabase en https://supabase.com
2. En la pestaña "SQL Editor", pega el contenido del archivo `.sql` que deseas ejecutar
3. Haz clic en "Run" o presiona `Ctrl+Enter`

Alternativamente, conéctate vía `psql` con la connection string de Supabase:

```bash
# Obtén la connection string desde Supabase:
# Dashboard → Settings → Database → Connection string

psql "postgresql://[user]:[password]@[host]:[port]/[database]"
```

Luego ejecuta un archivo:

```bash
psql "postgresql://..." -f database/migrations/0001_initial_schema.sql
```

O ejecuta todas las migraciones en orden:

```bash
for f in database/migrations/000*.sql; do
  psql "postgresql://..." -f "$f" || break
done
```

### Opción 2: PostgreSQL local (sin Docker)

**Ventajas**: control total, offline, no depende de internet.

#### Instalación

**macOS** (con Homebrew):
```bash
brew install postgresql@16 postgis
brew services start postgresql@16
```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install postgresql-16 postgresql-contrib-16 postgresql-16-postgis-3
sudo systemctl start postgresql
```

**Windows**:
1. Descarga PostgreSQL 16 desde https://www.postgresql.org/download/windows/
2. En el instalador, marca "PostGIS" como extension
3. Nota usuario/contraseña que estableces (default: `postgres` / `postgres`)

#### Crear base de datos y usuario

```bash
# Conéctate como postgres
psql -U postgres

# En la sesión psql:
CREATE DATABASE transito_alerta;
CREATE USER transito_user WITH PASSWORD 'transito_password';
GRANT ALL PRIVILEGES ON DATABASE transito_alerta TO transito_user;

# Habilitar PostGIS
\c transito_alerta
CREATE EXTENSION postgis;
CREATE EXTENSION postgis_topology;

# Salir
\q
```

#### Aplicar migraciones

```bash
# Aplica todas en orden
for f in database/migrations/000*.sql; do
  psql -U transito_user -d transito_alerta -f "$f" || break
done
```

O una por una:

```bash
psql -U transito_user -d transito_alerta -f database/migrations/0001_initial_schema.sql
```

#### Conectar interactivamente

```bash
psql -U transito_user -d transito_alerta
```

Luego:

```sql
SELECT * FROM users;
SELECT COUNT(*) FROM incidents;
\q
```

### Opción 3: PostgreSQL con Docker (desarrollo local)

#### 1. Levantar el contenedor PostgreSQL + PostGIS

```bash
docker compose up -d postgres
```

Esto levanta `postgis/postgis:16-3.4` con las siguientes credenciales (definidas en `docker-compose.yml`):
- **User**: `postgres`
- **Password**: `postgres`
- **Database**: `transito_alerta`
- **Port**: `5432`

#### 2. Aplicar migraciones locales

```bash
# Aplicar todas las migraciones en orden
for f in database/migrations/000*.sql; do
  docker exec -i tase-postgres psql -U postgres -d transito_alerta \
    -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

O aplica una migración individual:

```bash
docker exec -i tase-postgres psql -U postgres -d transito_alerta \
  < database/migrations/0001_initial_schema.sql
```

#### 3. Conectar directamente al contenedor

```bash
# Abre una sesión interactiva psql
docker exec -it tase-postgres psql -U postgres -d transito_alerta
```

Luego puedes ejecutar queries SQL directamente:

```sql
SELECT * FROM users LIMIT 10;
SELECT COUNT(*) FROM incidents;
```

#### 4. Rollback local

```bash
# Revierte una migración
docker exec -i tase-postgres psql -U postgres -d transito_alerta \
  < database/rollback/0041_geography_organizations_seed.DOWN.sql
```

#### 5. Resetear la base de datos (borrar todo)

```bash
docker compose down -v postgres
docker compose up -d postgres
```

Nota: el flag `-v` elimina el volumen, borrando todos los datos.

### Variables de entorno

El archivo `backend/.env` debe contener la connection string según tu setup:

```bash
# Opción 1: Supabase (cloud)
DATABASE_URL="postgresql://[user]:[password]@[host]:[port]/[database]"

# Opción 2: PostgreSQL local (native install)
DATABASE_URL="postgresql://transito_user:transito_password@localhost:5432/transito_alerta"

# Opción 3: Docker local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/transito_alerta"
```

Para obtener la connection string de Supabase:
1. Dashboard → Settings → Database → Connection string
2. Copia la URL y reemplaza `[password]` con tu contraseña real

### CI (GitHub Actions)

El job `migrations` en `.github/workflows/ci.yml` levanta un contenedor
`postgis/postgis:16-3.4` en cada PR y aplica todas las migraciones en orden.
Si alguna falla, la PR queda roja sin pasar a Supabase manualmente.
