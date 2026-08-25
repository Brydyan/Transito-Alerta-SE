# T7 — ARCHIVED (Partial) — 2026-08-24

**Status**: T7.1–T7.9.B complete (4 apply batches, all Strict TDD, all green).
T7.9.C/D blocked on operator input (real Santa Elena organization list) and
not reached this cycle, respectively. See
`openspec/changes/archive/2026-08-24-t7-database-schema-parity/archive-report.md`
for the full compliance breakdown and next steps.

---

# Tasks: T7 — Database Schema Parity & Hardening

**Change**: t7-database-schema-parity
**Date**: 2026-08-24
**Mode**: Strict TDD (`npm test && npm run test:e2e` desde `backend/`)

> Orden de ejecución: D7.1 → D7.2 → D7.3 → D7.4 → D7.5 → D7.6 → D7.7 → D7.8 → D7.9
> Cada grupo arranca sólo si el anterior deja la suite completa en verde.
> Dentro de cada grupo el orden de fases es **Migration → Entity → Repository →
> Service → Controller → Tests**, salvo donde Strict TDD exige el test primero
> (marcado con 🔴 = test que debe fallar antes de implementar).
>
> Ninguna tarea se marca `[x]` en esta fase — eso es de la fase apply.

---

## D7.1 — Tooling de migraciones y saneamiento del log

### Fase A — Tabla de tracking (migración 0030)

- [x] **T7.1.A1** — 🔴 Crear `backend/test/e2e/t7-migration-tracking.e2e-spec.ts` con los escenarios R1.1–R1.4: tabla `schema_migrations` con las 4 columnas, backfill de 0001–0029 sobre esquema poblado, backfill vacío sobre base limpia, re-ejecución idempotente. Debe fallar. **(2h)** ✅ 063cc28
- [x] **T7.1.A2** — Escribir `database/migrations/0030_schema_migrations.sql`: `CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(8) PK, name text, checksum char(64), applied_at timestamptz DEFAULT now())` + backfill condicional de 0001–0029 con `WHERE EXISTS (… table_name='incidents')` y `ON CONFLICT DO NOTHING`, dentro de `BEGIN/COMMIT`. **(1.5h)** ✅ 063cc28
- [x] **T7.1.A3** — Escribir `database/rollback/0030_schema_migrations.DOWN.sql` (`DROP TABLE IF EXISTS schema_migrations`). **(15min)** ✅ 063cc28

### Fase B — Runner idempotente

- [x] **T7.1.B1** — 🔴 Crear `backend/test/e2e/t7-migration-runner.e2e-spec.ts` con R2.1–R2.4: aplica sólo pendientes, segunda corrida no-op, falla estricta con rollback y exit ≠ 0, detección de drift por checksum. Debe fallar. **(2h)** ✅ 063cc28
- [x] **T7.1.B2** — Crear `backend/scripts/run-migrations.ts` según §4 del design: conexión por `DATABASE_URL`, `CREATE TABLE IF NOT EXISTS schema_migrations`, orden numérico, `sha256` del contenido, skip de versiones registradas, `BEGIN`/`COMMIT` por archivo, `exit 1` en el primer error sin continuar. **(2h)** ✅ 063cc28
- [x] **T7.1.B3** — Añadir a `run-migrations.ts` el modo `--status` (lista aplicadas / pendientes / drift, sin ejecutar nada) y el reconocimiento del checksum comodín `'manual'`. **(1h)** ✅ 063cc28
- [x] **T7.1.B4** — Añadir a `run-migrations.ts` el modo `--down --to <version>`: lee `database/rollback/` en orden inverso, ejecuta hasta la versión indicada, borra la fila de `schema_migrations` de cada una. **(1.5h)** ✅ b152515
- [x] **T7.1.B5** — Añadir a `backend/package.json` los scripts `db:migrate`, `db:migrate:status` y `db:rollback`. **(15min)** ✅ b152515

