# Design: T7 — Database Schema Parity & Hardening

**Change**: t7-database-schema-parity
**Date**: 2026-08-24
**Stack**: PostgreSQL 16 + PostGIS 3.4 (Supabase) · TypeORM 0.3 · NestJS 10.4.4

---

## 1. Evidencia de la auditoría

Método: parseo programático de las 72 migraciones Laravel de
`GeoReporta/backend/database/migrations/` (sólo el cuerpo de `up()`, para no
contaminar el set con los `dropIfExists` de `down()`) y de las 29 migraciones SQL
de `database/migrations/`, reduciendo ambos a `{tabla: {columnas}}` y diffeando
con el mapeo de nombres `locations→geo_zones`, `sessions→user_sessions`,
`user_invitations→invitations`.

### 1.1 Objetos de base sin equivalente

| Objeto legacy | Presente en TASE | Clasificación |
|---------------|------------------|----------------|
| `menus`, `menu_permission` | no | rechazado — `menu-map.ts` |
| `role_permission` | no | rechazado — `roles.permissions` JSONB |
| `images` (polimórfica) | no | rechazado — `comment_images` + `incident_images` |
| `check_is_leaf_category()` + trigger | **no** | **portar (D7.7)** |
| `log_incident_status()` + trigger | no | rechazado — `IncidentStatusHistoryListener` |
| `auto_assign_location()` + trigger | no | rechazado — `GeofencingService` |
| `notify_on_status_change()` + trigger | no | rechazado — `IncidentNotificationsListener` |

### 1.2 Columnas ausentes con impacto funcional medido

| Tabla | Columna | Evidencia del impacto |
|-------|---------|----------------------|
| `comments` | `parent_id` | `0005_comments.sql` documenta "comentarios anidados"; la columna nunca se creó y `CommentEntity` no la expone → responder un comentario es imposible |
| `organizations` | `parent_id` | `OrganizationsService.tree()` devuelve lista plana y lo documenta como limitación |
| `organizations` | `incident_category_id` | `OrganizationsService.notifiedFor()` acepta `category_id` y **lo descarta**; sólo rutea por zona, sin ancestría y devolviendo una sola org (ver D7) |
| `geo_zones` | `code` | sin código administrativo no hay import/export ni matching externo |
| `users` | `phone` | presente en legacy desde `create_users_table` |
| 7 tablas | `deleted_at` | contradice la regla `apply` de `openspec/config.yaml` |
| 12 tablas | `updated_at` | sólo `incidents`, `incident_categories` y `users` la tienen; sin marca de última modificación no hay auditoría ni invalidación de caché por timestamp |

### 1.3 Estado real de las FK (base de D7.7 / R15)

Inventario de las cláusulas `REFERENCES` de las 29 migraciones:

| Comportamiento | Ocurrencias |
|----------------|-------------|
| `ON DELETE CASCADE` | 8 |
| `ON DELETE SET NULL` | 11 |
| `ON DELETE RESTRICT` | 2 |
| **sin cláusula (NO ACTION implícito)** | **6** |

Además hay **dos inconsistencias** entre migraciones distintas para la misma
relación conceptual:

- `roles(id)` referenciada una vez con `SET NULL` y otra con `RESTRICT`.
- `incident_categories(id)` referenciada una vez con `SET NULL` y otra con `RESTRICT`.

D7.7 normaliza ambas y elimina los 6 `NO ACTION` implícitos.

### 1.4 Datos de referencia (auditoría de `database/seeders/`)

Legacy ordena 14 seeders con dependencias explícitas en `DatabaseSeeder::run()`:
`RoleSeeder → EcuadorLocationSeeder → LocationGeomSeeder → OrganizationSeeder →
UserSeeder → PermissionSeeder → RolePermissionSeeder → MenuSeeder →
IncidentCategorySeeder → IncidentSeeder → MassIncidentSeeder`, y termina llamando
al comando `feed:rebuild` porque el seeding corre con `WithoutModelEvents` y los
listeners de Redis nunca disparan.

| Seeder legacy | Contenido | Equivalente aquí |
|---------------|-----------|------------------|
| `RoleSeeder` | 5 roles con ids fijos (1-5) + resync de la secuencia | 0009 (`reporter`) + 0015 (4 roles staff). Sin resync: usamos uuid |
| `PermissionSeeder` | 40 pares (recurso, acción), 13 recursos | 38 pares repartidos entre 0009/0012/0013/0014/0015/0016/0018/0019/0024/0029 |
| `RolePermissionSeeder` | pivot rol↔permiso | `roles.permissions` JSONB, escrito por las mismas migraciones |
| `EcuadorLocationSeeder` | Ecuador completo: país → 24 provincias → cantones → parroquias | `0003_seed_geo_zones.generated.sql` — 4 filas (Santa Elena + 3 cantones) |
| `LocationGeomSeeder` | geometrías desde `ecuador-locations-geom.json` (2.4 MB) | geometrías inline en el seed generado |
| `OrganizationSeeder` | 5 GAD + 6 sucursales vía `parent_id` | **ninguno** |
| `IncidentCategorySeeder` | árbol de 23 categorías | **ninguno** |
| `MenuSeeder` | menús + pivot con permisos | rechazado (`menu-map.ts`) |
| `UserSeeder` | 1 admin + 1 operador por organización | usuario anónimo semilla en 0001; el resto entra por invitación |
| `IncidentSeeder`, `SantaElenaIncidentSeeder`, `MassIncidentSeeder` | ~25 y 1000 incidentes con ciclo de vida completo | **ninguno** |

