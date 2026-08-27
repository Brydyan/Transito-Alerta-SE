# Runbook — Aplicación manual de `0041_geography_organizations_seed.sql`

> **Para**: Operador de Supabase (T7.9.Z5, 2026-08-26)
> **Cambio**: `openspec/changes/infra/t7-geography-organizations-seed`
> **Migración**: `database/migrations/0041_geography_organizations_seed.sql`
> **Rollback**: `database/rollback/0041_geography_organizations_seed.DOWN.sql`
> **Tipo**: Seed + backfill DML (no DDL). **Load-bearing order** — no
> reordenar (ver `t7-geography-organizations-seed/design.md D4`).

## Prerrequisito bloqueante

> ⚠️ **`0040_rename_roles` DEBE estar registrada en `schema_migrations`**
> antes de aplicar 0041. La fila 0040 de `database/MIGRATION_LOG.md`
> está marcada como `⚠️ Ejecutada en Supabase, sin registrar`. Si tu
> ambiente es el de Supabase prod, **primero**:

```sql
-- 1. Confirmar que 0040 está aplicada en schema_migrations
SELECT version, name, applied_at
  FROM schema_migrations
 WHERE version IN ('0040', '0041')
 ORDER BY version;

-- Esperado (antes de 0041): la fila 0040 está, 0041 no.
-- Si 0040 falta, ejecutar el script de registro de backfill
-- (ver `docs/runbooks/deploy.md` § paso 2 + el archivo
-- `database/migrations/0040_rename_roles.sql` que es idempotente
-- vía `UPDATE … WHERE name = 'admin_sistema'`).
```

Si 0040 todavía no figura en `schema_migrations`, **NO aplicar 0041**.
Re-aplicar 0040 es un no-op idempotente (UPDATE con WHERE), así que
sólo se necesita un INSERT en `schema_migrations` si la migración ya
está físicamente aplicada.

## Aplicación

### 1. Pre-flight local (sandbox)

Antes de tocar Supabase prod, correr el e2e del change
(`t7-geography-orgs-seed.e2e-spec.ts`) contra una base fresca con
0001–0040 aplicadas — confirma que la cadena de migraciones sigue
verde y que el DOWN funciona:

```bash
cd backend/
./node_modules/.bin/jest --config ./test/jest-e2e.json \
  --testPathPattern "t7-geography-orgs-seed" 2>&1 | tail -15
# Esperado: 10/10 passing (6 R21 + 4 rollback cycle)
```

### 2. Pre-flight Supabase

Pegar y ejecutar este query para confirmar el estado de partida:

```sql
SELECT
  (SELECT count(*) FROM geo_zones)                                  AS geo_zones_total,
  (SELECT count(*) FROM geo_zones WHERE code IS NOT NULL)           AS geo_zones_with_code,
  (SELECT count(*) FROM organizations)                              AS organizations_total,
  (SELECT count(*) FROM schema_migrations WHERE version = '0040')  AS has_0040,
  (SELECT count(*) FROM schema_migrations WHERE version = '0041')  AS has_0041;
```

Estado esperado antes de 0041:

| Columna | Valor esperado | Si NO coincide |
|---------|----------------|----------------|
| `geo_zones_total` | 4 (provincia + 3 cantones) | alguna migración 0001–0013 falló |
| `geo_zones_with_code` | 0 | nadie aplicó el backfill todavía (OK, lo hace 0041) |
| `organizations_total` | 0 | igual |
| `has_0040` | 1 | aplicar 0040 primero |
| `has_0041` | 0 | si es 1, 0041 ya está aplicada — skip |

### 3. Aplicar 0041

1. Abrir Supabase → **SQL Editor**
2. Copiar el contenido de `database/migrations/0041_geography_organizations_seed.sql`
3. **Ejecutar la consulta completa** (BEGIN … COMMIT incluidos — el
   archivo es un único bloque transaccional)
4. Tiempo esperado: 1–3 segundos (las 11 parroquias insertan geometrías
   reales MultiPolygon en EPSG:4326)

### 4. Checkpoints post-aplicación (verificación)

Ejecutar el siguiente bloque inmediatamente después de aplicar — **debe
dar exactamente estos conteos** (los 11 parroquias se distribuyen
desigualmente entre los 3 cantones):

```sql
-- (a) Backfill de `code` en las 4 filas preexistentes (R21.0)
SELECT id, name, code FROM geo_zones ORDER BY code;
-- Esperado: 4 filas, codes 'EC-24', 'EC-24-01', 'EC-24-02', 'EC-24-03'
--           y code IS NULL para 0 filas.

-- (b) Conteo de parroquias por cantón (R21.1)
SELECT split_part(p.code, '-', 1) || '-' || split_part(p.code, '-', 2) || '-' || split_part(p.code, '-', 3) AS canton_code,
       count(z.id) AS parroquia_count
  FROM geo_zones p
  LEFT JOIN geo_zones z ON z.parent_id = p.id AND z.level = 'parroquia'
 WHERE p.code IN ('EC-24-01', 'EC-24-02', 'EC-24-03')
 GROUP BY canton_code
 ORDER BY canton_code;
-- Esperado (medido 2026-08-26, puede variar si el operador re-corta
-- el dataset OSM pero la proporción se mantiene):
--   EC-24-01: 7 parroquias (Santa Elena cantón)
--   EC-24-02: 1 parroquia  (La Libertad)
--   EC-24-03: 3 parroquias (Salinas)
-- Total: 11 parroquias. NO debe haber cantón con 0 parroquias.

-- (c) Forma corta de la organización (R21.4)
SELECT id, name, parent_id,
       (SELECT code FROM geo_zones WHERE id = o.zone_id) AS zone_code
  FROM organizations o
 WHERE name = 'CTE - Santa Elena';
-- Esperado: exactamente 1 fila, parent_id NULL, zone_code = 'EC-24-01'.

-- (d) Conteo final (R21.5)
SELECT (SELECT count(*) FROM geo_zones WHERE level = 'parroquia')        AS parroquias,
       (SELECT count(*) FROM geo_zones)                                  AS total_zones,
       (SELECT count(*) FROM organizations WHERE name LIKE 'CTE - %')    AS orgs_cte;
-- Esperado: parroquias = 11, total_zones = 15, orgs_cte = 1.

-- (e) Pertenencia geométrica (R21.3, no estricto)
SELECT p.code, c.code AS canton_code,
       ST_Within(ST_PointOnSurface(p.polygon), c.polygon) AS parent_ok
  FROM geo_zones p
  JOIN geo_zones c ON c.id = p.parent_id
 WHERE p.level = 'parroquia'
   AND NOT ST_Within(ST_PointOnSurface(p.polygon), c.polygon);
-- Esperado: 0 filas. parent_ok debe ser true en las 11.
```