### Fase C — Rollback ejercitado

- [x] **T7.1.C1** — 🔴 Crear `backend/test/e2e/t7-rollback-cycle.e2e-spec.ts` (R3.1): aplicar 0001→0039 y luego todos los DOWN en orden inverso; assert de que no queda ninguna tabla de dominio ni ninguna función/trigger creado por las migraciones. Se ejecutará contra un container dedicado por su costo. Debe fallar hasta que existan los DOWN de 0030–0039. **(2h)** ✅ 063cc28
- [x] **T7.1.C2** — Añadir a ese spec el check R3.2: por cada archivo `database/migrations/00{30..39}_*.sql` existe el `.DOWN.sql` homónimo. **(30min)** ✅ 063cc28
- [ ] **T7.1.C3** — Corregir los archivos DOWN existentes (0001–0029) que el ciclo del test revele como incompletos. Documentar cada corrección en `MIGRATION_LOG.md`. **(2h)**

### Fase D — Documentación

- [x] **T7.1.D1** — Corregir `database/MIGRATION_LOG.md`: 0024–0029 pasan de `⏳ Pending` a `✅ Applied`, operador Andy Alejandro, fecha 2026-08-24, entorno supabase (R4.1). **(30min)** ✅ 063cc28
- [ ] **T7.1.D2** — Actualizar `docs/tasks/3-DATABASE-SCHEMA.md` (R18.1): rango real 0001–0039, mapeo 72 legacy → 39 SQL, runner real en `backend/scripts/run-migrations.ts`, tabla `schema_migrations`, y eliminar la afirmación de que ese runner ya existía. **(1h)**

---

## D7.2 — Soft delete completo (migración 0031)

### Fase A — Migración

- [x] **T7.2.A1** — 🔴 Crear `backend/test/e2e/t7-soft-delete-schema.e2e-spec.ts` con R5.1–R5.3: `deleted_at` en las 12 tablas, índice parcial por tabla, filas preexistentes con `deleted_at IS NULL`. Debe fallar. **(1.5h)** ✅ cbbf769
- [x] **T7.2.A2** — Escribir `0031_soft_delete_completeness.sql`: `ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL` en `comments`, `notifications`, `organizations`, `incident_categories`, `geo_zones`, `user_sessions`, `users`, `invitations`, `password_reset_tokens`, `permissions`, `assignments` (pre-0026) + índices parciales `WHERE deleted_at IS NULL`. **(1.5h)** ✅ cbbf769
- [x] **T7.2.A3** — Escribir `0031_…DOWN.sql` (drop de los índices y las columnas). **(30min)** ✅ cbbf769

### Fase B — Entidades y Repositorios (app-level)

- [ ] **T7.2.B1** — Añadir `deletedAt: Date | null` a 12 entidades: `comment`, `organization`, `incident-category`, `geo-zone`, `invitation`, `password-reset-token`, `notification`, `permission`, `user-session`, `user` con patrón `@Column({ name:'deleted_at', type:'timestamptz', nullable:true })`. **(1h)** ⏳ app-level
- [ ] **T7.2.B2** — Aplicar filtro `deleted_at IS NULL` a todos los repositorios: `comments`, `notifications`, `organizations`, `geo-zones`, `incident-categories`, `user-sessions`, `users`, `invitations`, `password-reset-tokens`, `permissions`. **(3h)** ⏳ app-level

### Fase C — Tests E2E (app-level)

- [ ] **T7.2.C1** — E2E soft-delete: DELETE / 204 + persist + exclude from list + cascade en `comment_images`. **(2h)** ⏳ app-level
- [ ] **T7.2.C2** — E2E notificaciones: soft-deleted fuera de `unread-count`. **(1h)** ⏳ app-level
- [ ] **T7.2.C3** — E2E org/categorías/zonas: soft-deleted fuera de ruteo y filtros. **(2h)** ⏳ app-level
- [ ] **T7.2.C4** — E2E auth: soft-deleted roles/permisos no otorgan acceso tras bump de versión. **(1h)** ⏳ app-level

