# 3: Esquema de Base de Datos y Auditoría de Migración

> **Última actualización**: 2026-08-26 — T7 cerrado en código y verificado en CI.
>
> **Verificación 2026-08-26** (re-ejecutada como parte de este sync):
> - `pnpm test` → **856/856 unit tests** verdes (93 suites, 16.7s)
> - `pnpm run test:e2e` → **399/399 e2e tests** verdes (45 suites, 515.9s, Testcontainers)
> - `pnpm run typecheck` → 0 errores
> - `pnpm run lint` → 0 errores (19 warnings de `@typescript-eslint/no-explicit-any` en `*.spec.ts`, no bloqueantes)
> - `diff <(ls migrations/ | sed 's/\.sql$//') <(ls rollback/ | sed 's/\.DOWN\.sql$//')` → **41 == 41**, sin diff (T7.1.C3 ✅ ejercitado)
> - `backend/scripts/run-migrations.ts` existe con `--down --to <version>`, `--status`, `--list`, `--version` (T7.1.B4 ✅)
> - `backend/package.json` tiene `db:migrate`, `db:migrate:status`, `db:rollback` (T7.1.B5 ✅)
> - 14 entidades TypeORM tienen `updatedAt` con `update: false` (T7.3.A5 ✅)
> - Migrations 0030–0041 son nuevas; 0001–0029 se aplicaron en T6. Runner operacional.

## Migración GeoReporta → Transito-Alerta-SE

Las 72 migraciones Laravel de `GeoReporta/backend/database/migrations/` se
auditaron contra nuestras migraciones SQL. El mapeo real medido es
**72 migraciones legacy → 41 archivos SQL** (0001–0041, con T7.9.C/D completadas).

La consolidación viene de que Laravel genera una migración por cambio incremental
(muchas son `add_column` de una sola columna, y varias se cancelan entre sí:
`create_incident_images_table` → `remove_incident_images_table` →
`create_images_table` → `drop_legacy_image_storage`), mientras que aquí se escribe
una migración por unidad de trabajo del roadmap.

---

## Estado real de las migraciones (2026-08-24)

- **0001–0029**: ✅ aplicadas y verificadas en Supabase (T1–T6). Fuente de verdad: `database/MIGRATION_LOG.md`.
- **0030–0041**: ✅ implementadas, committeadas, prontas para deployment (T7.1–T7.10). T7.9.C/D completadas (geografía + organizaciones semilla + seeding pipeline).

| Rango | Fase | Contenido |
|-------|------|-----------|
| 0001–0008 | T1 / T2 | Esquema base (users, organizations, roles), PostGIS + geo_zones + seed Santa Elena, incidents, comments, perfil de users + user_sessions, assignments, techo de permisos anónimos |
| 0009–0019 | T3 / T5.1 | roles_permissions (JSONB + catálogo), users.email, notifications, incident_categories, jerarquía de geo_zones, status_history, scoping por organización, revocación de sesiones, identidad por password, invitations + password_reset_tokens, incident claim |
| 0020–0023 | T5.6 | Estado `closed`, columnas de decisión (approve/reject), tipo de notificación `incident_pending_approval`, `status_history.notes` |
| 0024 | T5.5 | `comment_images` |
| 0025–0029 | T6 | Soft delete de incidents y assignments, columnas de métricas (`claimed_at`, `resolution_date`), OTP + compliance en users, `incident_images` |
| 0030–0032 | T7.1–T7.3 | Migration tooling (`schema_migrations` table), soft delete completeness (13 tablas: roles + 12 más), `updated_at` + triggers (15 tablas) |
| 0033–0034 | T7.4–T7.5 | Comments threading (`parent_id`, depth-2 limit), org hierarchy + category-based routing (fix T6 defect) |
| 0035–0037 | T7.6–T7.8 | Domain columns (`geo_zones.code`, `users.phone`), referential integrity (leaf-category trigger, FK normalization), index parity (9 missing indexes) |
| 0038–0039 | T7.9.A–B | Reference data (22-category tree, notification permisos) |
| 0040 | T7.10 | Renombre de roles: `admin_sistema` → `master`, `admin_organizacion` → `admin_org`, `operador_organizacion` → `operador_org` |
| 0041 | T7.9.C/D | Parroquias Santa Elena (11 filas OSM) + organización CTE - Santa Elena + backfill geo_zones.code; seeding pipeline (usuarios, demo/volumen, feed rebuild, npm scripts) |