**El hallazgo central**: nuestro esquema de catálogo está bien portado pero
**vacío**. `incident_categories` y `organizations` no tienen ni una fila sembrada.

**Diff del catálogo de permisos** (13 recursos legacy vs 13 nuestros):

- Sólo en legacy: `dashboard:view`, `feed:view`, `feed:detail`, `profile:view`
  (los cuatro son de UI, resueltos aquí por `menu-map.ts` y por el `JwtAuthGuard`),
  y **`notifications:view` / `notifications:update`** — este último sí es un gap real (G23).
- Sólo aquí: `comment-images`, `incident-images`, `invitations`, `sessions`
  (capacidades que legacy no tiene o resuelve sin RBAC).
- `locations:*` ↔ `geo-zones:*`, `view` ↔ `READ`, y `incidents:manage` ↔
  `incidents:CLAIM` + `incidents:RELEASE`.

### 1.5 Semántica verificada con codegraph (modelos y repositorios)

La auditoría de migraciones y seeders no alcanza: la semántica del esquema vive en
los modelos Eloquent. Lo relevante que sólo aparece ahí:

| Hallazgo | Fuente | Consecuencia |
|----------|--------|---------------|
| `Location` usa `HasRecursiveRelationships`; `ancestorsAndSelf()` / `descendantsAndSelf()` se usan en el ruteo de organizaciones y en los filtros de estadísticas | `Locations/Models/Location.php`, `Incidents/Http/Concerns/ScopesIncidentQueries.php` | nuestro `geo_zones.parent_id` existe pero **nadie lo recorre** (`geo-zone.entity.ts` lo documenta: "this module does not read through the hierarchy"). Filtrar incidentes por provincia no alcanza a sus cantones |
| `organizations.incident_category_id` es la relación viva; el pivot `category_organization` **no lo usa ninguna línea de código de aplicación** | `Organizations/Models/Organization.php::category()`, grep del pivot: sólo 3 migraciones | invalida la decisión de pivot N-M (ver D7) |
| `is_claimable` = identidad con `findForLocation()`, no `max_active_claims > 0` | `OrganizationController::notifiedFor()` | defecto de comportamiento en lo que T6 dio por cerrado |
| `Comment::getDepthAttribute()` satura en 2; `MAX_COMMENT_DEPTH = 2` en el frontend | `Comments/Models/Comment.php`, `frontend/app/shared/comment-item.js` | la profundidad máxima es 2, no 1 (ver D6) |
| `Incident::booted()` escribe `resolution_date = now()` al pasar a `Resolved` | `Incidents/Models/Incident.php` | confirma que nuestro T6.3 replicó la regla correcta |
| `assignedUsers()` declara `withPivot('assignment_role')->withTimestamps()` | `Incidents/Models/Incident.php` | respalda `assignments.updated_at` de D7.3 |
| Morph map de imágenes: `incident`, `comment`, **`user`** | `AppServiceProvider::boot()`, `Storage/Models/Image.php` | los avatares de usuario también viven en la tabla polimórfica; aquí son `users.avatar_url`. Divergencia ya aceptada |
| `Incident::resolutions()` referencia `ResolutionAudit` | `Incidents/Models/Incident.php:172` | **código muerto en legacy**: no existe ni la clase ni la tabla `resolution_audits`. Verificado por `find` y por grep en migraciones. No portar |

**Objetos de base creados fuera de migraciones**: ninguno. No hay `CREATE VIEW`,
`CREATE MATERIALIZED VIEW`, `CREATE FUNCTION`, `CREATE TRIGGER` ni `CREATE INDEX`
en `app/`. Todo el DDL de legacy está en `database/migrations/`, así que la
auditoría de esquema no tiene puntos ciegos por ese lado.

---

## 2. Decisiones

### D1 — `schema_migrations` gestionada por SQL, no por TypeORM

**Elegido**: tabla propia creada por `0030`, escrita por el runner y por cada
migración manual.

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     varchar(8)  PRIMARY KEY,
  name        text        NOT NULL,
  checksum    char(64)    NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
```

**Rechazado**: `TypeORM migrations` (`migrationsRun`). El proyecto tiene fijado
`synchronize:false` y `migrationsRun:false` en todos los entornos (CC3, ver cabecera
de `0001_initial_schema.sql`); el camino de producción es pegar SQL en el editor de
Supabase. Activar el runner de TypeORM crearía dos fuentes de verdad.

**Backfill condicional** — sólo marca 0001–0029 como aplicadas si el esquema que
crearon realmente existe:

```sql
INSERT INTO schema_migrations (version, name, checksum, applied_at)
SELECT v.version, v.name, 'backfill', now()
FROM (VALUES ('0001','initial_schema'), … ('0029','incident_images')) AS v(version, name)
WHERE EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'incidents')
ON CONFLICT (version) DO NOTHING;
```

En una base vacía el `EXISTS` es falso, no se inserta nada y el runner aplica todo
desde cero (R1.3).

### D2 — Checksum SHA-256 del archivo, no de la sentencia normalizada

El runner calcula `sha256(contenido del archivo)` y lo compara con lo registrado.
Editar una migración ya aplicada es un error operativo, no algo a tolerar: el runner
lo reporta y sale con código ≠ 0 (R2.4). Normalizar whitespace o comentarios
escondería ediciones reales.

### D3 — `updated_at` por trigger, no por aplicación

**Elegido**: una función y un trigger `BEFORE UPDATE` por tabla.

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

```sql
DROP TRIGGER IF EXISTS trg_set_updated_at ON comments;
CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Rechazado**: `@UpdateDateColumn()` de TypeORM. La mitad de las escrituras del
proyecto son SQL crudo vía repositorios (`incidents.repository.ts`,
`organizations.repository.ts`) que no pasan por el EntityManager; el decorador
sólo cubriría el camino de TypeORM y produciría timestamps inconsistentes.