---

## D7.3 — Columnas `updated_at` y trigger (migración 0032)

- [ ] **T7.3.A1** — 🔴 Crear `backend/test/e2e/t7-updated-at.e2e-spec.ts` con R8.1–R8.4: función `set_updated_at` existe, UPDATE la actualiza sin mencionarla, INSERT la iguala a `created_at`, hay un trigger por cada tabla con la columna. Debe fallar. **(1.5h)**
- [ ] **T7.3.A2** — Escribir `0032_updated_at_columns.sql`: `ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` en las 12 tablas (`assignments`, `comments`, `geo_zones`, `notifications`, `organizations`, `permissions`, `roles`, `invitations`, `comment_images`, `incident_images`, `password_reset_tokens`, `user_sessions`). NO tocar `status_history` — es append-only por diseño. **(1h)**
- [ ] **T7.3.A3** — Añadir a 0032 la función `set_updated_at()` y un `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER trg_set_updated_at BEFORE UPDATE … FOR EACH ROW` por cada tabla que tenga la columna (las 12 nuevas más `incidents`, `users`, `incident_categories` = 15 triggers). **(1.5h)**
- [ ] **T7.3.A4** — Escribir `0032_…DOWN.sql` (drop de triggers, de la función y de las 11 columnas). **(45min)**
- [ ] **T7.3.A5** — Añadir `updatedAt` con `update: false` a las entidades de la tabla §3 del design. **(1h)**
- [ ] **T7.3.A6** — Auditar los repositorios y servicios: eliminar toda escritura manual de `updated_at` en statements `UPDATE` (R8.5). Verificar con grep que no queda ninguna. **(1.5h)**
- [ ] **T7.3.A7** — Unit tests de los repositorios tocados: los `UPDATE` generados ya no incluyen `updated_at`. **(1h)**

---

## D7.4 — Comentarios anidados (migración 0033)

- [x] **T7.4.A1** — 🔴 Crear `backend/test/e2e/t7-comment-threading.e2e-spec.ts` con R9.1–R9.6. Debe fallar. **(2h)** ✅ (extendido a R9.1–R9.8, TestEnvironment full-stack en vez de MigrationHarness)
- [x] **T7.4.A2** — Escribir `0033_comments_threading.sql`: `parent_id uuid NULL REFERENCES comments(id) ON DELETE CASCADE`, `CHECK (parent_id IS DISTINCT FROM id)`, índice sobre `parent_id`. **(1h)**
- [x] **T7.4.A3** — Escribir `0033_…DOWN.sql`. **(15min)**
- [x] **T7.4.A4** — Añadir `parentId: string | null` a `comment.entity.ts`. **(30min)** (+ `deletedAt`, requerido por T7.4.A8)
- [x] **T7.4.A5** — Añadir `parent_id?: string` con `@IsOptional() @IsUUID()` a `create-comment.dto.ts`. **(30min)**
- [x] **T7.4.A6** — 🔴 Unit tests en `comments.service.spec.ts`: rechaza `parent_id` de otro incidente (400), **acepta** responder a una respuesta (profundidad 2), rechaza responder a un comentario de profundidad 2 (400). Deben fallar. **(1h)**
- [x] **T7.4.A7** — `comments.service.ts`: validar pertenencia del padre al mismo incidente y **profundidad máxima 2** antes de insertar (regla de legacy: `MAX_COMMENT_DEPTH = 2`). Calcular la profundidad igual que el accessor de legacy: sin padre → 0, padre sin padre → 1, resto → 2. **(1.5h)**
- [x] **T7.4.A8** — `comments.service.ts`: cascada de soft delete con `WITH RECURSIVE` sobre `parent_id` — con profundidad 2 hay nietos, así que la sentencia de un solo nivel no alcanza (R9.8). **(1.5h)** (`delete()` pasa de hard delete a soft delete — adelanta parte de T7.2.B1/C1 sólo para `comments`)
- [x] **T7.4.A9** — Incluir `parent_id` y la profundidad calculada en la respuesta del listado de comentarios (R9.7) y verificar que `SnakeCaseResponseInterceptor` los serializa correctamente. **(1.5h)**

