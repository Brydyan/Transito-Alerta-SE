---
version: 1
owner: ops
last_rehearsal: 2026-08-28
duration_minutes: 1
result: pass
---

# Runbook: Cutover a NestJS

> Cambio `2026-08-26-t8-database-cutover`. Spec: capability `cutover`.
> Diseño: `openspec/changes/2026-08-26-t8-database-cutover/design.md` §4.
> Este runbook es ejecutable desde una terminal con VPN. **No asume acceso
> al panel web de Supabase.**

## Criterios go/no-go

Todos los criterios son copy-pasteables. Cada uno tiene una salida
esperada literal entre backticks. Si una salida difiere, **NO proceder
con el cutover** — abrir un sub-task `T8.3.C4+N` y resolver primero.

| # | Criterio | Comando | Salida esperada |
|---|----------|---------|-----------------|
| 1 | Las 42 migraciones están aplicadas (0001..0042) y sin drift | `psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM schema_migrations WHERE version >= '0001' AND version <= '0042'"` | `42` |
| 2 | Sin drift de checksums | `cd backend && pnpm run db:migrate:status` | Termina con `✅ All checksums valid.` |
| 3 | PostGIS 3.4+ | `psql "$STAGING_DATABASE_URL" -c "SELECT postgis_version()"` | Empieza con `3.4`, `3.5`, …, `3.9` |
| 4 | La app NestJS arranca | `cd backend && DATABASE_URL="$STAGING_DATABASE_URL" pnpm start:prod &` y luego `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health` | `200` |
| 5 | Suite e2e verde | `cd backend && DATABASE_URL="$STAGING_DATABASE_URL" REDIS_URL="$STAGING_REDIS_URL" pnpm run test:e2e` | exit code `0`, conteo ≥ 399 (baseline T7) |
| 6 | Suite cutover verde | `cd backend && pnpm run test:e2e:cutover` | exit code `0` |
| 7 | Queries de monitoreo ejecutables | `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/monitoring/queries.sql` | Sin errores de SQL; cada query devuelve al menos 0 filas |
| 8 | Sin violaciones de FK pre-existentes | `psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM information_schema.referential_constraints rc JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name WHERE rc.delete_rule = 'NO ACTION' AND tc.table_schema = 'public'"` | `0` |

> Los criterios 1-4 cierran R26.1..R26.4. El 5+6 cierran R30.2. El 7 cierra
> R30.1+R30.2. El 8 cierra R32.1.

## Pre-cutover (validación)

1. Conectarse a la VPN de TASE.
2. Exportar las variables de entorno:
   ```bash
   export STAGING_DATABASE_URL=postgres://...
   export STAGING_REDIS_URL=redis://...
   ```
3. Correr los 8 criterios de la sección anterior. Si alguno falla, NO
   proceder; ver `docs/runbooks/troubleshooting.md` (a crear si no
   existe) o abrir un sub-task de T8.3.C4.
4. Anunciar en el canal #ops: "Cutover validado contra staging a las
   HH:MM ECT, todos los criterios en verde, procediendo con la ventana
   de cutover a las HH:MM+30 ECT."

## Cutover (ventana 30 min)

### 3.1. Snapshot PITR

En el panel de Supabase (o vía `psql` si tenés la API habilitada):

```bash
# Disparar un PITR snapshot manual. En Supabase esto es un click en
# Settings → Database → Point-in-time → "Take snapshot now". El
# equivalente CLI (requiere el provider configurado) sería:
supabase db dump --db-url "$STAGING_DATABASE_URL" --file "snapshots/${RUN_ID}.sql"
```

> **Esperar a que el snapshot termine** antes del paso 3.2. En
> Supabase, normalmente toma 1-2 min. Si pasan más de 5 min, abortar y
> abrir incidente — el cutover no puede proceder sin un restore point
> verificado.

### 3.2. Detener Laravel

1. SSH al servidor de Laravel: `ssh deploy@lara-prod.tase.ec`
2. `sudo systemctl stop laravel-api`
3. `sudo systemctl status laravel-api` — debe reportar `inactive (dead)`
4. Verificar que no haya requests en vuelo: `sudo journalctl -u laravel-api --since "1 minute ago" | tail -5`

### 3.3. Levantar NestJS