### 5. Idempotencia — segundo run

Re-aplicar 0041 es un no-op (cada fila es `ON CONFLICT (id) DO NOTHING`
o un `UPDATE … WHERE code IS NULL`). El segundo run no debe cambiar
ningún conteo:

```sql
-- 5.1 Capturar antes
SELECT count(*) AS geo FROM geo_zones
 UNION ALL
SELECT count(*) AS org FROM organizations;

-- 5.2 Pegar y ejecutar 0041 otra vez
-- 5.3 Capturar después
SELECT count(*) AS geo FROM geo_zones
 UNION ALL
SELECT count(*) AS org FROM organizations;
-- Esperado: idénticos.
```

### 6. Registrar 0041 en `schema_migrations`

```sql
INSERT INTO schema_migrations (version, name, checksum, applied_at)
VALUES (
  '0041',
  'geography_organizations_seed',
  encode(digest(
    convert_to(pg_read_server_files('/dev/null'), 'UTF8'),
    'sha256'
  ), 'hex'),
  now()
)
ON CONFLICT (version) DO NOTHING;

-- ⚠️ El `checksum` arriba es un placeholder — el operador DEBE
-- calcular el SHA-256 real del archivo pegado:
--   sha256sum database/migrations/0041_geography_organizations_seed.sql
-- y reemplazar el encode() con un literal hex. Sin esto, `db:migrate`
-- no podrá validar drift.
```

### 7. Cerrar el cambio en `database/MIGRATION_LOG.md`

Editar la fila `0041` del log: cambiar el status de `⏳ Pending` a
`✅ Applied` y completar `Applied By`, `Applied Date`, `Environment`:

```
| 0041 | geography_organizations_seed | ... | ✅ Applied | <operador> | 2026-08-26 | supabase |
```

Commitear el `MIGRATION_LOG.md` con un mensaje tipo
`docs(log): mark 0041 geography_organizations_seed applied on supabase`.

## Rollback (emergencia)

Sólo si algo va mal y la base quedó en un estado inconsistente.
**NO correr el rollback si hay usuarios `users.organization_id`
apuntando a la organización `CTE - Santa Elena`** — la guarda ruidosa
del archivo DOWN aborta con un mensaje explícito en ese caso (es el
comportamiento correcto: hay que correr primero el teardown de
usuarios, no se hace rollback ciego).

```bash
# 1. Verificar que nadie referencia la org
SELECT count(*)
  FROM users u JOIN organizations o ON u.organization_id = o.id
 WHERE o.name = 'CTE - Santa Elena';
# Esperado para rollback: 0. Si > 0, primero limpiar usuarios.

# 2. Pegar el contenido de
#    database/rollback/0041_geography_organizations_seed.DOWN.sql
#    en el SQL editor. Una transacción, orden inverso, con guarda
#    ruidosa.

# 3. Verificar (debe ser idéntico al pre-0041):
SELECT count(*) FROM geo_zones WHERE level = 'parroquia';        -- 0
SELECT count(*) FROM organizations WHERE name = 'CTE - Santa Elena'; -- 0
SELECT id, code FROM geo_zones
 WHERE id IN (
   '8f14e45f-ceea-4c1f-8f2c-000000000024',
   '8f14e45f-ceea-4c1f-8f2c-000000000101',
   '8f14e45f-ceea-4c1f-8f2c-000000000102',
   '8f14e45f-ceea-4c1f-8f2c-000000000103'
 );  -- las 4 filas con code = NULL

# 4. Eliminar la fila de schema_migrations
DELETE FROM schema_migrations WHERE version = '0041';

# 5. Revertir MIGRATION_LOG.md a ⏳ Pending.
```

## Lo que este runbook NO cubre

- **Seeders** (`database/seeds/*.js` + `db:seed` / `db:seed:mass`).
  No se ejecutan contra Supabase prod — son para entorno local o
  staging. Cubiertos por `lib/guard.js` (doble compuerta production
  + host allowlist).
- **Aplicación local** (Docker compose + 0001–0041). Ver
  `docs/runbooks/deploy.md` § entorno local.
- **Cierre del change** (`sdd-archive` del
  `t7-geography-organizations-seed` — el operador puede correrlo
  cuando lo considere cerrado).

## Auditoría

Este runbook fue redactado en T7.9.Z5
(`openspec/changes/infra/t7-geography-organizations-seed/tasks.md`).
La verificación end-to-end del ciclo UP→DOWN→UP está cubierta por
`backend/test/e2e/t7-geography-orgs-seed.e2e-spec.ts` (10/10 verde
contra `MigrationHarness` + PostGIS real).