---

## D7.5 — Jerarquía de organizaciones y ruteo por categoría (migración 0034)

### Fase A — Migración y entidad

- [x] **T7.5.A1** — 🔴 Crear `backend/test/e2e/t7-org-hierarchy-categories.e2e-spec.ts` con R10.1, R10.3, R11.1. Debe fallar. **(1.5h)** (extendido a R10.1–R10.3, R11.1–R11.10)
- [x] **T7.5.A2** — Escribir `0034_organizations_hierarchy_categories.sql`: `organizations.parent_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL` + `CHECK (parent_id IS DISTINCT FROM id)` + índice; **`organizations.incident_category_id uuid NULL REFERENCES incident_categories(id) ON DELETE SET NULL`** (NO tabla pivot — ver D7) + índice `(zone_id, incident_category_id)`. **(1.5h)**
- [x] **T7.5.A2b** — En la misma 0034: **eliminar** `uq_organizations_zone`. El modelo de legacy tiene varias organizaciones a distintos niveles del árbol de ubicaciones, todas notificadas para el mismo incidente; un UNIQUE por zona es incompatible con eso (no alcanza con hacerlo parcial por `parent_id`). Cubre R11.1 y R11.2. **(1h)** ⚠️ ver "Deviations" en apply-progress — R10.4/R10.5 del spec original describían una versión parcial, superseded por esta corrección
- [x] **T7.5.A3** — Escribir `0034_…DOWN.sql`. **(30min)**
- [x] **T7.5.A4** — Añadir `parentId` e `incidentCategoryId` a `organization.entity.ts`. No se crea entidad de pivot. **(45min)**

### Fase B — Jerarquía

- [x] **T7.5.B1** — 🔴 Unit tests de `organizations.service.spec.ts` → `tree()` devuelve estructura anidada por `parent_id`; detecta ciclo indirecto A→B→A al asignar padre. Deben fallar. **(1h)**
- [x] **T7.5.B2** — Reescribir `OrganizationsService.tree()` para construir el árbol desde `parent_id` (reemplaza la lista plana y su comentario de limitación T3.2). **(1.5h)**
- [x] **T7.5.B3** — Validar ciclos indirectos al setear `parent_id` desde el endpoint de actualización de organización → 400. **(1.5h)**
- [x] **T7.5.B4** — E2E R10.2: padre con dos hijas aparece anidado en `GET /organizations/tree`. **(1h)**

### Fase C — Ruteo por ancestría de ubicación y categoría

> Esta fase corrige un defecto de comportamiento heredado de T6, no sólo un gap de
> esquema: `notifiedFor` descarta `category_id`, no recorre la jerarquía de zonas,
> devuelve como mucho una organización y calcula `is_claimable` como
> `max_active_claims > 0` en vez de "es la que el auto-assign elegiría".

