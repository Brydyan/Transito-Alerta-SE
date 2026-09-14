# Proposal: T7 — Database Schema Parity & Hardening (Fase 7 DB)

**Change**: t7-database-schema-parity
**Date**: 2026-08-24
**Author**: Gemini Architect (rol, ejecutado vía Claude Code)
**Base doc**: `docs/tasks/3-DATABASE-SCHEMA.md`
**Epic**: ⚠️ GeoReporta — cierre de la capa de datos
**Predecesor**: `t6-georepota-parity` (archivado 2026-08-24, paridad de API/servicio al 100%)

---

## Intención

T6 cerró la paridad **funcional** del backend (endpoints, servicios, DTOs). Lo que
quedó sin auditar es la capa que está debajo: el **esquema de base de datos**.

Se auditó la capa de datos completa de `/GeoReporta` contra la nuestra:

| Fuente legacy auditada | Contra |
|------------------------|--------|
| `backend/database/migrations/` — 72 migraciones Laravel | `database/migrations/` — 29 SQL |
| `backend/database/seeders/` — 14 seeders | `database/seeds/` — 1 seed generado |
| `backend/database/data/ecuador-locations-geom.json` — 2.4 MB de geometrías | `0003_seed_geo_zones.generated.sql` — 4 filas |
| `backend/database/entity-relationship-diagram.md` — ERD + 3 triggers documentados | esquema real |
| `backend/app/Domains/*/Models/` — 18 modelos Eloquent | `backend/src/entities/` — 15 entidades |

El resultado:

| Dimensión | Legacy (GeoReporta) | Actual (TASE) | Estado |
|-----------|--------------------|---------------|--------|
| Tablas de dominio | 18 | 16 | 4 ausentes / 2 nuevas |
| Funciones + triggers PL/pgSQL | 4 + 4 | **0 + 0** | ❌ gap total |
| Columnas `deleted_at` | 12 tablas | 3 tablas | ❌ 7 tablas sin soft delete |
| Columnas `updated_at` | 16 tablas | 3 tablas | ❌ 12 tablas sin audit (+1 excluida por diseño) |
| Índices explícitos | ~30 | 34 | ⚠️ solapamiento parcial |
| Tracking de migraciones aplicadas | `migrations` (Laravel) | **ninguno** | ❌ gap |
| Rollback ejercitado | n/a | 29 archivos DOWN, **nunca ejecutados** | ❌ gap |
| Seeders de datos de referencia | 14 | 1 (geo_zones) | ❌ gap |
| Categorías de incidente sembradas | 23 (5 padres + 18 hojas) | **0** | ❌ gap |
| Organizaciones sembradas | 11 (5 GAD + 6 sucursales) | **0** | ❌ gap |
| Filas de `geo_zones` / `locations` | Ecuador completo (país→provincia→cantón→parroquia) | 4 (1 provincia + 3 cantones) | ⚠️ decisión de scope |

Este change cierra los gaps **reales** de esquema y endurece la capa de datos.
No es un port ciego: cada divergencia legacy se clasifica en **portar** o
**rechazar con motivo documentado**.

### Corrección al documento base

`docs/tasks/3-DATABASE-SCHEMA.md` está desactualizado y contiene una afirmación
falsa que este change corrige:

- Dice que el esquema va por 0001–0016 → **van 0029** (0025–0029 son de T6).
- Dice que existe `backend/scripts/run-migrations.ts` con tabla `schema_migrations`
  y scripts `pnpm run db:migrate` → **no existen**. Lo único real es
  `backend/test/support/run-migrations.ts`, que aplica los `.sql` en orden numérico
  contra un Postgres de Testcontainers desde cero, sin tracking ni idempotencia.
- Dice "72 migraciones GeoReporta → ~20 migraciones NestJS" → el mapeo real
  medido es **72 → 29 (+10 de este change = 39)**.

Actualizar el doc es parte del alcance (D7.1).

---

## Alcance

### D7.1 — Tooling de migraciones y saneamiento del log (migración 0030)

- **G1**: No existe tabla `schema_migrations`. Nada registra qué migración se
  aplicó a qué base. El único registro es `database/MIGRATION_LOG.md`, editado a mano.
- **G2**: No existe runner idempotente. `backend/test/support/run-migrations.ts`
  siempre corre todo desde cero — sirve para tests, no para staging/prod.
- **G3**: Los 29 archivos DOWN de `database/rollback/` **nunca se ejecutaron**.
  No hay prueba de que el rollback funcione.