En las entidades, `updatedAt` se mapea como columna **de sólo lectura**:

```ts
@Column({ name: 'updated_at', type: 'timestamptz', update: false })
updatedAt!: Date;
```

`update: false` impide que TypeORM lo incluya en los `UPDATE`, dejando la
responsabilidad exclusivamente en el trigger (R8.5).

### D4 — Soft delete manual, coherente con T6.2

**Elegido**: columna `deleted_at TIMESTAMPTZ NULL` + índice parcial + filtro
explícito `AND deleted_at IS NULL` en todas las queries.

**Rechazado**: `@DeleteDateColumn()` / `softRemove()` de TypeORM, por el mismo
motivo que D3 — no cubre el SQL crudo, y mezclarlo con el patrón manual de T6.2
daría dos semánticas de borrado en el mismo código base.

Índice por tabla:

```sql
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at
  ON comments (deleted_at) WHERE deleted_at IS NULL;
```

**Cascada de soft delete**: Postgres no propaga `UPDATE` en cascada. El borrado en
cascada lógico (R9.6: borrar un comentario raíz marca sus respuestas) se resuelve en
el servicio, en una sola sentencia:

```sql
UPDATE comments SET deleted_at = now()
WHERE (id = $1 OR parent_id = $1) AND deleted_at IS NULL;
```

Es suficiente porque la profundidad máxima es 1 (D6). Si algún día se permite más
profundidad, hay que reemplazarla por un `WITH RECURSIVE`.

### D5 — `deleted_at` en `roles` y `permissions` no invalida la caché sola

`AuthService` cachea permisos efectivos en Redis. Soft-deletear un rol o un permiso
no dispara ninguna invalidación por sí mismo. El servicio de administración debe
bumpear `users.permission_version` de los usuarios afectados en la misma
transacción — la columna ya existe y ya es el mecanismo de invalidación del proyecto.

### D6 — Threading de comentarios: profundidad máxima 2

**Corrección.** La primera versión de este design fijó profundidad máxima 1
("no se responde a una respuesta"). Codegraph muestra que legacy permite **dos
niveles de anidamiento**, no uno:

- `Comment::getDepthAttribute()` devuelve `0` (raíz), `1` (respuesta) o `2`
  (respuesta a una respuesta), y satura ahí.
- `frontend/app/shared/comment-item.js` exporta `MAX_COMMENT_DEPTH = 2` y habilita
  el botón de responder mientras `comment.depth < MAX_COMMENT_DEPTH`.

Es decir: tres niveles visibles (0, 1, 2), y se puede responder a los de nivel 0 y 1.

**Dónde se enforcea**: sólo en el frontend. `StoreCommentRequest` valida
`'parent_id' => ['nullable','integer','exists:comments,id']` — nada más. El backend
legacy acepta cualquier profundidad; la UI es la que no ofrece el botón.

**Decisión aquí**: enforcear en el servicio, no confiar en el cliente. Si el
`parent_id` recibido ya tiene profundidad 2, se responde 400. La profundidad se
calcula igual que el accessor de legacy: sin padre → 0; padre sin padre → 1; resto → 2.

```sql
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES comments (id) ON DELETE CASCADE,
  ADD CONSTRAINT chk_comments_no_self_parent CHECK (parent_id IS DISTINCT FROM id);
```

La profundidad **no** se enforcea en base: requeriría un trigger recursivo por una
regla de producto. El CHECK sólo corta la auto-referencia directa.

**Impacto sobre la cascada de soft delete**: con profundidad 2 la sentencia de un
solo nivel (`WHERE id = $1 OR parent_id = $1`) ya no alcanza — hay nietos. Se
resuelve con `WITH RECURSIVE`:

```sql
WITH RECURSIVE thread AS (
  SELECT id FROM comments WHERE id = $1
  UNION ALL
  SELECT c.id FROM comments c JOIN thread t ON c.parent_id = t.id
)
UPDATE comments SET deleted_at = now()
WHERE id IN (SELECT id FROM thread) AND deleted_at IS NULL;
```

### D7 — Ruteo organización↔categoría: FK simple con NULL transversal, NO pivot

**Corrección de una decisión previa.** La primera versión de este design eligió un
pivot `organization_categories` N-M, razonando que el pivot `category_organization`
de legacy era su "estado final útil". Codegraph desmiente eso: el pivot **no lo usa
ninguna línea de código de aplicación** — sólo aparece en tres migraciones de
normalización. La relación viva es `organizations.incident_category_id`, un
`belongsTo` simple (`Organization::category()`).