**16 tablas de dominio**: `assignments`, `comment_images`, `comments`, `geo_zones`,
`incident_categories`, `incident_images`, `incidents`, `invitations`,
`notifications`, `organizations`, `password_reset_tokens`, `permissions`, `roles`,
`status_history`, `user_sessions`, `users`.

### Rollback

`database/rollback/` tiene un archivo `.DOWN.sql` por cada migración (41/41).
✅ Cobertura verificada por `diff` (`diff <(ls migrations/ | sed 's/\.sql$//') <(ls rollback/ | sed 's/\.DOWN\.sql$//')` → sin diff, T7.1.C3 cerrado).
✅ Ciclo up/down completo ejercitado por `backend/test/migrations/rollback-cycle.e2e-spec.ts` (T7.1.C1, parte de la suite e2e).
El runner CLI (`backend/scripts/run-migrations.ts`) soporta `--down --to <version>` y existe npm script `db:rollback` para disaster recovery.

---

## Divergencias respecto de GeoReporta

Auditadas el 2026-08-24 comparando columna por columna ambos esquemas.

### Portadas con otro nombre o forma

| Legacy | Aquí | Nota |
|--------|------|------|
| `locations` | `geo_zones` | mismo rol: jerarquía administrativa con MultiPolygon SRID 4326 |
| `sessions` | `user_sessions` | aquí con rotación de refresh token y revocación explícita |
| `user_invitations` | `invitations` | aquí con `token_hash` y `accepted_at` como único estado de uso |
| `images` (polimórfica) | `comment_images` + `incident_images` | aquí con FK tipadas y `ON DELETE CASCADE` |

### No portadas, con motivo

| Legacy | Motivo |
|--------|--------|
| `menus`, `menu_permission` | los menús son config estática de UI, resuelta en `backend/src/modules/menus/menu-map.ts` y filtrada por permisos |
| `role_permission` (pivot) | aquí los permisos viven en `roles.permissions` JSONB + caché Redis, con `users.permission_version` como mecanismo de invalidación |
| `incident_claims`, `incident_organization_assignments`, `incident_verifications` | el propio legacy los eliminó antes de su estado final |
| `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` | infraestructura de Laravel, reemplazada por Redis / Redis Streams |
| Triggers `log_incident_status`, `auto_assign_location`, `notify_on_status_change` | responsabilidad movida a la capa de aplicación: `IncidentStatusHistoryListener` (con `event_id` para idempotencia), `GeofencingService.resolveZone()` y `IncidentNotificationsListener` (que además emite por Socket.IO) |

### Gaps — estado post-T7 (2026-08-24)

✅ **T7.1–T7.9.B completadas**:

| Gap | Solución |
|-----|----------|
| Tabla de tracking `schema_migrations` | 0030: ✅ tabla creada + backfill de 0001–0029 |
| `deleted_at` | 0031: ✅ agregada a 13 tablas (roles + 12 más) con índices parciales |
| `updated_at` | 0032: ✅ agregada a 15 tablas con trigger `set_updated_at()` |
| `comments.parent_id` | 0033: ✅ self-FK con depth-2 limit, cascada soft-delete, respuesta a comentarios operacional |
| Jerarquía de organizaciones + ruteo por categoría | 0034: ✅ `parent_id` en orgs, `incident_category_id`, fix routing (ahora atraviesa zone + category ancestors) |
| `geo_zones.code`, `users.phone` | 0035: ✅ columnas añadidas con validaciones |
| Trigger `check_is_leaf_category` | 0036: ✅ trigger + FK normalization (4 FK ajustadas) |
| Índices de paridad | 0037: ✅ 4 índices faltantes agregados; otros 5 cubiertos por migraciones/constraints previas |
| Árbol de categorías | 0038: ✅ 22 categorías sembradas (5 roots + 17 leaves) con idempotencia |
| Permisos de `notifications` | 0039: ✅ (READ, UPDATE) añadidos a catálogo + otorgados a 4 staff roles |
| Renombre de roles (claridad) | 0040: ✅ `master`, `admin_org`, `operador_org` (names alineados con responsabilidades) |

✅ **T7.9.C–D completadas**:

| Tarea | Descripción | Migración / Seeder |
|------|-------------|-------------|
| Geografía: parroquias Santa Elena | 11 parroquias desde OSM (ODbL 1.0), codigo EC-24-0[1-6]-[50-56], ST_Multi geometry | 0041 |
| Organizaciones semilla | CTE - Santa Elena, zone_id→EC-24-01, parent_id NULL, idempotente ON CONFLICT | 0041 |
| Backfill geo_zones.code | Rellena código en 4 zonas preexistentes (EC-24, EC-24-01/02/03) para que parroquias resuelvan parent_id | 0041 |
| Usuarios demo | 6 usuarios con 3 roles + anónimo, password-secured | `database/seeds/users.js` |
| Volumen de incidentes | 1000 incidentes [VOL] prefixed, escritura bulk + idempotente | `database/seeds/volume-incidents.js` |
| Feed rebuild | NestFactory hook en-proceso, captura todas las entradas posteriores a seed | `src/main.ts` init |
| Npm scripts | `db:migrate`, `db:seed`, `npm test:e2e` integrados + documentados | `backend/package.json` |

Detalles completos, arquitectura, y diseño en `openspec/changes/archive/2026-08-24-t7-database-schema-parity/`.

---

## Gotchas Clave

### Específicos de Supabase

1. **Extensión PostGIS**: no viene habilitada por defecto.
   - `0002_add_postgis_and_geo_zones.sql` ejecuta `CREATE EXTENSION IF NOT EXISTS postgis`.
   - Verificar con `SELECT postgis_version();` y comprobar disponibilidad de índices GIST
     (requeridos por `ST_Contains` / `ST_DWithin`).
   - PostGIS 3.4 disponible en Supabase PostgreSQL 16 ✅ (verificado).

2. **Connection pooling**: Supabase usa pgBouncer (20 conexiones por rol por
   defecto). Con 5+ instancias de NestJS manteniendo 5 conexiones cada una se
   supera el límite. Ajustar el pool por `.env` o subir de tier.

3. **Cascadas de foreign key**: Supabase enforcea las FK estrictamente. El
   inventario tras T7 (41 migraciones, con migración 0036 normalizando lo que
   se detectó sin cláusula explícita):

   | Comportamiento | Ocurrencias (post-0036) |
   |----------------|--------------------------|
   | `ON DELETE CASCADE` | 8 |
   | `ON DELETE SET NULL` | 11 |
   | `ON DELETE RESTRICT` | 6 (incremento tras 0036) |
   | sin cláusula (`NO ACTION` implícito) | **0** |

   La auditoría real (T7 D7.7) encontró **4** FKs con `ON DELETE` ausente
   (no 6 como estimaba el plan original — deviation documentada en
   `openspec/changes/archive/2026-08-24-t7-database-schema-parity/design.md` D13).
   La migración 0036 las normalizó y resolvió las dos inconsistencias que el
   plan original había identificado entre migraciones (`roles(id)` con
   `SET NULL` vs `RESTRICT`, e `incident_categories(id)` igual).

4. **`CREATE INDEX CONCURRENTLY` no funciona dentro de transacción.** Nuestras
   migraciones van envueltas en `BEGIN/COMMIT`, así que todos los índices se crean
   de forma bloqueante. Con el volumen actual es irrelevante; si algún día deja de
   serlo, hay que sacar ese `CREATE INDEX` de la transacción.

### De TypeORM

5. **`synchronize: false` y `migrationsRun: false` en todos los entornos** (CC3 —
   Manual Migration Integrity). La aplicación **nunca** modifica el esquema. Si una
   entidad y el esquema divergen, el error aparece en runtime, no se autocorrige.

6. **`@UpdateDateColumn` / `@DeleteDateColumn` no son fiables aquí**: buena parte
   de las escrituras del proyecto son SQL crudo vía repositorios
   (`incidents.repository.ts`, `organizations.repository.ts`) que no pasan por el
   EntityManager. Por eso el soft delete se implementa a mano (`deleted_at` +
   filtro `AND deleted_at IS NULL` en cada query) y `updated_at` se resolverá por
   trigger en 0032.

---

## Ejecución de migraciones

### Producción / staging (Supabase) — camino real

Manual. El operador copia el contenido de cada `.sql` en el editor SQL de
Supabase y lo ejecuta **en orden numérico**, verificando el resultado y
registrando la fila correspondiente en `database/MIGRATION_LOG.md`
(Status, Applied By, Applied Date, Environment).

No hay automatismo: es una decisión explícita (CC3), no una carencia.

### CLI runner — `backend/scripts/run-migrations.ts`

✅ Operacional (T7.1.B). Soporta:
- **Default (validación)**: `npm run db:migrate` — Valida checksums contra `schema_migrations` tabla
- **Status**: `npm run db:migrate:status` — Lista migraciones aplicadas/pendientes
- **Rollback**: `npm run db:rollback -- <version>` — Revierte hasta versión indicada (inclusive)

