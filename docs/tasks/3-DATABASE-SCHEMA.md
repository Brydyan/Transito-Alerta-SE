# 3: Esquema de Base de Datos y Auditoría de Migración

> **Última actualización**: 2026-08-24 — refleja el estado real tras cerrar T7
> (`t7-database-schema-parity`). Las migraciones 0030–0039 son nuevas; 0001–0029
> se aplicaron en T6. Runner en `backend/scripts/run-migrations.ts` existe y es operacional.

## Migración GeoReporta → Transito-Alerta-SE

Las 72 migraciones Laravel de `GeoReporta/backend/database/migrations/` se
auditaron contra nuestras migraciones SQL. El mapeo real medido es
**72 migraciones legacy → 40 archivos SQL** (0001–0040, con T7 completada).

La consolidación viene de que Laravel genera una migración por cambio incremental
(muchas son `add_column` de una sola columna, y varias se cancelan entre sí:
`create_incident_images_table` → `remove_incident_images_table` →
`create_images_table` → `drop_legacy_image_storage`), mientras que aquí se escribe
una migración por unidad de trabajo del roadmap.

---

## Estado real de las migraciones (2026-08-24)

- **0001–0029**: ✅ aplicadas y verificadas en Supabase (T1–T6). Fuente de verdad: `database/MIGRATION_LOG.md`.
- **0030–0040**: ✅ implementadas, committeadas, prontas para deployment (T7.1–T7.10). T7.9.C (orgs reales) bloqueada en espera de input del operador.

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
| 0038–0039 | T7.9.A–B | Reference data (22-category tree, notification permisos), T7.9.C/D bloqueada |
| 0040 | T7.10 | Renombre de roles: `admin_sistema` → `master`, `admin_organizacion` → `admin_org`, `operador_organizacion` → `operador_org` |

**16 tablas de dominio**: `assignments`, `comment_images`, `comments`, `geo_zones`,
`incident_categories`, `incident_images`, `incidents`, `invitations`,
`notifications`, `organizations`, `password_reset_tokens`, `permissions`, `roles`,
`status_history`, `user_sessions`, `users`.

### Rollback

`database/rollback/` tiene un archivo `.DOWN.sql` por cada migración (40/40).
✅ Todos testeados y validados via `backend/test/migrations/rollback-cycle.e2e-spec.ts` (T7.1.C).
El runner CLI soporta `--down --to <version>` y npm script `db:rollback` para disaster recovery.

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

🚧 **T7.9.C–D bloqueadas**:

| Gap | Bloqueador | Migración |
|-----|-----------|-----------|
| Organizaciones reales (Santa Elena) | Input operador (Andy) — lista de GAD + sucursales | 0039 (partial) |
| Nivel `parroquia` en geo_zones | Depende de C1 | 0039 (partial) |
| Datos de demo/volumen | No crítico | `database/seeds/` |

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
   inventario real de nuestras 29 migraciones:

   | Comportamiento | Ocurrencias |
   |----------------|-------------|
   | `ON DELETE CASCADE` | 8 |
   | `ON DELETE SET NULL` | 11 |
   | `ON DELETE RESTRICT` | 2 |
   | sin cláusula (`NO ACTION` implícito) | **6** |

   Además hay dos inconsistencias entre migraciones: `roles(id)` está referenciada
   una vez con `SET NULL` y otra con `RESTRICT`, e `incident_categories(id)`
   igual. Normalizar todo esto es tarea de T7 (migración 0036).

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

`database/seeds/` contiene hoy un solo generador: `generate-geo-zones-seed.js`, que
produce `0003_seed_geo_zones.generated.sql` (4 filas: Santa Elena + 3 cantones).

El resto de los datos de referencia está **disperso dentro de las migraciones**:
los roles se siembran en 0009 y 0015, y las filas del catálogo de permisos en diez
migraciones distintas (0009, 0012, 0013, 0014, 0015, 0016, 0018, 0019, 0024, 0029).
No hay orden de seeding declarado ni forma de re-sembrar un entorno.

Dos tablas de catálogo están **creadas pero vacías**: `incident_categories` (legacy
siembra 23 categorías) y `organizations` (legacy siembra 5 GAD + 6 sucursales).
Sin árbol de categorías no se puede clasificar un incidente.

La regla que fija T7 para no repetir la mezcla de legacy:

| Clase de dato | Ejemplos | Dónde vive | ¿Va a producción? |
|---------------|----------|------------|-------------------|
| Referencia | categorías, permisos, roles, geo_zones, organizaciones reales | `database/migrations/` | ✅ sí |
| Demo / volumen | incidentes de muestra, usuarios de prueba, data de load test | `database/seeds/` | ❌ nunca |

### Lo que todavía no existe

No hay `backend/scripts/run-migrations.ts`, no hay tabla `schema_migrations` y no
hay scripts `db:migrate` / `db:rollback` en `backend/package.json`. Están
especificados en `openspec/changes/infra/t7-database-schema-parity/` (D7.1) con
detección de drift por checksum y modo `--status`.

---

## Estrategia de Cutover

### 1. Validación pre-cutover

- [x] Aplicar 0001–0029 contra Supabase — hecho el 2026-08-24
- [x] Verificar que el esquema coincide con las entidades NestJS: la suite e2e
      (242 tests, 29 suites) arranca la app contra un Postgres real con las 29
      migraciones aplicadas
- [x] Verificar disponibilidad de PostGIS (`ST_Contains`, `ST_DWithin`, `ST_Distance`)
- [ ] Probar integridad referencial de forma sistemática — pendiente, T7 D7.7
- [ ] Ejercitar el rollback completo — pendiente, T7 D7.1 Fase C

### 2. Período dual-write (opcional, 1 semana)

Laravel y NestJS escribiendo sobre la misma base. Monitorear conflictos (poco
probables si se mantiene la separación de FK).

Nota: los cuatro triggers del legacy no existen aquí. Durante un dual-write real
sobre una base compartida, las escrituras de NestJS **no** dispararían el
historial de estados ni la asignación automática de ubicación que Laravel espera
de la base. Si se opta por dual-write, hay que instalar esos triggers
temporalmente o descartar la estrategia.

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

- [x] 0001–0029 aplican limpio sobre Supabase
- [x] 0001–0029 aplican limpio sobre una base vacía en cada corrida de CI y de e2e
- [x] La app NestJS bootea contra el esquema real con `synchronize: false`
- [ ] Cero violaciones de FK en las primeras 24 h post-cutover
- [ ] Backup probado: restaurar desde snapshot y verificar integridad de datos
- [ ] Rollback probado: ciclo completo up/down deja la base limpia
- [ ] `schema_migrations` como fuente de verdad programática del estado aplicado

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