- [x] **T7.5.C1** — 🔴 Unit tests de `notifiedFor` cubriendo R11.3–R11.10: ancestría de ubicación, ancestría de categoría, org transversal (`incident_category_id IS NULL`), org de otra categoría excluida, `is_claimable` en exactamente una, array vacío, soft-deleted fuera, orden estable. Deben fallar. **(2h)**
- [x] **T7.5.C2** — `organizations.repository.ts`: implementar `findNotifiedFor(zoneId, categoryId)` con las dos CTE recursivas (`zone_chain` sobre `geo_zones.parent_id`, `cat_chain` sobre `incident_categories.parent_id`), el `OR incident_category_id IS NULL` y `ORDER BY created_at, id`. **(2.5h)**
- [x] **T7.5.C3** — `organizations.service.ts` → `notifiedFor`: usar el nuevo método; devolver **todas** las orgs notificadas; marcar `is_claimable` sólo en la primera del orden estable, que es la que el auto-assign elegiría. **(1.5h)**
- [x] **T7.5.C4** — Alinear el auto-assign de organización al crear incidente con el mismo criterio (`findForLocation` de legacy = primer elemento de `findNotifiedFor`), para que el badge "Principal" del formulario no mienta. **(2h)** (`OrganizationsService.findByZone` eliminado, reemplazado por `findNotifiedFor`)
- [x] **T7.5.C5** — E2E R11.3–R11.10 contra Postgres real, con un árbol de zonas de 3 niveles y un árbol de categorías de 2. **(2.5h)**
- [x] **T7.5.C6** — Endpoint de administración para asignar la categoría de una organización, protegido con `UPDATE organizations` (sin filas nuevas en el catálogo de permisos, ver proposal). **(1.5h)** (`PATCH /organizations/:id/category`)

---

## D7.6 — Columnas de dominio faltantes (migración 0035)

- [x] **T7.6.A1** — 🔴 Crear `backend/test/e2e/t7-domain-columns.e2e-spec.ts` con R12.1–R12.3 y R13.1–R13.3. Debe fallar. **(1.5h)** ✅
- [x] **T7.6.A2** — Escribir `0035_domain_columns.sql`: `geo_zones.code varchar(32) NULL` + índice UNIQUE parcial `WHERE code IS NOT NULL`; `users.phone varchar(30) NULL`. **(1h)** ✅
- [x] **T7.6.A3** — Escribir `0035_…DOWN.sql`. **(15min)** ✅
- [x] **T7.6.A4** — Añadir `code` a `geo-zone.entity.ts` y `phone` a `user.entity.ts`. **(30min)** ✅
- [x] **T7.6.A5** — Exponer `phone` en el DTO de perfil (`GET /users/me` y el update de perfil) con validación de formato. **(1h)** ✅
- [x] **T7.6.A6** — Añadir `phone: null` al wipe GDPR de `UsersService.softDelete()` y actualizar su unit test. **(45min)** ✅
- [x] **T7.6.A7** — Exponer `code` en las respuestas de geo-zones y permitir filtrar por él en el listado. **(1h)** ✅

---

## D7.7 — Integridad a nivel de base (migración 0036)

### Fase A — Auditoría previa (bloqueante)

- [x] **T7.7.A1** — Auditar `database/seeds/` y todos los fixtures de `backend/test/` en busca de incidentes creados con `category_id` de una categoría padre. Listar los hallazgos antes de escribir la migración. **(1.5h)** ✅ sin hallazgos — ver design.md D13
- [x] **T7.7.A2** — Corregir los seeds y fixtures que el paso anterior detecte, para que usen categorías hoja. **(1.5h)** ✅ nada que corregir (A1 no encontró incidentes en categoría no-hoja)

### Fase B — Trigger de categoría hoja

- [x] **T7.7.B1** — 🔴 Crear `backend/test/e2e/t7-referential-integrity.e2e-spec.ts` con R14.1–R14.4. Debe fallar. **(1.5h)** ✅
- [x] **T7.7.B2** — Escribir la primera mitad de `0036_referential_integrity.sql`: función `check_is_leaf_category()` con el filtro `deleted_at IS NULL` y `ERRCODE='check_violation'`, más el trigger `BEFORE INSERT OR UPDATE ON incidents`. **(1.5h)** ✅
- [x] **T7.7.B3** — Traducir el error 23514 con mensaje `INCIDENT_CATEGORY_NOT_LEAF` a `BadRequestException` en la creación/actualización de incidentes (R14.3). **(1h)** ✅