El algoritmo real está en `EloquentOrganizationRepository::findNotifiedFor()`:

```php
$locationIds = $location->ancestorsAndSelf()->pluck('id');

return $this->newQuery()
    ->whereIn('location_id', $locationIds)
    ->where(fn ($q) => $q
        ->whereIn('incident_category_id', $this->categoryAncestorIds($categoryId))
        ->orWhereNull('incident_category_id'))
    ->orderBy('id')
    ->get();
```

Tres reglas que hay que portar, y ninguna es un pivot:

1. **Ancestría de ubicación**: se notifica a toda organización cuyo `location_id`
   esté en la cadena `ancestorsAndSelf` de la ubicación del incidente. Una org a
   nivel provincia cubre los incidentes de sus cantones y parroquias.
2. **Ancestría de categoría**: `categoryAncestorIds()` sube por `parent_id`. Una org
   configurada para una categoría raíz cubre todas sus subcategorías.
3. **NULL = transversal**: `orWhereNull('incident_category_id')` es deliberado. Una
   org sin categoría (un GAD municipal) se notifica para cualquier categoría.

Y `is_claimable` **no** es `max_active_claims > 0`. Es identidad con el resultado de
`findForLocation()`, que aplica el mismo filtro y toma `orderBy('id')->first()`:
la org que el auto-assign elegiría. El orden estable por id existe justamente para
que el frontend pueda marcar "Principal" sin ambigüedad.

**Consecuencia sobre lo ya implementado (T6)**: nuestro `notifiedFor` resuelve una
sola zona plana (`findByZone`), devuelve como mucho **una** organización, y calcula
`is_claimable: org.max_active_claims > 0`. Las tres cosas divergen del legacy. No es
un gap de esquema solamente — es un defecto de comportamiento que T6 dio por cerrado.

**Consecuencia sobre el esquema**: `uq_organizations_zone` (UNIQUE parcial sobre
`organizations(zone_id)`, de 0015) es **incompatible** con este modelo. Legacy tiene
varias organizaciones a distintos niveles del árbol de ubicaciones, todas
notificadas para el mismo incidente. Nuestro UNIQUE permite exactamente una por
zona. Hay que eliminarlo, no sólo hacerlo parcial por `parent_id` como decía la
versión anterior de este documento.

Esquema resultante:

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS incident_category_id uuid NULL
    REFERENCES incident_categories (id) ON DELETE SET NULL;

DROP INDEX IF EXISTS uq_organizations_zone;

CREATE INDEX IF NOT EXISTS idx_organizations_zone_category
  ON organizations (zone_id, incident_category_id);
```

Y la query, con las dos ancestrías resueltas por CTE recursiva:

```sql
WITH RECURSIVE zone_chain AS (
  SELECT id, parent_id FROM geo_zones WHERE id = $1
  UNION ALL
  SELECT z.id, z.parent_id FROM geo_zones z JOIN zone_chain c ON z.id = c.parent_id
), cat_chain AS (
  SELECT id, parent_id FROM incident_categories WHERE id = $2
  UNION ALL
  SELECT c.id, c.parent_id FROM incident_categories c JOIN cat_chain cc ON c.id = cc.parent_id
)
SELECT o.* FROM organizations o
WHERE o.zone_id IN (SELECT id FROM zone_chain)
  AND (o.incident_category_id IN (SELECT id FROM cat_chain)
       OR o.incident_category_id IS NULL)
  AND o.deleted_at IS NULL
ORDER BY o.created_at, o.id;
```

`ORDER BY` no puede ser por `id`: los nuestros son uuid v4, sin orden temporal. Se
ordena por `created_at, id` para que el "principal" sea determinístico y estable.

### D8 — `organizations.parent_id` revierte parcialmente la decisión T3.2

T3.2 decidió no darle jerarquía a `organizations` porque `geo_zones` ya era la
jerarquía administrativa. Es correcto para **territorio**, pero no cubre la
jerarquía **institucional** (una dirección municipal que depende de un municipio,
ambos en la misma zona). Legacy tiene ambas y son ortogonales.

`parent_id` se agrega con `ON DELETE SET NULL` — borrar la organización padre
huerfaniza a las hijas en vez de arrastrarlas.

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES organizations (id) ON DELETE SET NULL,
  ADD CONSTRAINT chk_organizations_no_self_parent CHECK (parent_id IS DISTINCT FROM id);
```

El CHECK cubre el ciclo directo (R10.3); los ciclos indirectos (A→B→A) se validan en
el servicio al asignar padre. `tree()` pasa a construir el árbol desde `parent_id`.

### D9 — Categoría hoja: trigger en base, con soft delete considerado

Es el único de los cuatro triggers legacy que se porta, porque es una **invariante de
datos** (no puede violarse ni siquiera con SQL directo) y no duplica lógica de
aplicación existente.

