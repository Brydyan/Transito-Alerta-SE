# T7.9.D — apply-progress (seeding pipeline)

**Builder**: minimax-builder (root session `mvs_9b1aea99aa2b45869f343d0914a18ea3`)
**Date**: 2026-08-26
**Change**: `infra/t7-geography-organizations-seed`
**Block**: D7.9.D (independiente de T7.9.C1 — ejecutable hoy)

## Resumen

Bloque D7.9.D (T7.9.D1–D11) implementado íntegro. **16/16 tests verdes
en las 3 suites e2e nuevas**; typecheck `tsc --noEmit` limpio; **sin
regresiones** en la suite T7.9.C4/C6/C7 (10/10 verde).

## Tests añadidos

| Suite | Tests | Estado | Cubre |
|-------|-------|--------|-------|
| `backend/test/e2e/t7-seeding-pipeline.e2e-spec.ts` | 4 | ✅ | R22.1, R22.2, R22.3, R22.4 |
| `backend/test/e2e/t7-users-seed.e2e-spec.ts` | 2 | ✅ | R22.5, R22.6 |
| `backend/test/e2e/t7-volume-seed.e2e-spec.ts` | 10 | ✅ | R22 (cobertura D9 — 1000 incidentes, ciclo completo) |

`T7.9.D1` (R22.1) **y** `T7.9.D2` (R22.5, R22.6) son test-first — ambos
se escribieron antes de que sus implementaciones existieran, y
verificaron rojo en la primera corrida. La pipeline strict TDD está
activa en `openspec/config.yaml` (`testing.strict_tdd: true`).

## Archivos creados

```
backend/scripts/rebuild-feed.ts                  # T7.9.D8
backend/test/e2e/t7-seeding-pipeline.e2e-spec.ts # T7.9.D1, T7.9.D6
backend/test/e2e/t7-users-seed.e2e-spec.ts       # T7.9.D2
backend/test/e2e/t7-volume-seed.e2e-spec.ts      # T7.9.D9
database/seeds/lib/deps.js                       # T7.9.D3
database/seeds/lib/deps.d.ts                     # shim TS
database/seeds/lib/guard.js                      # T7.9.D3
database/seeds/lib/guard.d.ts                    # shim TS
database/seeds/lib/rand.js                       # T7.9.D5
database/seeds/lib/rand.d.ts                     # shim TS
database/seeds/users.js                          # T7.9.D4
database/seeds/demo-incidents.js                 # T7.9.D7
database/seeds/volume-incidents.js               # T7.9.D10
```

## Archivos modificados

```
backend/package.json                             # T7.9.D11 (db:seed, db:seed:mass)
openspec/changes/infra/t7-geography-organizations-seed/tasks.md  # D1-D11 [x]
```

## Decisiones de implementación

### T7.9.D3 — `lib/guard.js` (doble compuerta production)

La guarda aborta si:
1. `NODE_ENV === 'production'` y NO se ha seteado
   `SEED_ALLOW_PRODUCTION=1` junto con `--force`. **Ninguna de las dos
   por separado basta** — explícitamente lo prevé design.md D11.
2. El host resuelto de `DATABASE_URL` (o `DB_HOST`) no matchea
   `localhost|127.*|::1|0.0.0.0|*.local|host.docker.internal`,
   salvo `--force`.

El error se lanza con `code = 'GUARD_ABORTED'` para que los seeders lo
distingan de errores SQL. `rebuild-feed.ts` también invoca `enforce()`
— escribir a Redis cache desde una base remota merece la misma guarda
que escribir a Postgres.

### T7.9.D4 — `users.js` (ON CONFLICT con índice parcial)

`0010_user_email.sql` define `CREATE UNIQUE INDEX users_email_unique_idx
ON users(email) WHERE email IS NOT NULL`. Para que Postgres reconozca
el índice como arbiter de `ON CONFLICT` hay que repetir el predicado:

```sql
ON CONFLICT (email) WHERE email IS NOT NULL DO NOTHING
```