- **G4**: `MIGRATION_LOG.md` marca 0024–0029 como `⏳ Pending` cuando el operador
  ya las aplicó en Supabase el 2026-08-24.

### D7.2 — Soft delete completo (migración 0031)

Legacy tiene `deleted_at` en 12 tablas; nosotros en 3 (`incidents`, `assignments`, `users`).
`openspec/config.yaml` fija como regla del proyecto *"Soft deletes on domain entities
(established pattern)"* — la regla existe pero no está aplicada.

- **G5**: `comments.deleted_at` — hoy el borrado de comentario es hard delete.
- **G6**: `notifications.deleted_at`
- **G7**: `organizations.deleted_at`
- **G8**: `incident_categories.deleted_at`
- **G9**: `geo_zones.deleted_at`
- **G10**: `roles.deleted_at`, `permissions.deleted_at`

Cada una con índice parcial `WHERE deleted_at IS NULL` y filtro en todas las queries
del repositorio correspondiente (mismo patrón que T6.2).

### D7.3 — Columnas `updated_at` y trigger de mantenimiento (migración 0032)

- **G11**: sólo 3 de 16 tablas tienen `updated_at` (`incidents`,
  `incident_categories`, `users`). Faltan en 12: `assignments`, `comments`,
  `geo_zones`, `notifications`, `organizations`, `permissions`, `roles`,
  `invitations`, `comment_images`, `incident_images`, `password_reset_tokens`,
  `user_sessions`. `status_history` queda excluida a propósito — es append-only
  y legacy tampoco le pone `updated_at`.
- **G12**: No existe función `set_updated_at()` ni triggers `BEFORE UPDATE`.
  Hoy `updated_at` se escribe a mano desde el servicio donde existe → propenso a olvido.

### D7.4 — Comentarios anidados (migración 0033)

- **G13**: `comments.parent_id` no existe. Legacy lo agregó en
  `2026_07_17_000002_add_parent_id_to_comments_table`. Nuestro `0005_comments.sql`
  documenta "comentarios anidados" pero la columna nunca se creó y
  `CommentEntity` no la expone. Las respuestas a comentarios son imposibles hoy.
  La profundidad máxima de legacy es **2** (`MAX_COMMENT_DEPTH = 2` en el frontend,
  `Comment::getDepthAttribute()` satura en 2), enforzada sólo en el cliente — su
  `StoreCommentRequest` valida únicamente `exists:comments,id`. Aquí se enforcea en
  el servicio.

### D7.5 — Jerarquía de organizaciones y ruteo por categoría (migración 0034)

- **G14**: `organizations.parent_id` no existe. `OrganizationsService.tree()` devuelve
  una lista plana y lo documenta como decisión T3.2 — legacy sí tiene jerarquía
  (`2026_06_26_000004_add_parent_id_to_organizations_table`).
- **G15**: No hay mapeo organización ↔ categoría. Legacy usa
  `organizations.incident_category_id` (el pivot `category_organization` existe en
  su esquema pero **ninguna línea de código lo usa** — verificado con codegraph).
- **G15b**: El ruteo de `notifiedFor` diverge en tres puntos, todos verificados
  contra `EloquentOrganizationRepository::findNotifiedFor()`:
  1. **No recorre la jerarquía de zonas.** Legacy notifica a toda org cuyo
     `location_id` esté en `ancestorsAndSelf` de la ubicación; nosotros hacemos
     `findByZone` sobre una zona plana. Una org a nivel provincia nunca se entera
     de un incidente en una de sus parroquias.
  2. **Devuelve una sola organización.** Legacy devuelve todas las notificadas.
  3. **`is_claimable` está mal calculado.** Legacy lo define como identidad con
     `findForLocation()` — la org que el auto-assign elegiría. Nosotros lo
     calculamos como `max_active_claims > 0`, que es otra cosa.
  Falta además la semántica de **org transversal** (`incident_category_id IS NULL`
  cubre cualquier categoría) y la **ancestría de categoría** (una org configurada
  para una categoría raíz cubre sus subcategorías).
- **G15c**: `uq_organizations_zone` (UNIQUE parcial sobre `organizations(zone_id)`,
  de 0015) es incompatible con el modelo de legacy, donde varias organizaciones a
  distintos niveles del árbol se notifican para el mismo incidente. Hay que
  eliminarlo.

### D7.6 — Columnas de dominio faltantes (migración 0035)

- **G16**: `geo_zones.code` — legacy `locations.code`
  (`2026_06_24_000001_add_code_to_locations_table`), código administrativo estable
  usado para import/export y matching con fuentes externas.