```sql
CREATE OR REPLACE FUNCTION check_is_leaf_category() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM incident_categories
    WHERE parent_id = NEW.category_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INCIDENT_CATEGORY_NOT_LEAF: %', NEW.category_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Dos diferencias deliberadas con el legacy:

1. `AND deleted_at IS NULL` — una hija borrada no debe impedir usar al padre (R14.4).
   Legacy no lo contempla porque su trigger es anterior a su propio soft delete.
2. `ERRCODE = 'check_violation'` (23514) — permite que el filtro de excepciones de
   NestJS lo traduzca a 400 en vez de 500 (R14.3).

**Orden**: 0036 es de las últimas migraciones del change precisamente porque puede
romper seeds y fixtures. Antes de escribirla hay que auditar `database/seeds/` y los
fixtures de los e2e existentes.

### D10 — Índices: sólo los que faltan, sin duplicar

Del set legacy se descartan los que ya existen con otro nombre en nuestro esquema
(`idx_incidents_status`, `idx_incidents_org_created` cubre `idx_incidents_org_status`,
`idx_geo_zones_geom` cubre `locations_geom_gist_idx`, `idx_incidents_location` cubre
`incidents_geom_gist_idx`). Sólo se crean los 9 de R16.1.

Todos con `CREATE INDEX IF NOT EXISTS`, sin `CONCURRENTLY`: las migraciones corren
dentro de `BEGIN/COMMIT` y `CONCURRENTLY` no es válido en transacción. El volumen
actual no lo justifica.

**T7.8.A4 (auditoría de `pg_indexes`, ejecutada) — 5 de los 9 ya existían antes
de 0037**, creados por migraciones anteriores de este mismo change o por
constraints previos; crearlos de nuevo con otro nombre habría sido un
duplicado real, no uno evitado por `IF NOT EXISTS` (esa cláusula sólo protege
contra el mismo *nombre*, no contra la misma *definición* bajo un nombre
distinto):

| Columna de R16.1 | Índice que ya la cubre | Origen |
|---|---|---|
| `comments.parent_id` | `idx_comments_parent_id` | 0033 (T7.4) |
| `assignments.incident_id` | `uq_assignments_incident` (UNIQUE) | 0007 |
| `geo_zones.code` | `uq_geo_zones_code` (UNIQUE parcial) | 0035 (T7.6) |
| `invitations.token_hash` | constraint `UNIQUE` de columna + `idx_invitations_token_hash` parcial | 0018 + 0031 |
| `password_reset_tokens.token_hash` | constraint `UNIQUE` de columna + `idx_password_reset_tokens_user`-equivalente parcial | 0018 + 0031 |

0037 crea únicamente los **4** que de verdad faltaban:
`comments.user_id`, `status_history.changed_by_user_id`,
`incidents.priority`, `incidents.citizen_id`. R16.1 exige que el índice
*exista* al final de la cadena, no que lo cree 0037 — las 5 columnas
restantes ya lo satisfacían.

### D11 — Dos clases de datos, dos destinos

El error a evitar es meter data de demo en el pipeline de migraciones. La regla:

| Clase | Ejemplos | Dónde vive | Se aplica en prod |
|-------|----------|------------|-------------------|
| **Referencia** — sin ella el sistema no funciona | categorías, permisos, roles, geo_zones, organizaciones reales | `database/migrations/` (0038, 0039) | ✅ sí |
| **Demo / volumen** — sirve para probar o mostrar | 25 incidentes de Santa Elena, 1000 del load test, usuarios de prueba | `database/seeds/` + script | ❌ nunca |

Legacy los mezcla: su `DatabaseSeeder` corre `IncidentCategorySeeder` (referencia)
y `MassIncidentSeeder` (1000 incidentes de volumen) en el mismo `db:seed`. Aquí se
separan.

**Idempotencia del árbol de categorías**: `firstOrCreate(['name','parent_id'])` de
Eloquent se traduce a un índice UNIQUE más `ON CONFLICT DO NOTHING`. La columna
`parent_id` es nullable y en Postgres `NULL` no colisiona consigo mismo en un
UNIQUE normal, así que las 5 raíces necesitan un índice parcial aparte:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_root
  ON incident_categories (name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_child
  ON incident_categories (name, parent_id) WHERE parent_id IS NOT NULL;
```

Sin ese par de índices, re-aplicar 0038 duplica el árbol entero.

**Orden dentro de 0038**: primero las 5 raíces con `RETURNING id`, después las 18
hojas resolviendo el padre por nombre en un CTE. No se pinean uuids: se resuelve
por nombre, que es la clave natural del catálogo.

### D13 — T7.7 auditoría ejecutada: 4 FK sin cláusula, no 6; organization_id normalizado a RESTRICT

**T7.7.A1 (auditoría previa, bloqueante) — resultado**: se revisaron
`database/seeds/` (sólo `0003_seed_geo_zones.generated.sql` y el generador de
geo_zones; no hay seed de `incidents` ni de `incident_categories` — 0038/0039
siguen sin aplicar) y todos los fixtures de `backend/test/` que insertan
`incidents.category_id` o `incident_categories`. **Ningún incidente de seed o
fixture usa una categoría con hijos** (`incident-categories.e2e-spec.ts` TS-8
usa una categoría hoja standalone; `t7-org-hierarchy-categories.e2e-spec.ts`
no toca `incidents.category_id`). **T7.7.A2 no tuvo nada que corregir** — el
hallazgo se documenta aquí en vez de silenciarse, tal como pide la tarea.