Prerequisito: 0030 debe estar aplicada (crea `schema_migrations` table con tracking).

### Desarrollo local

`docker compose up -d postgres` levanta `postgis/postgis:16-3.4` vacío:

```bash
for f in database/migrations/[0-9]*.sql; do
  docker exec -i tase-postgres psql -U postgres -d transito_alerta \
    -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

O usar el runner: `npm run db:migrate` (después de `npm install`).

### Tests y CI

`backend/test/support/migration-harness.ts` aplica **todos** los
`database/migrations/[0-9]*.sql` en orden numérico contra un Postgres de
Testcontainers vacío, en cada corrida de e2e. Usa el simple query protocol de
`pg` (un `client.query(sql)` por archivo), que admite varias sentencias
separadas por `;` igual que `psql -f`.

Es la prueba de que el camino manual funciona desde cero. **No tiene tracking ni
idempotencia**: siempre aplica todo, siempre desde una base vacía.

El job `migrations` de `.github/workflows/ci.yml` corre lo mismo en cada PR, así
que un archivo roto se detecta antes de pegarlo en Supabase.

### Datos de referencia y seeds

✅ **Pipeline de seeds operativo** (T7.9.D + 0041). `database/seeds/` contiene:

- `generate-geo-zones-seed.js` → `0003_seed_geo_zones.generated.sql` (Santa Elena + 3 cantones)
- `0004_seed_parroquias.generated.sql` (11 parroquias Santa Elena, datos OSM)
- `users.js` — 6 usuarios demo (3 roles + anónimo), idempotente
- `demo-incidents.js` — ~25 incidentes realistas en los 3 cantones, idempotente por título
- `volume-incidents.js` — 1000 incidentes `[VOL]` con ciclo de vida completo (asignaciones, historial, aprobaciones, comentarios anidados, notificaciones), auto-skip si la base ya tiene ese volumen
- `lib/` — helpers compartidos por los seeds anteriores

Npm scripts (`backend/package.json`):
- `pnpm run db:seed` → corre `users.js` + `demo-incidents.js` + `rebuild-feed.ts`
- `pnpm run db:seed:mass` → `db:seed` + `volume-incidents.js` + `rebuild-feed.ts`

El rebuild del feed de Redis es necesario porque los seeds escriben directo en
Postgres sin pasar por los listeners de Redis Streams. Sin ese paso, el feed
queda inconsistente con la tabla `incidents`.

**Estado de las tablas de catálogo tras T7.9 + 0041:**

- `incident_categories` — ✅ 22 categorías sembradas (5 raíces + 17 hojas) por migración 0038, idempotente
- `organizations` — ✅ 1 fila (CTE - Santa Elena) por migración 0041, idempotente
- `geo_zones` — ✅ 15 filas (1 provincia + 3 cantones + 11 parroquias) entre 0003 y 0041
- `roles` — ✅ 5 filas (reporter + 4 staff) entre 0009, 0015 y 0040
- `permissions` — ✅ 40+ filas en 10 migraciones distintas (catálogo de RBAC)
- `users` — ⚠️ sin sembrar en producción (1 fila anónima en 0001; el resto entra por invitación)

La regla que fija T7 para no repetir la mezcla de legacy:

| Clase de dato | Ejemplos | Dónde vive | ¿Va a producción? |
|---------------|----------|------------|-------------------|
| Referencia | categorías, permisos, roles, geo_zones, organizaciones reales | `database/migrations/` | ✅ sí |
| Demo / volumen | incidentes de muestra, usuarios de prueba, data de load test | `database/seeds/` | ❌ nunca |

---

## Estrategia de Cutover

### 1. Validación pre-cutover

- [x] Aplicar 0001–0029 contra Supabase — hecho el 2026-08-24
- [x] Aplicar 0030, 0031, 0039, 0040 contra Supabase — hecho el 2026-08-25
      (las restantes 0032–0038 y 0041 están ⏳ Pending en `database/MIGRATION_LOG.md`,
      bloqueadas por ventana de mantenimiento; ver `docs/runbooks/apply-0041.md`)
- [x] Verificar que el esquema coincide con las entidades NestJS: la suite e2e
      (**399 tests, 45 suites**) arranca la app contra un Postgres real con
      las migraciones aplicadas (Testcontainers)
- [x] Verificar disponibilidad de PostGIS (`ST_Contains`, `ST_DWithin`, `ST_Distance`)
- [x] DB-level de D7.7 cerrado: trigger `check_is_leaf_category` + normalización
      de 4 FKs en migración 0036. **Verificación sistemática** (recorrido
      programático de las 30+ FKs) → **scope de T8** (`t8-database-cutover`
      R32–R35)
- [x] DB-level de D7.1 Fase C cerrado: 41 archivos `.DOWN.sql` con cobertura
      verificada por `diff` y ciclo up/down ejercitado por
      `test/migrations/rollback-cycle.e2e-spec.ts`. **Auditoría sistemática
      de correctitud** → **scope de T8** (R36–R37)

### 2. Período dual-write (opcional, 1 semana)

Laravel y NestJS escribiendo sobre la misma base. Monitorear conflictos (poco
probables si se mantiene la separación de FK).

Nota: de los cuatro triggers del legacy, **sólo `check_is_leaf_category` está
portado** (migración 0036, T7 D7.7) porque codifica un invariante de datos
que no queremos re-implementar en cada servicio. Los otros tres
(`log_incident_status`, `auto_assign_location`, `notify_on_status_change`)
se rechazaron deliberadamente — su responsabilidad vive en la capa de
aplicación NestJS (`IncidentStatusHistoryListener` con `event_id` para
idempotencia, `GeofencingService.resolveZone()`, `IncidentNotificationsListener`).
Durante un dual-write real sobre una base compartida, las escrituras de
NestJS no dispararían el historial de estados ni la asignación automática
de ubicación que Laravel espera de la base; el trigger de hoja sí
dispararía para ambos stacks (consistente). Si se opta por dual-write,
hay que tener en cuenta esta asimetría o descartar la estrategia.

### 3. Ventana de cutover (30 min)

- [ ] Detener la API Laravel (avisar a usuarios, página de mantenimiento)
- [ ] Ejecutar scripts finales de migración de datos (ej. backfill de emails)
- [ ] Aplicar migraciones pendientes
- [ ] Verificar integridad del esquema (contra `MIGRATION_LOG.md`, y contra
      `schema_migrations` una vez exista 0030)
- [ ] Levantar la API NestJS + health checks
- [ ] Monitorear 1 hora (objetivo: sin 5xx nuevos)
- [ ] Rollback: restore point-in-time de Supabase + reiniciar Laravel

### 4. Monitoreo post-cutover (48 h)

- [ ] Registrar errores de BD (violaciones de FK, fallas de constraint)
- [ ] Monitorear tiempos de respuesta contra el baseline de load test
- [ ] Vigilar deletes en cascada (registrar cualquier borrado inesperado)

---

## Criterios de Éxito

> Verificación 2026-08-26: 856/856 unit + 399/399 e2e + typecheck limpio + lint 0 errores.
> Lo marcado `[x]` son los criterios de T7 (ya cerrados en código y CI).
> Lo marcado `[ ]` pertenece al change `t8-database-cutover` (en propuesta, no iniciado).

### Cerrados por T7 (verificado 2026-08-26)

- [x] 0001–0041 existen en disco (41/41)
- [x] 0001–0029 aplicadas y verificadas en Supabase (T1–T6)
- [x] 0030, 0031, 0039, 0040 aplicadas en Supabase (2026-08-25)
- [x] 0001–0029 aplican limpio sobre una base vacía en cada corrida de CI y de e2e
- [x] La app NestJS bootea contra el esquema real con `synchronize: false` y
      `migrationsRun: false` (suite e2e de 399 tests arranca la app contra
      un Postgres real con las migraciones aplicadas)
- [x] `schema_migrations` existe (0030) y es la fuente de verdad programática
      del estado aplicado (T7.1). El runner CLI la lee y la escribe; los
      scripts `db:migrate`/`db:migrate:status` la consultan
- [x] Cobertura de rollback: 41 archivos `.sql` ↔ 41 archivos `.DOWN.sql`
      (verificado por `diff`, T7.1.C3)
- [x] Ciclo up/down ejercitado: `backend/test/migrations/rollback-cycle.e2e-spec.ts`
      pasa en CI contra un Testcontainers con todas las migraciones aplicadas
- [x] Suite completa verde: 856 unit + 399 e2e = **1 255 tests** (2026-08-26)

### Pendientes (scope del change `t8-database-cutover`)

- [ ] Cero violaciones de FK en las primeras 24 h post-cutover (R33–R35 de T8)
- [ ] Backup probado: restaurar desde snapshot y verificar integridad de datos
      (R29 de T8, contra staging de Supabase)
- [ ] Audit sistemática de correctitud de los 41 archivos DOWN (R37 de T8)
- [ ] Runbook de cutover ejecutable (R27 de T8, `docs/runbooks/cutover.md`)
- [ ] Queries de monitoreo post-cutover (R30 de T8, `database/monitoring/queries.sql`)
- [ ] Rehearsal dry-run contra staging ejecutado (R29 de T8)
- [ ] Aplicación de 0032–0038 y 0041 a Supabase producción (bloqueada por
      ventana de mantenimiento, ver `docs/runbooks/apply-0041.md`)

---

## Correcciones respecto de la versión anterior

| Decía | Realidad |
|-------|----------|
| Esquema en 0001–0016, con 0009–0010 "recién commiteadas" y 0011–0016 "pendientes de auditoría" | Van 29 migraciones, todas aplicadas en Supabase |
| Existe `backend/scripts/run-migrations.ts` con tabla `schema_migrations`, aplicación idempotente y rollback por archivos DOWN | No existe. Lo único real es `backend/test/support/run-migrations.ts`, que aplica todo desde cero sin tracking. El runner descrito es trabajo pendiente (T7 D7.1) |
| Existen los scripts `pnpm run db:migrate` | No existen en `backend/package.json` |
| "72 migraciones GeoReporta → ~20 migraciones NestJS" | El mapeo medido es 72 → 29 aplicadas (+10 planificadas = 39) |
| 0014 = "locations / geo_zones_triggers" | 0014 es `status_history`. La jerarquía de geo_zones es 0013, y **no hay ningún trigger** en el esquema |
| Enumeraba las migraciones por tarea del roadmap (T3.x) | El mapeo tarea↔migración está en `database/MIGRATION_LOG.md`, que es la fuente de verdad; aquí sólo se resume por rango |
| (versión 2026-08-26 anterior) Inventario de FK reportado con "29 migraciones" y "6 sin cláusula ON DELETE" | La auditoría real (T7 D7.7) encontró **4** FK sin cláusula, no 6 (deviation documentada en `design.md` D13). Migración 0036 normalizó las 4. Stock post-0036: 0 FK con `NO ACTION` implícito |
| (versión 2026-08-26 anterior) Rollback "40/40" | 41/41, verificado por `diff` (T7.1.C3 cerrado, T7.1.B4/B5 runner `--down` ya existía) |
| (versión 2026-08-26 anterior) Suite e2e "242 tests, 29 suites" | 399/399 tests, 45 suites (2026-08-26) — el delta viene de los e2e de T7 (`t7-comment-threading`, `t7-domain-columns`, `t7-geography-orgs-seed`, `t7-index-parity`, `t7-notification-permissions`, `t7-org-hierarchy-categories`, `t7-reference-data`, `t7-referential-integrity`, `t7-seeding-pipeline`, `t7-users-seed`, `t7-volume-seed`) + los 4 specs de `test/migrations/` |
| (versión 2026-08-26 anterior) "Lo que todavía no existe: runner, schema_migrations, scripts db:migrate" | Todo existe y es operacional desde 2026-08-25 (verificado en este sync) |
| (versión 2026-08-26 anterior) `database/seeds/` con un solo generador (`generate-geo-zones-seed.js`) y "no hay orden de seeding" | Pipeline completo: `users.js`, `demo-incidents.js`, `volume-incidents.js`, `generate-geo-zones-seed.js`, `0004_seed_parroquias.generated.sql`. Scripts npm `db:seed` y `db:seed:mass` |
| (versión 2026-08-26 anterior) "Dos tablas de catálogo creadas pero vacías" (`incident_categories` y `organizations`) | 0038 sembró 22 categorías; 0041 sembró la organización CTE - Santa Elena. `incident_categories` y `organizations` ya no están vacías |
| (versión 2026-08-26 anterior) "los cuatro triggers del legacy no existen aquí" | 0036 portó `check_is_leaf_category` (único invariante de datos que debe vivir en la BD); los otros 3 se rechazaron deliberadamente y viven en la capa de aplicación |
| (versión 2026-08-26 anterior) Criterios de Éxito: `schema_migrations` y `Rollback probado` como `[ ]` | Ambos cerrados: tabla existe (0030), runner la usa, 41/41 archivos DOWN, ciclo up/down ejercitado en CI. Reclasificados a T7-cerrados con verificación 2026-08-26 |