- **G17**: `users.phone` — presente en legacy desde el inicio, ausente en el nuestro.

### D7.7 — Integridad a nivel de base (migración 0036)

- **G18**: Trigger `check_is_leaf_category` ausente. Legacy impide asociar un
  incidente a una categoría padre. Nuestro `incidents.category_id` acepta cualquier
  fila de `incident_categories`, incluidas las que tienen hijos.
- **G19**: Auditoría de `ON DELETE` en todas las FK. Legacy agregó
  `2026_07_26_165347_add_referential_integrity_constraints` explícitamente.
  Nuestras FK se escribieron migración a migración sin revisión transversal, y el
  doc base marca esto como gotcha de Supabase ("todas las migraciones deben incluir
  comportamiento `ON DELETE` apropiado").

### D7.8 — Paridad de índices (migración 0037)

- **G20**: Índices presentes en legacy y ausentes en el nuestro:
  `comments.user_id`, `comments.parent_id` (nuevo de D7.4), `assignments.incident_id`,
  `status_history.changed_by_user_id`, `incidents.priority`, `incidents.citizen_id`,
  `geo_zones.code` (nuevo de D7.6), `invitations.token_hash`,
  `password_reset_tokens.token_hash`.

---

### D7.9 — Datos de referencia y seeds (migraciones 0038–0039)

La auditoría de `GeoReporta/backend/database/seeders/` destapó que el esquema está
portado pero **las tablas de catálogo están vacías**. Un esquema correcto sin datos
de referencia no es un sistema utilizable.

- **G21**: `incident_categories` **no tiene ninguna fila sembrada**. Legacy siembra
  un árbol de 23 categorías (5 padres × 3-4 hojas) en `IncidentCategorySeeder`:
  Infraestructura Vial, Servicios Básicos, Seguridad Ciudadana, Medio Ambiente,
  Obras e Infraestructura. Nuestro `0012_incident_categories.sql` crea la tabla y
  las filas de permisos, pero ni una categoría. Sin árbol no se puede clasificar
  un incidente — y el trigger de categoría hoja de D7.7 no tiene nada que validar.
- **G22**: `organizations` **no tiene ninguna fila sembrada**. Legacy siembra 5 GAD
  municipales con 6 sucursales vía `parent_id` (`OrganizationSeeder`). Es además
  la evidencia directa de que la jerarquía de D7.5 se usa de verdad, no en teoría.
- **G23**: el catálogo de permisos no tiene filas para el recurso `notifications`.
  Legacy tiene `notifications:view` y `notifications:update`. Nuestras 38 filas
  cubren 13 recursos y omiten ese.
- **G24**: `geo_zones` está sembrada sólo con Santa Elena + 3 cantones (4 filas),
  sin llegar al nivel `parroquia` que el propio `CHECK` de `0013` admite. Legacy
  siembra Ecuador entero con geometrías reales desde un JSON de 2.4 MB.
  **No se porta entero** — el producto está scopeado a Santa Elena — pero sí hay
  que completar el nivel parroquia dentro de ese scope.
- **G25**: no existe pipeline de seeds. Legacy tiene `DatabaseSeeder` con orden de
  dependencias explícito (roles → locations → orgs → users → permissions →
  role_permission → menus → categories → incidents) y un `feed:rebuild` al final.
  Aquí los datos de referencia están dispersos entre migraciones, sin orden
  declarado ni forma de re-sembrar un entorno.
- **G26**: no hay datos de demo ni de volumen. Legacy tiene `IncidentSeeder`,
  `SantaElenaIncidentSeeder` (~25 incidentes realistas) y `MassIncidentSeeder`
  (1000 incidentes con ciclo de vida completo: asignaciones, historial,
  aprobaciones, comentarios anidados y notificaciones). Sin esto no hay forma de
  reproducir el escenario del load test ni de demostrar el mapa.

---

## Fuera de alcance (divergencias legacy rechazadas con motivo)

| Objeto legacy | Decisión | Motivo |
|---------------|----------|--------|
| `category_organization` (pivot) | ❌ No portar | Existe en el esquema de legacy pero **ninguna línea de código de aplicación lo usa** (verificado con codegraph): sólo aparece en 3 migraciones de normalización. La relación viva es `organizations.incident_category_id`. |
| `ResolutionAudit` / `resolution_audits` | ❌ No portar | `Incident::resolutions()` referencia una clase que **no existe** en legacy, y no hay migración que cree la tabla. Es código muerto. |
| `menus`, `menu_permission` | ❌ No portar | Menús son configuración estática de UI; ya resueltos por `backend/src/modules/menus/menu-map.ts` filtrado por permisos. Meterlos en DB agrega 2 tablas y un join por request sin ganancia. |
| `role_permission` (pivot) | ❌ No portar | El proyecto usa `roles.permissions` JSONB + caché Redis (decisión D2, documentada en 0009/0018/0019). Cambiarlo obliga a reescribir `AuthService` y toda la caché de permisos. |
| `images` (polimórfica) | ❌ No portar | Ya tenemos `comment_images` (0024) e `incident_images` (0029) con FK tipadas y `ON DELETE CASCADE`. La tabla polimórfica de legacy pierde integridad referencial. |
| Trigger `log_incident_status` | ❌ No portar | Lo hace `IncidentStatusHistoryListener` sobre Redis Streams, con `event_id` para idempotencia — capacidad que el trigger no tiene. |
| Trigger `auto_assign_location` | ❌ No portar | Lo hace `GeofencingService.resolveZone()` en capa de aplicación, con `geofence_matched` como bandera explícita. |
| Trigger `notify_on_status_change` | ❌ No portar | Lo hace `IncidentNotificationsListener`, que además emite por Socket.IO. |
| `incident_claims`, `incident_organization_assignments`, `incident_verifications` | ❌ No portar | Legacy los dropeó él mismo antes de su estado final. |
| Tablas de infraestructura Laravel (`cache`, `jobs`, `job_batches`, `failed_jobs`, `cache_locks`) | ❌ No portar | Reemplazadas por Redis / Redis Streams. |
| `MenuSeeder` | ❌ No portar | Consecuencia de rechazar las tablas `menus`/`menu_permission`. |
| `EcuadorLocationSeeder` completo (24 provincias, todos los cantones y parroquias) | ⚠️ Portar parcial | El producto está scopeado a Santa Elena. Se porta la estructura y el nivel `parroquia` **sólo** para esa provincia (G24), no las otras 23. |
| `MassIncidentSeeder` (1000 incidentes) | ⚠️ Portar como script, no como migración | Es data de volumen para load test, no de referencia. Va a `database/seeds/`, nunca a `database/migrations/`. |
| Vocabulario de acciones en minúscula (`view`/`create`/`update`/`delete`/`manage`) | ❌ No portar | Aquí el `CHECK` de `permissions.action` usa mayúsculas (`READ`/`CREATE`/`UPDATE`/`DELETE`/`ASSIGN`/`CLAIM`/`RELEASE`) en lockstep con el union `PermissionAction` de TypeScript. `view`→`READ` y `manage`→`CLAIM`+`RELEASE` ya están mapeados. |

Los tres triggers rechazados **sí** se documentan en `design.md` con el componente
NestJS que asume cada responsabilidad, para que la ausencia sea una decisión
rastreable y no un olvido.

---

## Migraciones nuevas

| # | Archivo | Grupo | Contenido |
|---|---------|-------|-----------|
| 0030 | `0030_schema_migrations.sql` | D7.1 | Tabla `schema_migrations` + backfill de 0001–0029 |
| 0031 | `0031_soft_delete_completeness.sql` | D7.2 | `deleted_at` en 7 tablas + índices parciales |
| 0032 | `0032_updated_at_columns.sql` | D7.3 | `updated_at` en 12 tablas + función y triggers `set_updated_at()` |
| 0033 | `0033_comments_threading.sql` | D7.4 | `comments.parent_id` self-FK + índice + CHECK anti auto-referencia |
| 0034 | `0034_organizations_hierarchy_categories.sql` | D7.5 | `organizations.parent_id` + `organizations.incident_category_id`; elimina `uq_organizations_zone` |
| 0035 | `0035_domain_columns.sql` | D7.6 | `geo_zones.code`, `users.phone` |
| 0036 | `0036_referential_integrity.sql` | D7.7 | Trigger `check_is_leaf_category` + normalización de `ON DELETE` |
| 0037 | `0037_index_parity.sql` | D7.8 | 9 índices de paridad/rendimiento |
| 0038 | `0038_seed_incident_categories.sql` | D7.9 | Árbol de 23 categorías (5 padres + 18 hojas), idempotente por `(name, parent_id)` |
| 0039 | `0039_seed_reference_data.sql` | D7.9 | Filas de permisos de `notifications`; parroquias de Santa Elena; organizaciones semilla |

Cada una con su archivo DOWN en `database/rollback/` y su fila en
`database/MIGRATION_LOG.md`.

---

## Permisos RBAC afectados

Este change es de esquema; **no** introduce recursos nuevos ni acciones nuevas en
la tabla `permissions`. Único ajuste:

- D7.5 expone `organization-categories` como sub-recurso administrable. Se resuelve
  con las acciones ya existentes de `organizations` (`UPDATE organizations`), sin
  filas nuevas en el catálogo. Se documenta explícitamente en `design.md` para que
  no se agregue por inercia.

---

## Dependencias entre módulos

| Grupo | Módulos NestJS tocados |
|-------|------------------------|
| D7.1 | ninguno (scripts + CI + docs) |
| D7.2 | `comments`, `notifications`, `organizations`, `incidents` (categorías), `geo-zones`, `auth` (roles/permissions) |
| D7.3 | todos los repositorios que hacen `UPDATE` (el trigger los cubre; sólo hay que dejar de escribir `updated_at` a mano) |
| D7.4 | `comments` |
| D7.5 | `organizations`, `geofencing` |
| D7.6 | `geo-zones`, `users` |
| D7.7 | `incidents` |
| D7.8 | ninguno (sólo DDL) |
| D7.9 | ninguno en runtime (datos); toca `database/seeds/` y el pipeline de seeding |

---

## Criterios de éxito

- [ ] 0030–0039 aplican limpio sobre una base vacía (Testcontainers, orden numérico).
- [ ] 0030–0039 aplican limpio sobre el esquema actual con datos (idempotencia:
      `IF NOT EXISTS` / `IF EXISTS` en todo el DDL).
- [ ] Test e2e de rollback: aplicar 0001→0039, luego los 39 DOWN en orden inverso,
      y verificar que no queda ninguna tabla de dominio.
- [ ] `SELECT count(*) FROM schema_migrations` = 39 tras aplicar todo.
- [ ] Ninguna query de dominio devuelve filas con `deleted_at IS NOT NULL`.
- [ ] `UPDATE` sobre cualquier tabla con `updated_at` actualiza la columna sin que
      el servicio la escriba.
- [ ] `GET /organizations/notified-for?location_id&category_id` devuelve todas las
      organizaciones notificadas, resolviendo ancestría de zona y de categoría, con
      `is_claimable` en exactamente una y orden estable.
- [ ] Insertar un incidente con `category_id` de una categoría padre → error de DB.
- [ ] `SELECT count(*) FROM incident_categories` = 23, con 18 hojas y 5 raíces.
- [ ] Re-aplicar 0038 y 0039 no duplica ninguna fila.
- [ ] El catálogo de permisos incluye `notifications:READ` y `notifications:UPDATE`.
- [ ] Suite completa verde: `npm test && npm run test:e2e` desde `backend/`.
- [ ] `docs/tasks/3-DATABASE-SCHEMA.md` refleja el estado real (0039, runner real,
      mapeo 72→39).

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| 0031 agrega `deleted_at` a tablas con datos en producción | Queries existentes empiezan a devolver filas "borradas" si se olvida un filtro | Auditoría exhaustiva por repositorio, con e2e por tabla (mismo protocolo que T6.2) |
| Triggers `set_updated_at` en tablas calientes (`incidents`, `notifications`) | Overhead por UPDATE | Trigger `BEFORE UPDATE` de una asignación, costo despreciable; se mide en el e2e de carga existente |
| Trigger `check_is_leaf_category` rompe seeds o tests que usan categorías padre | Suite roja | Auditar `database/seeds/` y fixtures de test **antes** de 0036; el trigger es la última migración del change por eso |
| `organizations.parent_id` contradice la decisión T3.2 documentada en el código | Confusión de diseño | `design.md` deja registro explícito de la reversión y del motivo (paridad de jerarquía legacy) |
| Backfill de `schema_migrations` marca como aplicadas migraciones que en un entorno dado no lo están | Migración saltada silenciosamente | El backfill se ejecuta sólo si las tablas de 0001–0029 existen; si no, la tabla queda vacía y el runner aplica todo |
| 0038 siembra categorías en un entorno donde ya se crearon a mano | Duplicados en el árbol | Idempotencia por `(name, parent_id)` con `ON CONFLICT DO NOTHING` sobre un índice UNIQUE creado en la misma migración |
| Sembrar organizaciones fija datos de un tenant concreto en el esquema | Filas de demo en producción | 0039 siembra sólo las organizaciones reales del despliegue de Santa Elena, acordadas con el operador; la data de demo/volumen queda en `database/seeds/`, fuera del pipeline de migraciones |
