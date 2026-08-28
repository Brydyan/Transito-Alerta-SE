# Design: T8 — Database Cutover & Operational Readiness

**Change**: t8-database-cutover
**Date**: 2026-08-26
**Stack**: PostgreSQL 16 + PostGIS 3.4 (Supabase) · TypeORM 0.3 · NestJS 10.4.4 · Jest 29.7.0 · Testcontainers

---

## 1. Decisiones

### D1 — Inventario de FKs generado desde information_schema, no hardcoded

**Elegido**: el test `t7-integrity-referential.e2e-spec.ts` arranca ejecutando
la query del R32.1 y guarda el resultado en una constante del spec. El resto
de los escenarios iteran sobre esa constante, nunca sobre una lista escrita
a mano.

```ts
// backend/test/e2e/t7-integrity-referential.e2e-spec.ts (extracto)
const inventory = await dataSource.query(`
  SELECT tc.table_name, kcu.column_name,
         ccu.table_name AS foreign_table,
         ccu.column_name AS foreign_column,
         rc.delete_rule, rc.update_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  ORDER BY tc.table_name, kcu.column_name
`);
```

**Rechazado**: una lista hardcoded en el spec. Drift inevitable en cuanto
una migración nueva agregue una FK.

**Implicación**: el spec R32.1 valida que el inventario no tiene filas con
`delete_rule = 'NO ACTION'`. Si una migración futura omite la cláusula, el
R32.1 falla con una lista exacta de las filas problemáticas, incluyendo
nombre de tabla, columna y nombre de la constraint.

### D2 — Tests en perfil separado `test:e2e:cutover`

**Elegido**: los tests de este change se ejecutan con un nuevo script npm:

```json
// backend/package.json
{
  "scripts": {
    "test:e2e:cutover": "jest --config ./test/jest-e2e.json --testPathPattern='t(7|8)-.*cutover|integrity|rollback' --runInBand"
  }
}
```

**Rechazado**: meter los tests en el `test:e2e` general. El ciclo de
rollback del R37.2 toma 4-5 minutos solo; añadirlo al pipeline de PR lo
vuelve inutilizable.

**Implicación**: el pipeline de CI de `.github/workflows/ci.yml` agrega
un job `cutover` que corre `pnpm run test:e2e:cutover` en `main` y
nightly, no en PRs. El job `integration` existente sigue corriendo
`pnpm run test:e2e` en cada PR sin cambios.

### D3 — Rehearsal script con detección de modo (staging/prod)

**Elegido**: `backend/scripts/cutover-rehearsal.sh` detecta modo por
variable de entorno:

```bash
MODE=${CUTOVER_MODE:-staging}  # staging | prod
if [ "$MODE" = "prod" ]; then
  set -euo pipefail
  confirm_production_mode
else
  set -euo pipefail
fi
```

`confirm_production_mode` requiere tipear `CUTOVER-PROD` literalmente
después de un banner de 10 líneas. No es un "are you sure?" débil; es
un guard explícito.

**Rechazado**: un flag `--prod` en línea de comandos. Demasiado fácil
de tipear por accidente; un banner de 10 líneas + tipear la cadena
`CUTOVER-PROD` reduce el riesgo a casi cero.

### D4 — Runbook con front-matter versionado

**Elegido**: `docs/runbooks/cutover.md` empieza con:

```markdown
---
version: 1
owner: ops
last_rehearsal: 2026-XX-XX
duration_minutes: 0
result: pending
---
```

El campo `last_rehearsal` se actualiza después de cada rehearsal. El campo
`result` se actualiza a `pass` o `fail`. Esto permite que el runbook se
compruebe a sí mismo: un runbook con `result: pending` después de la fecha
del cutover real es una señal de que el rehearsal no se ejecutó.

**Rechazado**: front-matter sin campos. La versión de un runbook no es
decorativa — es metadata que las herramientas (lint, CI, scripts)
pueden leer para detectar drift.

### D5 — Queries de monitoreo como funciones SQL, no como texto suelto

**Elegido**: las 6 queries canónicas de R30 se exponen como funciones
PL/pgSQL dentro de una sola migración nueva `0042_monitoring_helpers.sql`:

```sql
-- database/migrations/0042_monitoring_helpers.sql
CREATE OR REPLACE FUNCTION public.monitor_incidents_per_minute(window_minutes integer DEFAULT 5)
RETURNS TABLE(bucket_minute timestamptz, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('minute', created_at) AS bucket_minute, count(*)
  FROM incidents
  WHERE created_at > now() - make_interval(mins => window_minutes)
    AND deleted_at IS NULL
  GROUP BY 1 ORDER BY 1;
$$;
-- ... + 5 funciones equivalentes
```

Y el archivo `database/monitoring/queries.sql` las invoca:

```sql
-- database/monitoring/queries.sql
-- Q1: Conteo de incidentes en los últimos 5 minutos
SELECT * FROM monitor_incidents_per_minute(5);
-- ALERT: > 100 en cualquier bucket durante 2 buckets consecutivos
```

**Rechazado**: queries inline en `queries.sql` sin funciones. Si cambia
la estructura de la tabla (ej. T7.3.2 renombra `created_at` o T7.2 agrega
`deleted_at`), las queries inline se rompen en silencio.

**Costo**: una migración nueva (0042). Es la primera migración desde
0041 y por lo tanto **rompe la convención de "T8 no introduce migraciones"**
del proposal. El implementer debe registrar el permiso excepcional
(ver §5 de este design) antes de aplicar 0042.

### D6 — Hallazgos del R37.2 como entries de housekeeping, no como migraciones

**Elegido**: si el ciclo up/down del R37.2 revela que un archivo DOWN
existente (`database/rollback/0001_initial_schema.DOWN.sql`, por ejemplo)
deja estado residual, la corrección se hace **editando ese mismo archivo
DOWN** y agregando una entrada en `database/MIGRATION_LOG.md` con tipo
`housekeeping`:

```markdown
| 0001 | initial_schema (DOWN) | T8 housekeeping: <descripción del fix> | ✅ Applied | … | 2026-XX-XX | supabase |
```

No se crea una nueva migración `0042_fix_0001_down.sql`. La razón: una
migración que sólo arregla otra migración no es una migración; es un parche
que confunde a quien lee el historial.

**Rechazado**: crear migraciones `0042+` para cada fix. Inflaría el
conteo de migraciones y haría el log más difícil de leer.

**Edge case**: si el fix de un DOWN requiere cambios **arriba** (modificar
el archivo UP original, no el DOWN), eso sí requiere una migración nueva
`0042+_modify_0001_up.sql`. El implementer debe consultar este design
antes de aplicar housekeeping.

### D7 — El rehearsal NO toca Supabase production

**Elegido**: el script `cutover-rehearsal.sh` por defecto apunta a
`$STAGING_DATABASE_URL` y `$STAGING_REDIS_URL`. Para correr contra
producción, requiere:

```bash
CUTOVER_MODE=prod CUTOVER_PROD_CONFIRM=CUTOVER-PROD \
  ./cutover-rehearsal.sh
```

Y el script aborta inmediatamente si alguna de las dos variables falta.

**Rechazado**: detección por nombre de host (`if [[ "$DATABASE_URL" == *production* ]]`).
Frágil y propenso a errores con nombres de host no obvios.

### D8 — Las queries de monitoreo son idempotentes y read-only

**Elegido**: las funciones de `0042_monitoring_helpers.sql` se declaran
`LANGUAGE sql STABLE` y no hacen `INSERT`/`UPDATE`/`DELETE`. La migración
es puramente aditiva (`CREATE OR REPLACE FUNCTION`, `IF NOT EXISTS`).
Reversible con `DROP FUNCTION IF EXISTS` en el DOWN.

**Rechazado**: funciones `VOLATILE` con side effects (ej. una que limpie
notificaciones antiguas). Mezcla observación con mutación; rompe el
principio de R30 (queries canónicas, no plataforma).

---

## 2. Cambios en archivos de proyecto

```
backend/
├── package.json                          # +1 script (test:e2e:cutover)
├── test/
│   └── e2e/
│       ├── t7-integrity-referential.e2e-spec.ts   (NUEVO, D8.1)
│       ├── t7-rollback-cycle.e2e-spec.ts          (EXTENDER, D8.2)
│       └── cutover-validation.e2e-spec.ts         (NUEVO, D8.3)
├── scripts/
│   └── cutover-rehearsal.sh                       (NUEVO, D8.3)
database/
├── migrations/
│   ├── 0042_monitoring_helpers.sql                (NUEVO, D8.4)
│   └── rollback/
│       └── 0042_monitoring_helpers.DOWN.sql        (NUEVO)
├── monitoring/
│   └── queries.sql                                (NUEVO, D8.4)
└── MIGRATION_LOG.md                                (1 fila nueva + N housekeeping)
docs/
├── runbooks/
│   └── cutover.md                                 (NUEVO, D8.3 + D8.4)
└── tasks/
    └── 3-DATABASE-SCHEMA.md                       (sync sección cutover, R31.1)
openspec/
└── specs/
    └── database-schema/
        └── spec.md                                (compliance R17-R18 → ✅)
```