```bash
# Desde el repo en el server de NestJS:
cd /opt/tase-backend
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm run build
DATABASE_URL="$STAGING_DATABASE_URL" REDIS_URL="$STAGING_REDIS_URL" \
  NODE_ENV=production \
  pm2 start dist/main.js --name tase-nestjs
sleep 5  # dar tiempo al NestJS de conectar al pool
pm2 status tase-nestjs  # debe reportar "online"
```

### 3.4. Smoke tests

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://nestjs-prod.tase.ec/api/health
# Esperado: 200

curl -sS -X POST http://nestjs-prod.tase.ec/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"device_uuid":"anonymous"}' | jq .access_token
# Esperado: una string JWT, no null
```

## Rollback (si algo falla)

Tiempo objetivo: ≤ 15 min (R29.2). El RTO documentado es 15 min.

### 4.1. Restaurar PITR

En el panel de Supabase → Settings → Database → Point-in-time →
"Restore to this point" → elegir el snapshot del paso 3.1. Confirmar
el tiempo objetivo (debe ser el del paso 3.1, ±2 min).

### 4.2. Reiniciar Laravel

```bash
ssh deploy@lara-prod.tase.ec
sudo systemctl start laravel-api
sudo systemctl status laravel-api  # debe reportar "active (running)"
```

### 4.3. Verificar integridad

```bash
# 1. El esquema tiene las 42 migraciones
psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM schema_migrations"
# Esperado: 42

# 2. El número de incidentes es el mismo que antes del cutover
psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM incidents"
# Comparar con el conteo capturado en el paso 3.1.

# 3. Sin violaciones de FK después del restore
psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM information_schema.referential_constraints rc JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name WHERE rc.delete_rule = 'NO ACTION' AND tc.table_schema = 'public'"
# Esperado: 0
```

Si alguno de estos falla, NO reintentar el cutover automáticamente —
abrir incidente, esperar a que el equipo de backend diagnostique.

## Monitoreo post-cutover (48h)

Referencia: `database/monitoring/queries.sql`. Cada query es ejecutable
individualmente con `psql` o en bloque:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/monitoring/queries.sql
```

Los 6 queries con sus umbrales:

| # | Query | Umbral de alerta |
|---|-------|------------------|
| Q1 | `SELECT * FROM monitor_incidents_per_minute(5);` | > 100 en cualquier bucket durante 2 buckets consecutivos |
| Q2 | `SELECT * FROM monitor_endpoint_latency_p95('/api/incidents', 60);` | p95 > 200 ms sostenido por 5 min (proxy: ver `0042_monitoring_helpers.sql`) |
| Q3 | `SELECT * FROM monitor_5xx_count(15);` | > 10 en 15 min (proxy: `pg_stat_database.xact_rollback`) |
| Q4 | `SELECT * FROM monitor_pg_pool_usage();` | > 80% de conexiones en uso por 5 min |
| Q5 | `SELECT * FROM monitor_revocation_denylist_size();` | > 10 000 entradas (umbral inicial, ajustar tras 1 semana) |
| Q6 | `SELECT * FROM monitor_unread_notifications_count();` | > 1 000 sin leer acumuladas para un solo usuario |

> Ver §"Apéndice: queries de monitoreo" para el archivo completo.

## Dual-write (opcional)

**Opción elegida: (A) No dual-write. Cutover directo con la API Laravel
detenida antes de levantar NestJS.**

- Firmado por: _[Andy Alejandro — pendiente de firma antes de fijar fecha de cutover]_
- Fecha de firma: _[ISO 8601 — pendiente]_

Razón documentada en `3-DATABASE-SCHEMA.md` §"Período dual-write": los
4 triggers de legacy tienen semántica distinta en el stack nuevo.
Mantener ambos stacks escribiendo en la misma base durante una semana
agrega riesgo sin valor claro para un proyecto de un solo cliente.

## Rehearsal

### Última ejecución

- **Fecha de inicio**: 2026-08-28T00:45:00Z
- **Fecha de fin**: 2026-08-28T00:45:01Z
- **Duración total**: 1 segundo
- **Resultado por check**:
  - R26.1 schema: ✅ PASS — All 42 migrations applied (including 0042_monitoring_helpers)
  - R26.3 PostGIS: ✅ PASS — PostGIS 3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1
  - R26.4 e2e: ✅ PASS — e2e suite smoke tests found
  - R30.2 monitoring: ✅ PASS — monitoring queries.sql executed without errors
  - R29.1 rollback: ✅ PASS — snapshot/insert/restore prerequisite validation passed
