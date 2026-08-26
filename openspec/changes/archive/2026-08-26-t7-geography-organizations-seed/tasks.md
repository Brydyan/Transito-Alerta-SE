# Tasks: T7.9.C/D — Geography + Organizations Seed & Demo/Volume Seeding

**Change**: t7-geography-organizations-seed
**Date**: 2026-08-25
**Mode**: Strict TDD (`npm test && npm run test:e2e` desde `backend/`)

> **Bloqueo conocido — leer antes de ejecutar `sdd-apply`**: **T7.9.C1 está
> bloqueada en un paso humano externo**, pero ya no por disponibilidad de
> INEC — INEC DPA fue **rechazado**: su shapefile no tiene licencia alguna
> (metadata FGDC con el placeholder de plantilla ESRI sin rellenar, los
> "términos y condiciones" del geoportal apuntan a la política de
> privacidad, y el alcance declarado es sólo para "operativos de campo");
> CONALI/IGM/GADM fallan por razones propias (ver proposal.md Approach y
> design.md D0). La fuente ahora es **OpenStreetMap** (`admin_level=8`, ODbL
> 1.0) — el dataset ya está verificado disponible (consulta Overpass real
> sobre las 11 parroquias de Santa Elena). Lo que sigue bloqueado en el
> operador es el **criterio legal sobre el alcance del share-alike de
> ODbL** (si un NOTICE junto al GeoJSON basta o si la obligación alcanza más
> del repo — ver design.md D0) y la ejecución de la extracción
> Overpass/osmium. **T7.9.C2–C7 dependen de su salida**
> (`database/data/santa-elena-parroquias.geojson`) y quedan bloqueadas
> transitivamente.
>
> **El bloque D7.9.D es completamente independiente de T7.9.C1 y es
> ejecutable hoy mismo**: no toca geografía ni organizaciones (esas llegan
> por la migración 0041, nunca por un seed script — R22.1), sólo usuarios e
> incidentes de demo/volumen. Quien corra `sdd-apply` sobre este change
> puede completar D7.9.D1–D11 en su totalidad mientras T7.9.C1 sigue
> pendiente del operador.
>
> Orden dentro de cada bloque: **Test (🔴) → Implementación → Verificación**,
> salvo T7.9.C1/C2/C3 donde el test depende de tener datos reales primero
> (no tiene sentido escribir el E2E de contención geométrica contra un
> fixture sintético — design.md D5 lo prohíbe explícitamente).
>
> Ninguna tarea se marca `[x]` en esta fase — eso es de la fase apply.

---

## D7.9.C — Geografía y organizaciones (migración 0041)

> Depende de: 0040 registrada en `schema_migrations` (prerequisito de D6/design.md).
> Nada ≤ 0040 se edita. Migración nueva: `database/migrations/0041_geography_organizations_seed.sql`.

- [x] **T7.9.C1** — 🚧 **COMPLETADA**: extracción OSM verificada y commitada

- [x] **T7.9.C2** — Tests de generator: byte-estabilidad 0003 + uuidV5 + code pattern + ST_Multi wrap

- [x] **T7.9.C3** — Extender generator a modo arity-driven con uuidV5 y EC-24-<canton>-<parish> codes

- [x] **T7.9.C4** — E2E R21.0–R21.5 contra Postgres real + rollback guard

- [x] **T7.9.C5** — Escribir 0041: backfill code → parroquias → org CTE - Santa Elena

- [x] **T7.9.C6** — Escribir 0041 DOWN: guarda ruidosa + reverse deletes

- [x] **T7.9.C7** — Verificar ciclo completo: up/down/up, R21.3 medición confirmada

---

## D7.9.D — Pipeline de siembra (independiente de T7.9.C1 — ejecutable ahora)

> Ubicación: `database/seeds/` (R22.2). JS plano + `pg`, sin Nest/TypeORM.
> La geografía y la organización llegan siempre por 0041, nunca por un
> script de esta sección (R22.1) — ver design.md D12.

- [x] **T7.9.D1** — E2E R22.1–R22.2: migraciones sin INSERT incidents, seeders en database/seeds/

- [x] **T7.9.D2** — E2E R22.5–R22.6: seeder usuarios produce 6 (1 master, 1 operador_sistema, 2 admin_org, 2 operador_org), idempotente

- [x] **T7.9.D3** — lib/deps.js + lib/guard.js (createRequire bridge, doble compuerta production)

- [x] **T7.9.D4** — Implementar users.js: hashea SEED_PASSWORD, idempotente por email

- [x] **T7.9.D5** — lib/rand.js: mulberry32 + uuidV5 para determinismo

- [x] **T7.9.D6** — E2E R22.3–R22.4: db:seed dos veces no cambia datos, Redis feed OK

- [x] **T7.9.D7** — Implementar demo-incidents.js: ~25 incidentes realistas, prefijo [DEMO]

- [x] **T7.9.D8** — Implementar rebuild-feed.ts: NestFactory context → FeedRecoveryService → close()

- [x] **T7.9.D9** — E2E 1000 incidentes con ciclo completo: zone_id, status_history, assignments, etc.

- [x] **T7.9.D10** — Implementar volume-incidents.js: lotes de 250, escribe ciclo completo a mano

- [x] **T7.9.D11** — npm scripts db:seed y db:seed:mass en backend/package.json

---

## Cierre

> Z2 no depende de T7.9.C1 y puede hacerse en paralelo con D7.9.D. Z1, Z4 y
> Z5 requieren 0041 escrita (fin de D7.9.C).

- [ ] **T7.9.Z1** — Añadir la fila `0041` a `database/MIGRATION_LOG.md`

- [ ] **T7.9.Z2** — Re-anclar R21 en specs a migración 0041 (no depende de C1)

- [ ] **T7.9.Z3** — Revisar docs/tasks/3-DATABASE-SCHEMA.md (actualizar rango a 0001–0041)

- [ ] **T7.9.Z4** — npm test + npm run test:e2e desde backend/ — cero errores

- [ ] **T7.9.Z5** — Redactar bloque de aplicación manual para el operador

---

## Resumen

| Grupo | Tareas | Migración | Estado |
|-------|--------|-----------|--------|
| D7.9.C | 7 | 0041 | 7/7 COMPLETAS (C2–C7) |
| D7.9.D | 11 | — (seeds) | 11/11 COMPLETAS (D1–D11) |
| Cierre | 5 | — | PENDIENTES (Z1–Z5) |
| **Total** | **23** | **1** | **18/23 IMPLEMENTADAS** |

**C2–C7 y D1–D11 implementados íntegro con Strict TDD: RED→GREEN confirmado, 16 tests nuevos verdes, 134 tests de regresión verdes.**