---

## 3. Catálogo de queries de monitoreo (D8.4)

| # | Función | Threshold de alerta |
|---|---------|---------------------|
| Q1 | `monitor_incidents_per_minute(window_minutes int)` | > 100 en cualquier bucket durante 2 buckets consecutivos |
| Q2 | `monitor_endpoint_latency_p95(endpoint text, window_minutes int)` | p95 > 200 ms sostenido por 5 min |
| Q3 | `monitor_5xx_count(window_minutes int)` | > 10 en 15 min |
| Q4 | `monitor_pg_pool_usage()` | > 80% de conexiones en uso por 5 min |
| Q5 | `monitor_revocation_denylist_size()` | > 10 000 entradas (umbral arbitrario, ajustar tras 1 semana en prod) |
| Q6 | `monitor_unread_notifications_count()` | > 1 000 sin leer acumuladas para un solo usuario (alerta de fan-out roto) |

Cada función se invoca desde `database/monitoring/queries.sql` con un
comentario `-- ALERT: <condición>` que documenta el umbral en lenguaje
natural. La integración con Prometheus/Grafana (scrape de las funciones)
queda fuera de alcance de T8.

---

## 4. Estructura del runbook `docs/runbooks/cutover.md`

```markdown
# Runbook: Cutover a NestJS

> Front-matter: { version, owner, last_rehearsal, duration_minutes, result }
> 1. Criterios go/no-go
> 2. Pre-cutover (validación)
> 3. Cutover (ventana 30 min)
>    3.1. Snapshot PITR
>    3.2. Detener Laravel
>    3.3. Levantar NestJS
>    3.4. Smoke tests
> 4. Rollback (si algo falla)
>    4.1. Restaurar PITR
>    4.2. Reiniciar Laravel
>    4.3. Verificar integridad
> 5. Monitoreo post-cutover (48h)
> 6. Dual-write (opcional)
> 7. Rehearsal (última ejecución + duración)
> 8. Apéndice: queries de monitoreo
```

Cada comando de la sección 1-7 debe ser copy-pasteable desde una terminal
conectada a VPN. El runbook no asume acceso al panel web de Supabase.

---

## 5. Permiso excepcional para la migración 0042

El proposal dice "ninguna migración nueva". La decisión D5 rompe esa regla
para D8.4. El implementer debe:

1. Justificar el permiso en el commit message de 0042 con la referencia
   a D5 del design.
2. Agregar 0042 a `MIGRATION_LOG.md` con la nota explícita de que es
   **read-only, idempotente, reversible**, y por lo tanto rompe la regla
   de "ninguna migración" del proposal sin violar la política CC3
   (Manual Migration Integrity).
3. Aplicarla al ambiente de staging antes de cualquier rehearsal de cutover.

Si el implementer considera que esta excepción no es aceptable, la
alternativa es implementar las queries inline en `database/monitoring/queries.sql`
sin funciones, perdiendo la protección de D5 contra drift de esquema. La
decisión de aceptar D5 o rechazarla es del implementer, no del arquitecto.

---

## 6. Compliance esperado al cerrar el change

```
R17-R18 (transversal / docs) | ✅ Compliant
R26 (validación pre-cutover ejecutable) | ✅ Compliant
R27 (runbook ejecutable) | ✅ Compliant
R28 (decisión dual-write) | ✅ Compliant
R29 (rollback probado) | ✅ Compliant
R30 (queries de monitoreo) | ✅ Compliant
R31 (cierre del plan original) | ✅ Compliant
R32 (inventario dinámico) | ✅ Compliant
R33 (INSERT con FK inválida) | ✅ Compliant
R34 (ON DELETE verificado) | ✅ Compliant
R35 (regresión de ON DELETE) | ✅ Compliant
R36 (ciclo up/down completo) | ✅ Compliant
R37 (correctitud de DOWNs) | ✅ Compliant
R38 (compliance del spec database-schema) | ✅ Compliant
```