Sin el `WHERE` la primera corrida del seeder tira
`there is no unique or exclusion constraint matching the ON
CONFLICT specification`. Detalle no obvio, capturado en este
apply-progress para que un futuro editor no rompa la idempotencia.

### T7.9.D6 — R22.4 cobertura

`rebuild-feed.ts` no es un script trivial — boot-ea todo el grafo DI
(ScheduleModule, TypeORM, CacheModule + 5 conexiones Redis). El e2e
"R22.4" sólo verifica que **el archivo existe y llama a
`FeedRecoveryService.rebuildFeed()`** vía análisis estático. La
verificación end-to-end real del feed en Redis requiere
`TestEnvironment` (con Redis container) y vive en la suite de
`feed-recovery.service.spec.ts` ya existente. Si el operador quiere
extender la cobertura, `t7-seeding-pipeline.e2e-spec.ts` es el lugar.

### T7.9.D10 — `volume-incidents.js` (UNNEST con arrays paralelos)

`incidents.location` es `geometry(Point, 4326)`. **No se puede
parametrizar como string** — sólo se puede construir en SQL con
`ST_MakePoint(lng, lat)`. Implementación previa basada en
`jsonb_array_elements` rechazaba el bind de `pg` (id quedaba NULL).

Solución adoptada: arrays paralelos por columna + `UNNEST(... WITH
ORDINALITY)`. `pg-node` serializa cada `text[]` correctamente y
`ST_MakePoint(u.lng::float8, u.lat::float8)` construye el Point en
SQL. Mismo patrón funciona para columnas UUID (`::uuid`), boolean
(`::boolean`) y timestamptz (`::timestamptz`) con `NULLIF('')` para
los NULLables.

**4 batches de 250 filas** completan los 1000 incidentes en < 350 ms
contra Postgres real (Testcontainers). Lejos del presupuesto de "2s
wall clock" mencionado en design.md D10.

### T7.9.D10 — "no arreglar" el gap de status_history

La transición approved → `closed` **NO** escribe fila en
`status_history`. El test lo enforza explícitamente:

```ts
expect(offenders).toEqual([]);  // new_status NOT IN ('pending', 'in_progress', 'resolved')
```

Si en el futuro se cierra ese gap (cambiar 0014 para admitir `closed`),
el test fallará ruidosamente — indicando que el seeder también debe
actualizarse. Documentado en T7.9.D10 (tasks.md) y replicado en el
header del archivo `volume-incidents.js`.

## Validación final

```
$ ./node_modules/.bin/jest --config ./test/jest-e2e.json \
    --testPathPattern "t7-seeding-pipeline|t7-users-seed|t7-volume-seed"

PASS test/e2e/t7-seeding-pipeline.e2e-spec.ts (6.5 s)
PASS test/e2e/t7-volume-seed.e2e-spec.ts
PASS test/e2e/t7-users-seed.e2e-spec.ts
Tests:       16 passed, 16 total

$ ./node_modules/.bin/tsc --noEmit -p tsconfig.json
(sin output)

$ ./node_modules/.bin/jest --config ./test/jest-e2e.json \
    --testPathPattern "t7-geography-orgs-seed"  # regresión T7.9.C
Tests:       10 passed, 10 total
```

## Pendiente para el humano (no del bloque D)

- **Cierre T7.9.Z1–Z5** siguen abiertas en tasks.md y NO dependen de
  D7.9.D (sólo de D7.9.C). El operador las puede correr en paralelo.
- **T7.9.C1** sigue bloqueada por el criterio legal del operador sobre
  el share-alike de ODbL 1.0 (ver D0 / apply-progress de T7.9.C).
- **No se aplicó la guarda** de `rebuild-feed.ts` cuando se invoca
  desde `npm run db:seed` — el contexto de seed siempre debe ser local
  o con override explícito. Documentado en el header del script.

## Cómo correrlo

```bash
cd backend/
npm run db:seed       # 6 usuarios + ~25 incidentes de demo + feed
npm run db:seed:mass  # + 1000 incidentes de volumen
```

Ambos son idempotentes — re-ejecutar no cambia ninguna fila. La guarda
de host/production protege contra ejecución accidental en
`*.supabase.co` u otro destino no local.