**T7.7.C1 (inventario de FK) — resultado real, distinto de la estimación
original de este documento**: un parseo programático de los 29+5 migraciones
(`grep`/`awk` sobre cada cláusula `REFERENCES`, no sobre líneas sueltas —
una FK puede partir `REFERENCES` y `ON DELETE` en líneas distintas) encuentra
**4** FK sin cláusula `ON DELETE` explícita (NO ACTION implícito), no 6 como
estimaba la §1.3 original:

| Tabla.columna | Referencia | Hoy | Decisión final (0036) |
|---|---|---|---|
| `incidents.citizen_id` | `users(id)` | NO ACTION implícito, `NOT NULL` | `ON DELETE SET NULL` (mandado por R15.4) + columna pasa a `NULL`-able |
| `incidents.assigned_to` | `users(id)` | NO ACTION implícito | `ON DELETE SET NULL` (ya nullable; coherente con `claimed_by`/`approved_by`/`rejected_by`, todos SET NULL) |
| `comments.user_id` | `users(id)` | NO ACTION implícito, `NOT NULL` | `ON DELETE SET NULL` + columna pasa a `NULL`-able. **Se descarta CASCADE**: `comments.parent_id` ya es `ON DELETE CASCADE` (0033) — un `user_id` en CASCADE borraría el comentario del usuario y esa fila arrastraría en cascada a sus respuestas de profundidad 2, afectando el hilo de terceros que nunca deberían perder su conversación por el borrado físico de un participante |
| `assignments.operator_id` | `users(id)` | NO ACTION implícito, `NOT NULL` | `ON DELETE CASCADE` (se mantiene `NOT NULL`). Una asignación sin operador no es un estado válido — a diferencia de un comentario, no hay contenido que preservar; el incidente vuelve a quedar disponible para asignar |

Además, un FK que **sí tiene** cláusula explícita hoy pero contradice R15.3 se
normaliza en la misma migración:

| Tabla.columna | Hoy (0015) | Decisión final (0036) |
|---|---|---|
| `incidents.organization_id` | `ON DELETE SET NULL` | `ON DELETE RESTRICT` — R15.3 exige que borrar una organización con incidentes asociados sea rechazado, no que los incidentes queden huérfanos |

**Las 2 inconsistencias documentadas en §1.3** (`roles(id)` y
`incident_categories(id)` referenciadas con comportamientos distintos entre
migraciones) se revisan y se **dejan como están, deliberadamente**:

- `users.role_id` → `roles(id)` `ON DELETE SET NULL`: un usuario sobrevive a
  que se borre su rol (pierde el vínculo, no la cuenta).
- `invitations.role_id` → `roles(id)` `ON DELETE RESTRICT`: una invitación
  pendiente sin rol válido es un estado sin sentido de negocio; se prefiere
  bloquear el borrado del rol mientras haya invitaciones activas apuntándolo.
- `incident_categories.parent_id` → `incident_categories(id)` `ON DELETE SET
  NULL`: borrar una categoría promueve a sus hijas a raíz (ya cubierto por
  `incident-categories.e2e-spec.ts` TS-7).
- `incidents.category_id` → `incident_categories(id)` `ON DELETE RESTRICT`:
  no se puede borrar una categoría referenciada por incidentes existentes
  (ya cubierto por TS-8).

No son la misma relación conceptual pese a compartir tabla destino — cada una
tiene una razón de producto independiente y correcta. Normalizarlas a un
único comportamiento sería forzar una uniformidad que la auditoría no
respalda. Se documentan aquí para cerrar el hallazgo de la §1.3, sin cambios
de esquema.

### D12 — Sembrar organizaciones exige acordar los datos reales

`OrganizationSeeder` de legacy siembra GAD de Quito, Guayaquil, Cuenca, Ambato y
Loja — datos de su despliegue, no del nuestro. Portarlos literalmente metería
organizaciones inexistentes en Santa Elena.

0039 siembra únicamente las organizaciones reales del despliegue, **y esa lista es
un input del operador, no una decisión del arquitecto**. La tarea correspondiente
en `tasks.md` está marcada como bloqueada hasta tener esa lista confirmada.

La restricción que ya existe manda: `uq_organizations_zone` es un UNIQUE parcial
sobre `organizations(zone_id)` — una organización por zona. Con 4 geo_zones
sembradas hoy, el techo son 4 organizaciones raíz; las sucursales de D7.5 cuelgan
por `parent_id` y comparten `zone_id` del padre, lo que **viola ese UNIQUE**.

Consecuencia de diseño: si se quieren sucursales, `uq_organizations_zone` tiene que
pasar a ser `UNIQUE (zone_id) WHERE parent_id IS NULL` — sólo una organización
*raíz* por zona. Ese cambio va en 0034 (D7.5), no en 0039, y está anotado como
tarea explícita.

> Nota (T7.9 apply): T7.5.A2b (0034) ya **eliminó por completo**
> `uq_organizations_zone` en vez de hacerlo parcial (ver tasks.md T7.5.A2b) —
> el modelo real necesita varias organizaciones notificadas por zona a
> distintos niveles de la jerarquía, no sólo una raíz. Este párrafo de D12
> describe la restricción tal como estaba antes de T7.5 y queda como
> contexto histórico del bloqueo de T7.9.C1; no aplica al esquema actual.

### D14 — T7.9 apply: conteo real del árbol de categorías (22, no 23) y alcance del guard de notificaciones