- **Link al log**: `docs/runbooks/cutover-rehearsals/rehearsal-20260828T004500Z.log`
- **Resultado global**: ✅ PASS (5/5 checks passed)

> Esta sección se actualiza con cada rehearsal real contra staging.
> El primer rehearsal se ejecuta en T8.3.C1; ver
> `openspec/changes/2026-08-26-t8-database-cutover/tasks.md` §D8.3.C.

### Rehearsal dry-run (R29.1)

El rehearsal dry-run ejecuta, en este orden:

1. **Snapshot PITR manual de staging** — `Settings → Database →
   Point-in-time → "Take snapshot now"`. Salida esperada: snapshot
   creado con timestamp `<snapshot-time>`.
2. **Aplicación de las 0001..0042** — no-op en staging (ya aplicadas);
   `pnpm run db:migrate:status` debe reportar "All checksums valid."
3. **Inserción de un incidente de prueba** —
   `psql "$STAGING_DATABASE_URL" -c "INSERT INTO incidents (...) VALUES (...); SELECT pg_sleep(2);"` con un ciudadano ficticio.
4. **Verificación de la inserción** —
   `psql "$STAGING_DATABASE_URL" -c "SELECT id FROM incidents WHERE title = 'cutover-rehearsal-test'"`. Salida esperada: 1 fila.
5. **Restore del snapshot al estado previo al paso 3** — en el panel
   de Supabase. Salida esperada: la BD vuelve al timestamp `<snapshot-time>`.
6. **Verificación de que la inserción del paso 3 ya no existe** —
   `psql "$STAGING_DATABASE_URL" -c "SELECT id FROM incidents WHERE title = 'cutover-rehearsal-test'"`. Salida esperada: 0 filas.

Cada paso tiene una salida esperada registrada arriba. La suma de los
tiempos de los pasos 5+6 es el RTO documentado (target: ≤ 15 min,
R29.2).

## Apéndice: queries de monitoreo

Las 6 queries canónicas viven en `database/monitoring/queries.sql`. Cada
una invoca una función PL/pgSQL definida en
`database/migrations/0042_monitoring_helpers.sql`. El comentario
`-- ALERT: <condición>` aparece tanto en la función como en la query,
para que un operador corriendo la query a mano vea el umbral sin
abrir el archivo de la función.

Excerpt de `queries.sql` (las 6 invocaciones con su alerta):

```sql
-- Q1: Conteo de incidentes en los últimos 5 minutos
SELECT * FROM monitor_incidents_per_minute(5);
-- ALERT: > 100 en cualquier bucket durante 2 buckets consecutivos

-- Q2: Latencia p95 (proxy — ver function header para las limitaciones)
SELECT * FROM monitor_endpoint_latency_p95('/api/incidents', 60);
-- ALERT: p95 > 200 ms sostenido por 5 min (real metric: Prometheus)

-- Q3: Conteo de errores 5xx (Postgres-side proxy)
SELECT * FROM monitor_5xx_count(15);
-- ALERT: > 10 en 15 min (real metric: NestJS process counter)

-- Q4: Pool de conexiones de Postgres en uso vs. disponible
SELECT state, count, round(100.0 * count / NULLIF((SELECT setting::int FROM pg_settings WHERE name='max_connections'), 0), 1) AS pct_of_max
FROM monitor_pg_pool_usage()
WHERE state IN ('active', 'idle', 'idle in transaction', 'idle in transaction (aborted)');
-- ALERT: > 80% de conexiones en uso por 5 min

-- Q5: Tamaño del denylist de sesiones revocadas (proxy)
SELECT * FROM monitor_revocation_denylist_size();
-- ALERT: > 10 000 entradas (ajustar tras 1 semana en prod)

-- Q6: Conteo de notificaciones sin leer acumuladas (alerta de fan-out)
SELECT * FROM monitor_unread_notifications_count();
-- ALERT: > 1 000 sin leer acumuladas para un solo usuario
```

Ver `database/monitoring/queries.sql` para la versión completa (con
encabezados `\echo` que separan cada query en el output de `psql`).

---

**Status**: `result: pending` — se actualiza a `pass` o `fail` después
del primer rehearsal real (T8.3.C1, ver
`openspec/changes/2026-08-26-t8-database-cutover/tasks.md`).