### Fase C — Normalización de FK

- [x] **T7.7.C1** — Inventariar en `design.md` las 6 FK sin cláusula `ON DELETE` explícita y las 2 relaciones con comportamiento inconsistente entre migraciones (`roles`, `incident_categories`), y decidir el comportamiento final de cada una. **(1.5h)** ✅ ver design.md D13 — auditoría real encontró 4, no 6 (deviation documentada)
- [x] **T7.7.C2** — Escribir la segunda mitad de `0036_referential_integrity.sql`: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT … ON DELETE …` para cada FK a normalizar. **(2h)** ✅
- [x] **T7.7.C3** — Escribir `0036_…DOWN.sql` (drop del trigger y de la función; restauración de las FK a su definición previa). **(1h)** ✅
- [x] **T7.7.C4** — E2E R15.1–R15.4: ninguna FK queda en `NO ACTION` sin justificación; cascada al borrar incidente; RESTRICT al borrar organización con incidentes; `citizen_id` a NULL al borrar usuario. **(2h)** ✅

---

## D7.8 — Paridad de índices (migración 0037)

- [x] **T7.8.A1** — 🔴 Crear `backend/test/e2e/t7-index-parity.e2e-spec.ts` con R16.1–R16.3. Debe fallar. **(1.5h)** ✅
- [x] **T7.8.A2** — Escribir `0037_index_parity.sql` con los 9 `CREATE INDEX IF NOT EXISTS`: `comments.user_id`, `comments.parent_id`, `assignments.incident_id`, `status_history.changed_by_user_id`, `incidents.priority`, `incidents.citizen_id`, `geo_zones.code`, `invitations.token_hash`, `password_reset_tokens.token_hash`. Sin `CONCURRENTLY` (las migraciones corren en transacción). **(1h)** ✅ sólo 4 nuevos — ver design.md D10 (5 de 9 ya existían, deviation documentada)
- [x] **T7.8.A3** — Escribir `0037_…DOWN.sql`. **(15min)** ✅
- [x] **T7.8.A4** — Implementar el check R16.2 (sin índices duplicados por `(tabla, columnas)`) sobre `pg_indexes` y corregir los duplicados que aparezcan. **(1.5h)** ✅ auditoría reveló 5/9 preexistentes; 0037 evita crear duplicados
- [x] **T7.8.A5** — Implementar el check R16.3: poblar `incidents` con 1000+ filas y verificar por `EXPLAIN` que el listado filtrado por estado y organización no hace `Seq Scan`. **(1.5h)** ✅ 1200 filas

---

## D7.9 — Datos de referencia y seeds (migraciones 0038–0039)

> Va al final a propósito: 0038 depende de 0036 (el trigger de categoría hoja debe
> existir antes de sembrar el árbol) y 0039 depende de 0034 (el UNIQUE ajustado de
> T7.5.A2b) y de 0035 (`geo_zones.code`).

### Fase A — Árbol de categorías (migración 0038)

- [x] **T7.9.A1** — 🔴 Crear `backend/test/e2e/t7-reference-data.e2e-spec.ts` con R19.1–R19.7: 22 categorías (5 raíces / 17 hojas — ver design.md D14), árbol de exactamente 2 niveles, re-aplicación sin duplicados, unicidad de raíces, mismo nombre bajo padres distintos permitido, incidente con hoja aceptado y con raíz rechazado. Debe fallar. **(2h)** ✅ RED confirmado (12 tests fallando) moviendo 0038/0039 fuera del directorio de migraciones antes de escribir el seed
- [x] **T7.9.A2** — Añadir a 0038 los dos índices UNIQUE parciales que hacen idempotente el seed: `uq_incident_categories_root ON (name) WHERE parent_id IS NULL` y `uq_incident_categories_child ON (name, parent_id) WHERE parent_id IS NOT NULL`. Sin ellos `ON CONFLICT` no tiene destino y re-aplicar duplica el árbol. **(1h)** ✅
- [x] **T7.9.A3** — Escribir el seed de 0038: 5 raíces (Infraestructura Vial, Servicios Básicos, Seguridad Ciudadana, Medio Ambiente, Obras e Infraestructura) y 17 hojas resolviendo el padre por nombre en un CTE, con `ON CONFLICT DO NOTHING`. Copiar la nomenclatura exacta de `GeoReporta/backend/database/seeders/IncidentCategorySeeder.php`. **(2h)** ✅ 22 categorías, no 23 — ver design.md D14 (conteo real del seeder legacy)
- [x] **T7.9.A4** — Escribir `0038_…DOWN.sql`: borra las 22 categorías por nombre y los 2 índices. No hace `TRUNCATE` — puede haber categorías creadas por el usuario. **(45min)** ✅

### Fase B — Permisos de notificaciones (parte de 0039)

- [x] **T7.9.B1** — 🔴 e2e para R20.1–R20.3: filas `(notifications, READ)` y `(notifications, UPDATE)` en el catálogo, otorgadas a los 4 roles staff, sin duplicar al re-aplicar. Deben fallar. **(1h)** ✅ RED confirmado (`t7-notification-permissions.e2e-spec.ts`, 8 tests fallando sin 0039). Sin unit test separado — R20 es enteramente estado de base de datos, igual que R16 (T7.8) o R14/R15 (T7.7); ver design.md D14
- [x] **T7.9.B2** — Añadir a 0039 las dos filas del catálogo y su concesión en el JSONB `roles.permissions` de los 4 roles staff, con el mismo patrón que 0019_incident_claim.sql (`permissions || jsonb_build_array(...)` + guarda `?&`). `PermissionAction` en `require-permission.decorator.ts` ya admite `READ`/`UPDATE` — sin cambios. **(1.5h)** ✅ archivo real: `0019_seed_permissions.sql` no existe; el patrón `||`/`?&` vive en `0019_incident_claim.sql`
- [x] **T7.9.B3** — Revisar si `NotificationsController` debe pasar a exigir el permiso o si sigue con `JwtAuthGuard` a secas. Registrar la decisión en `design.md`; no cambiar el guard sin decidirlo. **(1h)** ✅ decisión: sin cambios de guard — ver design.md D14 (approve/reject ya usaban `@RequirePermission('UPDATE')` desde T5.6; el gap era sólo de datos, no de código; rutas de notificaciones propias se quedan en `JwtAuthGuard` solo)

### Fase C — Geografía y organizaciones (parte de 0039)

- [ ] **T7.9.C1** — 🚧 **BLOQUEADA hasta input del operador**: obtener la lista real de organizaciones del despliegue de Santa Elena (nombre, cantón, si es sucursal de otra). No inventar datos ni portar los GAD de Quito/Guayaquil/Cuenca/Ambato/Loja del seeder legacy. **(—)**
- [ ] **T7.9.C2** — Extender `database/seeds/generate-geo-zones-seed.js` para emitir también el nivel `parroquia` de los 3 cantones de Santa Elena, con `polygon` y `code`. Fuente de geometrías: el mismo origen que usó el seed actual, o `GeoReporta/backend/database/data/ecuador-locations-geom.json` filtrado por provincia. **(2h)**
- [ ] **T7.9.C3** — Regenerar `0003_seed_geo_zones.generated.sql` — **no**: emitir las parroquias como parte de 0039, para no modificar una migración ya aplicada en Supabase (violaría el checksum de D2). **(1.5h)**
- [ ] **T7.9.C4** — Añadir a 0039 las organizaciones acordadas en T7.9.C1, resolviendo `zone_id` por `geo_zones.code` y `parent_id` por nombre, con `ON CONFLICT DO NOTHING`. **(1.5h)**
- [ ] **T7.9.C5** — Escribir `0039_…DOWN.sql`. **(45min)**
- [ ] **T7.9.C6** — E2E R21.1–R21.5: parroquias sembradas con parent y polígono, jerarquía sin ciclos, `ST_Within(parroquia, canton)` verdadero en todos los pares, organizaciones cargadas con `zone_id` válido, re-aplicación sin duplicados. **(2h)**

### Fase D — Datos de demo y de volumen

- [ ] **T7.9.D1** — 🔴 E2E R22.1–R22.4: ninguna migración inserta incidentes, el generador de demo vive bajo `database/seeds/`, el seed es idempotente, y el feed de Redis queda consistente con Postgres tras sembrar. Debe fallar. **(1.5h)**
- [ ] **T7.9.D2** — Crear el generador de incidentes de demo bajo `database/seeds/` (~25 incidentes realistas en los 3 cantones), idempotente por título, equivalente a `SantaElenaIncidentSeeder`. **NO** es una migración. **(2.5h)**
- [ ] **T7.9.D3** — Crear el generador de volumen (1000 incidentes con ciclo de vida completo: asignaciones, `status_history`, aprobaciones, comentarios anidados y notificaciones), equivalente a `MassIncidentSeeder`. Auto-skip si la base ya tiene ese volumen. **(3h)**
- [ ] **T7.9.D4** — Añadir el paso de reconstrucción del feed al final del seeding, invocando el `FeedRecoveryService` de T6 (equivalente al `feed:rebuild` que legacy llama al cerrar `DatabaseSeeder`). Los seeds escriben directo en Postgres sin pasar por los listeners de Redis Streams, así que sin este paso el feed queda vacío. **(1.5h)**
- [ ] **T7.9.D5** — Añadir a `backend/package.json` los scripts `db:seed` (referencia + demo) y `db:seed:mass` (volumen), documentando que ninguno se ejecuta contra producción. **(45min)**

---

## Cierre

- [ ] **T7.Z1** — E2E transversal `t7-full-schema.e2e-spec.ts` con R17.1–R17.4: base vacía 0001→0039; base con 0001–0029 y datos + 0030→0039 sin pérdida; re-aplicación de 0030–0039 inocua; la app NestJS bootea con `synchronize:false` y `/api/health` responde 200. **(2h)**
- [ ] **T7.Z2** — Añadir 10 filas nuevas a `database/MIGRATION_LOG.md` (0030–0039) con descripción, estado y entorno (R4.2). **(1h)**
- [ ] **T7.Z3** — Correr la suite completa (`npm test && npm run test:e2e`), `npm run lint`, `npm run typecheck` y `npm run build` desde `backend/`. Cero errores. **(1h)**
- [ ] **T7.Z4** — Redactar el bloque de aplicación manual para el operador: orden de pegado de 0030→0039 en el editor SQL de Supabase, con el checkpoint a verificar tras cada una. **(1h)**

---

## Resumen

| Grupo | Tareas | Migración | Estimado |
|-------|--------|-----------|----------|
| D7.1 | 14 | 0030 | ~17h |
| D7.2 | 18 | 0031 | ~23h |
| D7.3 | 7 | 0032 | ~8h |
| D7.4 | 9 | 0033 | ~9h |
| D7.5 | 14 | 0034 | ~21h |
| D7.6 | 7 | 0035 | ~6h |
| D7.7 | 9 | 0036 | ~13h |
| D7.8 | 5 | 0037 | ~6h |
| D7.9 | 18 | 0038, 0039 | ~26h |
| Cierre | 4 | — | ~5h |
| **Total** | **106** | **10** | **~136h** |

> D7.9 tiene una tarea bloqueada (**T7.9.C1**) que depende de un input del
> operador: la lista real de organizaciones del despliegue. Todo lo demás del
> grupo puede avanzar sin ella; sólo T7.9.C4 queda esperando.