**Árbol de categorías (T7.9.A)**: la §1.4 de este documento y el spec R19
original estimaban 23 categorías (5 raíces + 18 hojas). Un conteo directo del
array `CATEGORY_TREE` en
`GeoReporta/backend/database/seeders/IncidentCategorySeeder.php` (verificado
en dos copias independientes del repositorio legacy) da 5 raíces + **17**
hojas = **22** categorías: 4 bajo Infraestructura Vial, 4 bajo Servicios
Básicos, 3 bajo Seguridad Ciudadana, 3 bajo Medio Ambiente, 3 bajo Obras e
Infraestructura. El spec (`specs/database-schema/spec.md` R19.1) se corrigió
para reflejar 22/17 — se prioriza el código fuente legacy sobre la estimación
de diseño, igual que hizo T7.7/T7.8 con sus propias auditorías (D13, D10).

**Permisos de notificaciones (T7.9.B) — alcance del `@RequirePermission`**:
`NotificationsController.approve`/`.reject` (T5.6) ya usan
`@RequirePermission('UPDATE')` desde que se escribieron — el gap real (G23)
no era código de autorización faltante, era **datos**: ningún rol tenía
`'UPDATE notifications'` en su `roles.permissions` JSONB, así que esas dos
rutas devolvían 403 para absolutamente cualquier usuario, incluido
`admin_sistema`, hasta que 0039 concede el permiso. Confirmado con
`grep -rn "UPDATE notifications" database/migrations/` antes de escribir
0039: cero resultados.

Decisión explícita (T7.9.B3): las rutas de notificaciones propias
(`GET /notifications`, `GET /notifications/unread(-count)`,
`PATCH /notifications/:id/read`, `PATCH /notifications/read-all`) **se
quedan sólo con `JwtAuthGuard`**, sin `@RequirePermission`. Están acotadas
por `req.user.userId` — cualquier usuario autenticado, del rol que sea,
puede leer y marcar como leídas SUS PROPIAS notificaciones; exigir
`'READ notifications'` de rol rompería ese flujo para `reporter`, que nunca
tiene (ni debe tener) ese permiso genérico. Es el mismo patrón que
`GET /users/me` no exige `'READ users'`. `approve`/`reject` sí son
operaciones administrativas sobre notificaciones ajenas (aprobar/rechazar el
incidente de otro usuario) y correctamente exigen el permiso de rol.

La fila `(notifications, READ)` del catálogo se agrega por paridad con el
`notifications:view` de legacy y quedó sin ningún `@RequirePermission('READ')`
que la consuma hoy — es catálogo informacional (igual que otras filas del
catálogo, design D3), reservada para una futura vista administrativa de
notificaciones. No se crea ese endpoint en este batch.

**Alcance de 0039 en este batch**: sólo Fase B (permisos de notificaciones).
Fase A (0038, árbol de categorías) es un archivo separado. Fase C
(geografía + organizaciones semilla) sigue bloqueada por T7.9.C1 (D12) y no
se tocó `0039_organizations_permissions.sql` más allá de sus dos sentencias
de Fase B — el archivo crecerá cuando llegue el input del operador.

**Hallazgo colateral (no corregido en este batch)**: `0029_incident_images.sql`
otorga `'incident-images:CREATE'` / `'incident-images:DELETE'` a
`operador_organizacion`/`admin_organizacion` — formato `resource:ACTION`, no
el canónico `"ACTION resource"` que `formatPermissionString`/`hasPermission`
(`require-permission.decorator.ts`) realmente comparan. Esas dos cadenas
nunca han hecho match con nada; si algún endpoint de `incident-images` ya usa
`@RequirePermission('CREATE'|'DELETE')`, ambos roles reciben 403 hoy. Se
documenta aquí porque T7.9.B lo hizo visible al auditar `roles.permissions`
de `operador_organizacion` para R20.2; corregirlo es un cambio de esquema
independiente (una migración 0040 que reemplace esas dos cadenas), fuera del
alcance de D7.9.

---

## 3. Cambios de entidad (TypeORM)

| Entidad | Cambio |
|---------|--------|
| `comment.entity.ts` | `+ parentId: string \| null`, `+ deletedAt: Date \| null`, `+ updatedAt: Date` (`update:false`) |
| `notification` (sin entidad; SQL crudo) | filtro `deleted_at IS NULL` en el repositorio |
| `organization.entity.ts` | `+ parentId`, `+ deletedAt`, `+ updatedAt` |
| `incident-category.entity.ts` | `+ deletedAt` |
| `geo-zone.entity.ts` | `+ code: string \| null`, `+ deletedAt`, `+ updatedAt` |
| `role.entity.ts` | `+ deletedAt`, `+ updatedAt` |
| `permission.entity.ts` | `+ deletedAt`, `+ updatedAt` |
| `user.entity.ts` | `+ phone: string \| null` |
| `assignment.entity.ts` | `+ updatedAt` |
| `invitation.entity.ts` | `+ updatedAt` |
| `comment-image.entity.ts`, `incident-image.entity.ts` | `+ updatedAt` |
| `password-reset-token.entity.ts` | `+ updatedAt` |
| `user-session.entity.ts` | `+ updatedAt` |
| **nuevo** `organization-category.entity.ts` | `@Entity('organization_categories')`, PK compuesta |

Patrón de columna, idéntico al ya usado en `incident.entity.ts` tras T6.2:

```ts
@Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
deletedAt!: Date | null;
```

`SnakeCaseResponseInterceptor` sigue haciendo la conversión camelCase↔snake_case;
ninguna respuesta de API cambia de forma por estas columnas salvo las declaradas en
el spec (`phone`, `code`, `parent_id`).

---

## 4. Runner de migraciones

**Ubicación**: `backend/scripts/run-migrations.ts` — la ruta que el doc base ya
promete. Reutiliza el criterio de orden y el uso de simple query protocol de
`backend/test/support/run-migrations.ts`, que se mantiene para los e2e (aplica todo
desde cero contra Testcontainers, sin tracking).

```
1. Conecta con DATABASE_URL
2. CREATE TABLE IF NOT EXISTS schema_migrations  (idéntico a 0030)
3. Lee database/migrations/[0-9]*.sql en orden numérico
4. Para cada archivo:
     checksum = sha256(contenido)
     si version ya registrada:
         si checksum difiere -> ERROR drift, exit 1
         si no -> skip
     si no:
         BEGIN
           ejecuta el SQL
           INSERT INTO schema_migrations (version, name, checksum)
         COMMIT
         en error -> ROLLBACK, log, exit 1  (no continúa con las siguientes)
5. Imprime resumen: aplicadas / omitidas / total
```

Scripts nuevos en `backend/package.json`:

```json
"db:migrate": "ts-node scripts/run-migrations.ts",
"db:migrate:status": "ts-node scripts/run-migrations.ts --status",
"db:rollback": "ts-node scripts/run-migrations.ts --down --to <version>"
```

`--down` lee de `database/rollback/` en orden inverso y borra la fila de
`schema_migrations` correspondiente.

**Sigue siendo válido** el camino manual de Supabase: la migración pegada a mano
incluye su propio `INSERT INTO schema_migrations`, por eso cada archivo `.sql` de
0030 en adelante termina con:

```sql
INSERT INTO schema_migrations (version, name, checksum)
VALUES ('0031', 'soft_delete_completeness', 'manual')
ON CONFLICT (version) DO NOTHING;
```

El runner reconoce `'manual'` como checksum comodín y no lo reporta como drift.

---

## 5. Archivos afectados

| Archivo | Acción |
|---------|--------|
| `database/migrations/0030..0039_*.sql` | crear (10) |
| `database/rollback/0030..0039_*.DOWN.sql` | crear (10) |
| `database/MIGRATION_LOG.md` | 10 filas nuevas + corregir estado de 0024–0029 |
| `database/seeds/demo-incidents.sql` (o script) | crear — data de demo/volumen, fuera del pipeline de migraciones |
| `backend/scripts/run-migrations.ts` | crear |
| `backend/package.json` | 3 scripts nuevos |
| `backend/src/entities/*.ts` | 13 entidades modificadas + 1 nueva |
| `backend/src/modules/comments/comments.service.ts` | threading + soft delete |
| `backend/src/modules/comments/dto/create-comment.dto.ts` | `parent_id?` |
| `backend/src/modules/organizations/organizations.service.ts` | `tree()` jerárquico, `notifiedFor()` con categoría |
| `backend/src/modules/organizations/organizations.repository.ts` | join al pivot, filtro soft delete |
| `backend/src/modules/notifications/notifications.repository.ts` | filtro soft delete |
| `backend/src/modules/geo-zones/*` | `code`, filtro soft delete |
| `backend/src/modules/users/users.service.ts` | `phone` en perfil y en el wipe GDPR |
| `backend/src/modules/incidents/incidents.service.ts` | traducción del error 23514 a 400 |
| `backend/test/e2e/t7-*.e2e-spec.ts` | crear (8 specs) |
| `docs/tasks/3-DATABASE-SCHEMA.md` | actualizar al estado real |

---

## 6. Riesgo de orden

Las migraciones tienen dependencias reales entre sí:

```
0030 (tracking)      ── independiente, va primera para que el resto quede registrado
0031 (deleted_at)    ── requerida por 0036 (el trigger consulta deleted_at)
0032 (updated_at)    ── independiente
0033 (parent_id)     ── requerida por 0037 (índice sobre comments.parent_id)
0034 (org jerarquía) ── requiere 0031 (la query del pivot filtra deleted_at)
0035 (code, phone)   ── requerida por 0037 (índice sobre geo_zones.code)
0036 (integridad)    ── requiere 0031; última con riesgo de romper seeds
0037 (índices)       ── requiere 0033 y 0035; sin riesgo propio
0038 (categorías)    ── requiere 0031 (el árbol se siembra con deleted_at NULL) y
                        DEBE ir después de 0036: sembrar antes deja incidentes de
                        test apuntando a categorías que pasarán a ser padres
0039 (referencia)    ── requiere 0034 (parent_id y el UNIQUE ajustado) y 0035
                        (geo_zones.code, clave por la que se resuelven las zonas)
```

El orden numérico ya respeta estas dependencias. No reordenar.

**Dependencia cruzada a no perder de vista**: 0039 no puede sembrar sucursales
mientras `uq_organizations_zone` siga siendo `UNIQUE (zone_id)` a secas. El ajuste
a `UNIQUE (zone_id) WHERE parent_id IS NULL` va en 0034 y es prerequisito duro.
