# Spec: Database Schema Parity & Hardening

**Domain**: database-schema
**Source change**: t7-database-schema-parity (archived 2026-08-24)
**Version**: R2
**Date**: 2026-08-24
**Update**: 2026-08-26 — Merged the `t7-geography-organizations-seed`
change (T7.9.C/D/Z) on archive. R21 and R22 are now fully re-anchored
in-line to migration `0041_geography_organizations_seed.sql` (no more
stray "0039" references in R21/R22 scenario text) and extended with the
scenarios added by that change (R21.0 code-backfill ordering, R22.5/R22.6
users seeder). Three new requirements were added: R23 (migration
documentation), R24 (pre-deploy CI verification), R25 (Supabase
deployment prep). Archived source artifacts for full traceability live
at `openspec/changes/archive/2026-08-26-t7-geography-organizations-seed/`.

> Todos los escenarios se validan con Postgres + PostGIS real (Testcontainers),
> nunca con mocks. Un escenario se considera cumplido sólo si existe un test que
> pasa y prueba el comportamiento en runtime.

---

## Compliance Status (as of 2026-08-26, post-reanchor)

| Requirement Group | Status | Notes |
|---|---|---|
| R1-R4 (D7.1 tooling) | ✅ Compliant | Migration 0030 applied; runner `--down`/package.json scripts (T7.1.B4/B5) and DOWN-file audit (T7.1.C3) still open, non-blocking |
| R5-R7 (D7.2 soft delete) | ✅ Compliant | Migration 0031 applied; app-level repository filters (T7.2.B/C) folded incrementally into T7.4/T7.5/T7.6 work |
| R8 (D7.3 updated_at trigger) | ✅ Compliant | Migration 0032 applied (commit d7031ae); entity-level `update:false` pattern (T7.3.A5–A7) still open in tasks.md bookkeeping, non-blocking for the DB-level requirement |
| R9 (D7.4 comment threading) | ✅ Compliant | Migration 0033 |
| R10-R11 (D7.5 org hierarchy + routing) | ✅ Compliant | Migration 0034; **R10.4/R10.5 superseded** — see note below |
| R12-R13 (D7.6 domain columns) | ✅ Compliant | Migration 0035 |
| R14-R15 (D7.7 referential integrity) | ✅ Compliant | Migration 0036 |
| R16 (D7.8 index parity) | ✅ Compliant | Migration 0037 (4 of 9 indexes newly created; 5 already existed under other names — see design.md D10) |
| R17-R18 (transversal / docs) | ✅ Compliant | R17 cerrado por `t8-database-cutover` R37 (systematic DOWN audit sobre los 41 archivos + ciclo up/down completo en `t7-rollback-cycle.e2e-spec.ts`); R18 cerrado por R31.1 de `t8-database-cutover` (`docs/tasks/3-DATABASE-SCHEMA.md` re-sincronizado contra el runbook `docs/runbooks/cutover.md`) |
| R19-R20 (D7.9 category tree + notification perms) | ✅ Compliant | Migrations 0038, 0039 (Fase B only) |
| R21 (D7.9 geography + seed orgs) | ✅ Compliant | Migración `0041_geography_organizations_seed.sql`. Fuente OpenStreetMap (`admin_level=8`, ODbL 1.0) — INEC DPA rechazada por falta de licencia. Migración committed y verde en CI; **aplicación en Supabase queda `⏳ Pending`** (ver `database/MIGRATION_LOG.md` fila 0041 y `docs/runbooks/apply-0041.md`) |
| R22 (D7.9 demo/volume data separation) | ✅ Compliant | `database/seeds/` pipeline (`users.js`, `demo-incidents.js`, `volume-incidents.js`) + migration 0041 (geo/orgs nunca vía seed script). E2E: `t7-seeding-pipeline`, `t7-users-seed`, `t7-volume-seed` |
| R23 (D7.9.Z docs de migración 0041) | ✅ Compliant | `database/MIGRATION_LOG.md` fila 0041, `docs/tasks/3-DATABASE-SCHEMA.md` rango 0001–0041 |
| R24 (D7.9.Z verificación pre-deploy) | ✅ Compliant | Backend 2026-08-26: lint 0 errores, typecheck limpio, build limpio, jest 856/856 unit + 399/399 e2e, migration suites verdes |
| R25 (D7.9.Z preparación deployment Supabase) | ✅ Compliant | `docs/runbooks/apply-0041.md` — pre-flight, aplicación, 5 checkpoints, idempotencia, rollback |

**Note on R10.4/R10.5**: the scenarios below describing a *partial* UNIQUE index
(`UNIQUE (zone_id) WHERE parent_id IS NULL`) are historical — implementation
(migration 0034, T7.5.A2b) went further and **removed `uq_organizations_zone`
entirely**, because the legacy notification model requires multiple
organizations at different hierarchy levels to be notified for the same zone,
not just a root + its own branches. See design.md D7 and D12. The scenarios
that supersede R10.4/R10.5 are **R11.1** (verifies the index no longer exists)
and **R11.2** (multiple organizations per zone are valid). R10.4/R10.5 text is
preserved below for audit continuity and in the archived delta at
`openspec/changes/archive/2026-08-24-t7-database-schema-parity/specs/database-schema/spec.md`.

---

## D7.1 — Tooling de migraciones y trazabilidad

### R1 — Registro de migraciones aplicadas

**Background**: hoy no existe forma programática de saber qué migraciones se
aplicaron a una base. `MIGRATION_LOG.md` es un archivo Markdown editado a mano.

```
Scenario R1.1 — Tabla de tracking existe tras 0030
  Given  una base vacía
  When   se aplican las migraciones 0001 a 0030 en orden numérico
  Then   existe la tabla schema_migrations con columnas
         (version text PK, name text, applied_at timestamptz, checksum text)

Scenario R1.2 — Backfill de migraciones históricas
  Given  una base donde ya se aplicaron 0001 a 0029
  When   se aplica 0030
  Then   schema_migrations contiene 30 filas, versiones '0001' a '0030'
  And    applied_at de las 29 históricas queda registrado con la marca del backfill

Scenario R1.3 — Backfill no inventa historia en base vacía
  Given  una base vacía sin ninguna tabla de dominio
  When   se aplica solamente 0030
  Then   schema_migrations existe
  And    contiene únicamente la fila de la propia versión '0030'

Scenario R1.4 — Re-aplicar una migración ya registrada es no-op
  Given  una base con 0001 a 0030 aplicadas
  When   se vuelve a ejecutar el archivo 0030
  Then   la ejecución termina sin error
  And    schema_migrations sigue teniendo exactamente una fila por versión
```

### R2 — Runner de migraciones idempotente

**Background**: `docs/tasks/3-DATABASE-SCHEMA.md` describe
`backend/scripts/run-migrations.ts` y `pnpm run db:migrate` como existentes.
No existen. Este requisito los crea.

```
Scenario R2.1 — Aplica sólo lo pendiente
  Given  una base con 0001 a 0029 aplicadas y registradas en schema_migrations
  When   se ejecuta el runner
  Then   aplica únicamente 0030 a 0039
  And    reporta en stdout la lista de versiones aplicadas y las omitidas

Scenario R2.2 — Segunda corrida no aplica nada
  Given  una base con todas las migraciones aplicadas
  When   se ejecuta el runner por segunda vez
  Then   no ejecuta ningún archivo SQL
  And    sale con código 0

Scenario R2.3 — Falla en modo estricto
  Given  una migración pendiente con SQL inválido
  When   se ejecuta el runner
  Then   la transacción de esa migración hace rollback
  And    la versión NO queda registrada en schema_migrations
  And    el proceso sale con código distinto de 0
  And    ninguna migración posterior se ejecuta

Scenario R2.4 — Detección de drift por checksum
  Given  una migración ya aplicada cuyo archivo .sql fue editado después
  When   se ejecuta el runner
  Then   reporta el checksum divergente para esa versión
  And    sale con código distinto de 0 sin re-ejecutarla
```

### R3 — Rollback ejercitado

**Background**: existen 29 archivos DOWN en `database/rollback/` que nunca se
ejecutaron. No hay evidencia de que reviertan lo que dicen revertir.

```
Scenario R3.1 — Ciclo completo up/down deja la base limpia
  Given  una base vacía
  When   se aplican todas las migraciones 0001 a 0039 en orden numérico
  And    luego se aplican todos los archivos DOWN en orden inverso (0039 a 0001)
  Then   no queda ninguna tabla de dominio en el esquema public
  And    no queda ninguna función ni trigger creado por las migraciones

Scenario R3.2 — Cada migración nueva tiene su DOWN
  Given  el directorio database/migrations
  When   se listan los archivos 0030 a 0039
  Then   para cada uno existe el archivo homónimo .DOWN.sql en database/rollback
```

### R4 — Log de migraciones fiel al estado real

```
Scenario R4.1 — Filas 0024-0029 reflejan la aplicación real
  Given  el operador aplicó 0024 a 0029 en Supabase el 2026-08-24
  When   se lee database/MIGRATION_LOG.md
  Then   esas 6 filas figuran como ✅ Applied con fecha 2026-08-24 y entorno supabase

Scenario R4.2 — Cada migración nueva queda registrada
  Given  las migraciones 0030 a 0039
  When   se lee database/MIGRATION_LOG.md
  Then   existe una fila por cada versión, con descripción y estado
```

---

## D7.2 — Soft delete completo

### R5 — Columna `deleted_at` en tablas de dominio

```
Scenario R5.1 — Columnas creadas en las 7 tablas
  Given  una base con 0001 a 0031 aplicadas
  When   se inspecciona information_schema.columns
  Then   comments, notifications, organizations, incident_categories,
         geo_zones, roles y permissions tienen deleted_at TIMESTAMPTZ NULL

Scenario R5.2 — Índice parcial por tabla
  Given  una base con 0031 aplicada
  When   se inspecciona pg_indexes
  Then   cada una de esas 7 tablas tiene un índice parcial WHERE deleted_at IS NULL

Scenario R5.3 — Valor por defecto NULL en filas existentes
  Given  filas preexistentes en comments antes de 0031
  When   se aplica 0031
  Then   todas esas filas tienen deleted_at IS NULL
  And    siguen siendo visibles en las queries de listado
```

### R6 — Borrado de comentario es soft delete

```
Scenario R6.1 — DELETE marca en vez de borrar
  Given  un comentario existente creado por el usuario autenticado
  When   hace DELETE /api/comments/{id}
  Then   responde 204
  And    la fila sigue en la tabla comments con deleted_at NOT NULL

Scenario R6.2 — El comentario borrado desaparece del listado
  Given  un incidente con 3 comentarios, uno de ellos soft-deleted
  When   hace GET /api/incidents/{id}/comments
  Then   responde 200 con exactamente 2 comentarios
  And    ninguno tiene el id del comentario borrado

Scenario R6.3 — Las imágenes del comentario borrado no se pierden
  Given  un comentario con 2 imágenes en comment_images
  When   el comentario se soft-deletea
  Then   las 2 filas de comment_images siguen existiendo
  And    no se emite ningún borrado contra S3
```

### R7 — Soft delete en el resto de tablas de dominio

```
Scenario R7.1 — Notificación borrada no se lista ni se cuenta
  Given  un usuario con 3 notificaciones no leídas, una soft-deleted
  When   hace GET /api/notifications/unread-count
  Then   responde 200 con { "unread_count": 2 }

Scenario R7.2 — Organización borrada no aparece en notified-for
  Given  una organización soft-deleted asociada a una zona
  When   hace GET /api/organizations/notified-for?location_id={zone_id}
  Then   responde 200 con un array vacío

Scenario R7.3 — Categoría borrada no aparece en el árbol de categorías
  Given  una categoría hija soft-deleted
  When   hace GET /api/incident-categories
  Then   responde 200 y esa categoría no está en el resultado

Scenario R7.4 — Geo-zone borrada no participa del geofencing
  Given  una geo_zone soft-deleted cuyo polígono contiene el punto (-2.2, -80.5)
  When   se crea un incidente en ese punto
  Then   el incidente queda con geofence_matched = false y zone_id NULL

Scenario R7.5 — Rol borrado no autentica
  Given  un usuario cuyo rol fue soft-deleted
  When   intenta acceder a un endpoint protegido con su token
  Then   responde 403

Scenario R7.6 — Permiso borrado deja de otorgar acceso
  Given  una fila de permissions soft-deleted para (incidents, CREATE)
  When   se recalculan los permisos efectivos de un rol que la tenía
  Then   ese rol ya no puede ejecutar la acción
```

---

## D7.3 — Columnas `updated_at` y trigger

### R8 — Función y triggers `set_updated_at`

```
Scenario R8.1 — Función creada
  Given  una base con 0032 aplicada
  When   se consulta pg_proc
  Then   existe la función set_updated_at() que retorna trigger

Scenario R8.2 — UPDATE actualiza la columna sin intervención del servicio
  Given  una fila en comments con updated_at = T0
  When   se ejecuta UPDATE comments SET content = 'x' WHERE id = …
  Then   updated_at pasa a ser mayor que T0
  And    el statement no menciona updated_at

Scenario R8.3 — INSERT deja updated_at igual a created_at
  Given  una tabla con updated_at y trigger instalado
  When   se inserta una fila sin especificar updated_at
  Then   updated_at es igual (o posterior por microsegundos) a created_at

Scenario R8.4 — El trigger cubre las 12 tablas
  Given  una base con 0032 aplicada
  When   se listan los triggers BEFORE UPDATE de tipo set_updated_at
  Then   hay uno por cada tabla que tiene columna updated_at

Scenario R8.5 — El servicio deja de escribir updated_at a mano
  Given  el código de los repositorios tras el change
  When   se buscan asignaciones explícitas de updated_at en statements UPDATE
  Then   no queda ninguna (la responsabilidad es del trigger)
```

---

## D7.4 — Comentarios anidados

### R9 — `comments.parent_id`

```
Scenario R9.1 — Columna y FK creadas
  Given  una base con 0033 aplicada
  When   se inspecciona el esquema de comments
  Then   existe parent_id uuid NULL con FK self-referencial a comments(id)
         ON DELETE CASCADE
  And    existe índice sobre parent_id

Scenario R9.2 — Auto-referencia rechazada
  Given  un comentario con id C
  When   se intenta UPDATE comments SET parent_id = C WHERE id = C
  Then   la base rechaza el statement por violación de CHECK

Scenario R9.3 — Crear respuesta a un comentario
  Given  un incidente con un comentario raíz
  When   hace POST /api/incidents/{id}/comments con { content, parent_id }
  Then   responde 201 con el comentario creado y parent_id poblado

Scenario R9.4 — parent_id de otro incidente es rechazado
  Given  un comentario que pertenece al incidente A
  When   se intenta crear un comentario en el incidente B con ese parent_id
  Then   responde 400

Scenario R9.5 — Se puede responder a una respuesta (profundidad 2)
  Given  un comentario raíz y una respuesta suya (profundidad 1)
  When   hace POST de un comentario con parent_id = la respuesta
  Then   responde 201 y el nuevo comentario queda con profundidad 2

Scenario R9.6 — La profundidad 3 es rechazada
  Given  un comentario de profundidad 2
  When   se intenta responderle
  Then   responde 400 con mensaje de profundidad máxima alcanzada

Scenario R9.7 — El listado expone la profundidad de cada comentario
  Given  un hilo con comentarios de profundidad 0, 1 y 2
  When   hace GET del listado de comentarios del incidente
  Then   cada comentario incluye su profundidad calculada (0, 1 o 2)

Scenario R9.8 — Borrar la raíz arrastra todo el hilo, incluidos los nietos
  Given  un comentario raíz con 2 respuestas, y una de ellas con 1 respuesta propia
  When   el comentario raíz se soft-deletea
  Then   los 4 comentarios quedan con deleted_at NOT NULL
  And    GET del listado no devuelve ninguno
```

---

## D7.5 — Jerarquía de organizaciones y ruteo por categoría

### R10 — `organizations.parent_id`

```
Scenario R10.1 — Columna y FK creadas
  Given  una base con 0034 aplicada
  When   se inspecciona el esquema de organizations
  Then   existe parent_id uuid NULL con FK a organizations(id) ON DELETE SET NULL

Scenario R10.2 — El árbol refleja la jerarquía
  Given  una organización padre P con dos hijas H1 y H2
  When   hace GET /api/organizations/tree
  Then   responde 200 y P aparece con H1 y H2 como children

Scenario R10.3 — Ciclo directo rechazado
  Given  una organización O
  When   se intenta setear parent_id = O sobre la propia O
  Then   la base rechaza el statement por violación de CHECK
```

**R10.4 / R10.5 — SUPERSEDED (see Compliance Status note above and design.md D7).**
Preserved verbatim for audit trail:

```
Scenario R10.4 — Una sucursal comparte zona con su padre [SUPERSEDED]
  Given  una organización raíz P en la zona Z
  When   se crea una sucursal H con parent_id = P y la misma zona Z
  Then   la inserción tiene éxito
  And    no viola uq_organizations_zone, que pasó a ser
         UNIQUE (zone_id) WHERE parent_id IS NULL

Scenario R10.5 — Dos organizaciones raíz en la misma zona siguen prohibidas [SUPERSEDED]
  Given  una organización raíz P en la zona Z
  When   se intenta crear otra organización con parent_id NULL en la zona Z
  Then   la base rechaza el statement por violación de unicidad
```

### R11 — Ruteo de organizaciones notificadas

**Background**: legacy resuelve `notifiedFor` con dos ancestrías (ubicación y
categoría) más una regla de org transversal, y devuelve **varias** organizaciones.
Hoy nuestro endpoint resuelve una sola zona plana y devuelve como mucho una.

```
Scenario R11.1 — Columna y FK creadas
  Given  una base con 0034 aplicada
  When   se inspecciona el esquema de organizations
  Then   existe incident_category_id uuid NULL con FK a incident_categories(id)
         ON DELETE SET NULL
  And    ya no existe el índice uq_organizations_zone

Scenario R11.2 — Varias organizaciones por zona son válidas
  Given  una zona Z
  When   se crean dos organizaciones distintas con zone_id = Z
  Then   ambas inserciones tienen éxito

Scenario R11.3 — Ancestría de ubicación: la org de la provincia se notifica
  Given  una organización O en la provincia P
  And    una parroquia R descendiente de un cantón de P
  When   hace GET /api/organizations/notified-for?location_id={R}&category_id={C}
  Then   responde 200 y O está en el resultado

Scenario R11.4 — Ancestría de categoría: la org de la raíz cubre la subcategoría
  Given  una organización O configurada con la categoría raíz 'Infraestructura Vial'
  And    la subcategoría 'Baches y Hundimientos' colgando de ella
  When   se consulta notified-for con esa subcategoría
  Then   O está en el resultado

Scenario R11.5 — Org transversal: incident_category_id NULL cubre cualquier categoría
  Given  una organización O con incident_category_id NULL en la zona Z
  When   se consulta notified-for con cualquier categoría en Z
  Then   O está en el resultado

Scenario R11.6 — Org de otra categoría no se notifica
  Given  una organización O configurada con la categoría 'Medio Ambiente'
  When   se consulta notified-for con una categoría de 'Seguridad Ciudadana'
  Then   O no está en el resultado

Scenario R11.7 — is_claimable marca exactamente una organización
  Given  tres organizaciones notificadas para el par (ubicación, categoría)
  When   se consulta notified-for
  Then   exactamente una tiene is_claimable true
  And    es la primera del orden estable (created_at, id)
  And    es la misma que el auto-assign elegiría al crear el incidente

Scenario R11.8 — Sin organizaciones que cubran el par
  Given  una zona sin ninguna organización que cubra la categoría consultada
  When   se consulta notified-for
  Then   responde 200 con un array vacío

Scenario R11.9 — Organización soft-deleted no se notifica
  Given  una organización que cubriría el par pero está soft-deleted
  When   se consulta notified-for
  Then   no está en el resultado

Scenario R11.10 — El orden es estable entre llamadas
  Given  varias organizaciones notificadas para el mismo par
  When   se consulta notified-for dos veces
  Then   el orden de los resultados es idéntico
```

---

## D7.6 — Columnas de dominio faltantes

### R12 — `geo_zones.code`

```
Scenario R12.1 — Columna creada, nullable y única cuando está presente
  Given  una base con 0035 aplicada
  When   se inspecciona geo_zones
  Then   existe code varchar(32) NULL
  And    existe un índice UNIQUE parcial WHERE code IS NOT NULL

Scenario R12.2 — Dos zonas sin código conviven
  Given  dos geo_zones con code NULL
  When   se insertan ambas
  Then   ninguna viola la restricción de unicidad

Scenario R12.3 — Código duplicado rechazado
  Given  una geo_zone con code = 'SE-01'
  When   se intenta insertar otra con el mismo code
  Then   la base rechaza el statement
```

### R13 — `users.phone`

```
Scenario R13.1 — Columna creada
  Given  una base con 0035 aplicada
  When   se inspecciona users
  Then   existe phone varchar(30) NULL

Scenario R13.2 — El perfil devuelve el teléfono
  Given  un usuario con phone = '+593999999999'
  When   hace GET /api/users/me
  Then   responde 200 con el campo phone en el body

Scenario R13.3 — El anonimizador GDPR borra el teléfono
  Given  un usuario con phone poblado
  When   se ejecuta el soft delete GDPR sobre ese usuario
  Then   phone queda en NULL
```

---

## D7.7 — Integridad a nivel de base

### R14 — Trigger de categoría hoja

```
Scenario R14.1 — Función y trigger creados
  Given  una base con 0036 aplicada
  When   se consulta pg_proc y pg_trigger
  Then   existen check_is_leaf_category() y el trigger BEFORE INSERT OR UPDATE
         sobre incidents

Scenario R14.2 — Incidente en categoría hoja es aceptado
  Given  una categoría C sin hijos
  When   se crea un incidente con category_id = C
  Then   la inserción tiene éxito

Scenario R14.3 — Incidente en categoría padre es rechazado
  Given  una categoría P que tiene al menos una hija
  When   se intenta crear un incidente con category_id = P
  Then   la base lanza excepción
  And    la API responde 400 con mensaje de categoría no hoja

Scenario R14.4 — Una categoría hija soft-deleted no convierte al padre en no-hoja
  Given  una categoría P cuya única hija está soft-deleted
  When   se crea un incidente con category_id = P
  Then   la inserción tiene éxito
```

### R15 — Comportamiento `ON DELETE` de las FK

```
Scenario R15.1 — Toda FK declara comportamiento explícito
  Given  una base con 0001 a 0039 aplicadas
  When   se listan las FK de las tablas de dominio en information_schema
  Then   ninguna queda con el NO ACTION por defecto sin justificación documentada
         en design.md

Scenario R15.2 — Borrar un incidente arrastra sus dependencias
  Given  un incidente con comentarios, imágenes, asignaciones y status_history
  When   se ejecuta DELETE físico de ese incidente
  Then   las filas dependientes se eliminan en cascada
  And    no queda ninguna fila huérfana

Scenario R15.3 — Borrar una organización con incidentes es rechazado
  Given  una organización con al menos un incidente asociado
  When   se intenta DELETE físico de la organización
  Then   la base rechaza el statement por RESTRICT

Scenario R15.4 — Borrar un usuario deja sus incidentes con autor nulo
  Given  un usuario con incidentes reportados
  When   se ejecuta DELETE físico del usuario
  Then   los incidentes sobreviven con citizen_id NULL
```

---

## D7.8 — Paridad de índices

### R16 — Índices de paridad presentes

```
Scenario R16.1 — Los 9 índices existen tras 0037
  Given  una base con 0001 a 0037 aplicadas
  When   se consulta pg_indexes
  Then   existen índices sobre comments.user_id, comments.parent_id,
         assignments.incident_id, status_history.changed_by_user_id,
         incidents.priority, incidents.citizen_id, geo_zones.code,
         invitations.token_hash y password_reset_tokens.token_hash

Scenario R16.2 — Sin índices duplicados
  Given  una base con todas las migraciones aplicadas
  When   se agrupan los índices por (tabla, columnas)
  Then   no hay dos índices distintos con la misma definición

Scenario R16.3 — El plan del listado de incidentes usa índice
  Given  incidents poblada con al menos 1000 filas
  When   se ejecuta EXPLAIN del listado filtrado por status y organización
  Then   el plan no contiene Seq Scan sobre incidents
```

---

## D7.9 — Datos de referencia y seeds

### R19 — Árbol de categorías de incidente

**Background**: `incident_categories` existe desde 0012 y no tiene ni una fila.
Legacy siembra 22 categorías en `IncidentCategorySeeder` (5 raíces + 17 hojas
— ver design.md D14: la estimación original de este documento, 23/18, no
coincidía con el conteo real del array `CATEGORY_TREE` del seeder).

```
Scenario R19.1 — El árbol queda sembrado
  Given  una base con 0001 a 0038 aplicadas
  When   se cuentan las filas de incident_categories
  Then   hay 22 categorías
  And    5 tienen parent_id NULL (Infraestructura Vial, Servicios Básicos,
         Seguridad Ciudadana, Medio Ambiente, Obras e Infraestructura)
  And    17 tienen parent_id apuntando a una de esas 5

Scenario R19.2 — Todas las hojas son hoja de verdad
  Given  el árbol sembrado
  When   se buscan categorías con parent_id NOT NULL que a su vez tengan hijas
  Then   no hay ninguna (el árbol tiene exactamente 2 niveles)

Scenario R19.3 — Re-aplicar 0038 no duplica
  Given  una base con 0038 ya aplicada
  When   se vuelve a ejecutar el archivo 0038
  Then   sigue habiendo exactamente 22 categorías

Scenario R19.4 — Dos raíces con el mismo nombre son rechazadas
  Given  el árbol sembrado
  When   se intenta insertar otra categoría raíz llamada 'Medio Ambiente'
  Then   la base rechaza el statement por violación de unicidad

Scenario R19.5 — El mismo nombre bajo padres distintos es válido
  Given  el árbol sembrado
  When   se insertan dos hojas con igual nombre bajo dos padres diferentes
  Then   ambas inserciones tienen éxito

Scenario R19.6 — Se puede crear un incidente con una hoja del árbol sembrado
  Given  el árbol sembrado y el trigger de categoría hoja activo
  When   se crea un incidente con el category_id de 'Baches y Hundimientos'
  Then   responde 201

Scenario R19.7 — Una raíz del árbol sembrado es rechazada como categoría
  Given  el árbol sembrado y el trigger de categoría hoja activo
  When   se intenta crear un incidente con el category_id de 'Infraestructura Vial'
  Then   responde 400
```

### R20 — Permisos de notificaciones en el catálogo

```
Scenario R20.1 — Las filas existen
  Given  una base con 0039 aplicada
  When   se consulta la tabla permissions
  Then   existen las filas (notifications, READ) y (notifications, UPDATE)

Scenario R20.2 — Los roles staff las tienen otorgadas
  Given  una base con 0039 aplicada
  When   se leen los arrays roles.permissions de los 4 roles staff
  Then   los cuatro incluyen 'READ notifications' y 'UPDATE notifications'

Scenario R20.3 — Re-aplicar 0039 no duplica filas del catálogo
  Given  una base con 0039 ya aplicada
  When   se vuelve a ejecutar el archivo 0039
  Then   el conteo de filas de permissions no cambia
```

### R21 — Datos geográficos y organizaciones semilla

> **Status (2026-08-26)**: ✅ Compliant. Implementado por migración
> `0041_geography_organizations_seed.sql`. Fuente: OpenStreetMap
> (`admin_level=8`, ODbL 1.0) — INEC DPA fue rechazada por falta de
> licencia (metadata FGDC sin rellenar, alcance declarado sólo para
> uso interno de campo); CONALI/IGM/GADM descartados por razones
> propias (ver design.md D0 del change de origen). El único punto
> legal abierto es el alcance del share-alike de ODbL 1.0, juicio
> del operador, no bloqueo técnico. **Aplicación en Supabase
> `⏳ Pending`** — ver `database/MIGRATION_LOG.md` fila 0041 y el
> runbook `docs/runbooks/apply-0041.md`.

El sistema DEBE sembrar, mediante `database/migrations/0041_geography_organizations_seed.sql`, al menos una parroquia real por cantón de Santa Elena con jerarquía completa (`level`, `code`, `parent_id`) y la organización `CTE - Santa Elena`. El backfill de `code` en las 4 filas provincia/cantón preexistentes DEBE ejecutarse antes de cualquier INSERT de parroquia, porque `parent_id` se resuelve por subselect sobre `geo_zones.code`. 0041 DEBE ser idempotente: re-ejecutarlo NO DEBE cambiar el conteo de `geo_zones` ni `organizations`. La geometría real (OSM) NO DEBE editarse para forzar contención con el cantón; se usa en su lugar una tolerancia documentada.

```
Scenario R21.0 — El backfill de code precede a las parroquias
  Given  una base con 0040 aplicada, ejecutando 0041 por primera vez
  When   se leen las 4 geo_zones preexistentes tras 0041
  Then   sus code son 'EC-24', 'EC-24-01', 'EC-24-02', 'EC-24-03'
  And    ninguna es NULL

Scenario R21.1 — Las parroquias de Santa Elena quedan sembradas
  Given  una base con 0041 aplicada
  When   se cuentan las geo_zones con level = 'parroquia'
  Then   hay al menos una por cada uno de los 3 cantones (EC-24-01/02/03)
  And    cada una tiene code no nulo y polygon no nulo (MULTIPOLYGON válido)
  And    cada una tiene parent_id apuntando al id de su cantón

Scenario R21.2 — La jerarquía geográfica es consistente
  Given  las geo_zones sembradas por 0041
  When   se recorre parent_id desde cualquier parroquia
  Then   se llega a un cantón y de ahí a la provincia (level='provincia', parent_id NULL)
  And    no existen ciclos en la cadena

Scenario R21.3 — Cada parroquia pertenece geométricamente al cantón que declara como padre
  Given  las geo_zones sembradas por 0041, donde las parroquias vienen de OSM y los cantones de Ecuador-geoJSON (0003) — fuentes distintas, con generalización y fecha distintas
  When   se evalúa ST_Within(ST_PointOnSurface(parroquia.polygon), canton.polygon) por cada par
  Then   el resultado es verdadero en todos los casos
  And    esta comprobación es binaria y NO admite tolerancia: un punto interior de la parroquia no puede caer en otro cantón por diferencias de generalización de bordes, sólo por un emparentamiento equivocado
  And    se usa ST_PointOnSurface y no ST_Centroid porque el centroide de un polígono cóncavo puede caer fuera del propio polígono
  When   se evalúa además ST_Area(ST_Intersection(parroquia.polygon, canton.polygon)) / ST_Area(parroquia.polygon) por cada par
  Then   el cociente es >= OVERLAP_MIN en todos los casos, con OVERLAP_MIN = 0.75
  And    ese valor se derivó midiendo contra la geometría real el 2026-08-25 (mínimo observado 0.8058, Anconcito), no se asumió; la tabla completa está en database/data/README.md
  And    el test NO edita ninguna geometría para forzar el resultado; un par que falle se reporta como fallo, no se enmascara

Scenario R21.4 — La organización semilla CTE - Santa Elena queda cargada
  Given  una base con 0041 aplicada
  When   se busca la organización 'CTE - Santa Elena' (forma corta fijada por el operador; el predicado del rollback y la idempotencia del seeder dependen de esta cadena exacta)
  Then   existe exactamente una fila
  And    su zone_id apunta a la geo_zone con code='EC-24-01' (cantón Santa Elena)
  And    su parent_id es NULL

Scenario R21.5 — Re-aplicar 0041 no duplica organizaciones ni zonas
  Given  una base con 0041 ya aplicada
  When   se vuelve a ejecutar el archivo 0041
  Then   el conteo de geo_zones no cambia
  And    el conteo de organizations no cambia
```

### R22 — Separación entre datos de referencia y datos de demo

> **Status (2026-08-26)**: ✅ Compliant. La geografía y la
> organización **nunca** llegan por un seed script (R22.1, R22.2);
> siempre por la migración 0041. Los generadores de demo/volumen y
> la seeder de usuarios son idempotentes; el feed de Redis se
> reconcilia con Postgres al final del pipeline (`rebuild-feed.ts`).
> E2E: `t7-seeding-pipeline.e2e-spec.ts`, `t7-users-seed.e2e-spec.ts`,
> `t7-volume-seed.e2e-spec.ts`.

El sistema DEBE mantener geografía y organizaciones exclusivamente en migraciones versionadas, y datos de demo/volumen/usuarios exclusivamente en `database/seeds/`, ejecutables vía `db:seed` / `db:seed:mass`. Ambos pipelines DEBEN ser idempotentes.

```
Scenario R22.1 — Ninguna migración inserta incidentes
  Given  los archivos de database/migrations
  When   se buscan sentencias INSERT INTO incidents
  Then   no hay ninguna

Scenario R22.2 — La data de demo vive fuera del pipeline de migraciones
  Given  el repositorio tras el change
  When   se localizan los generadores de incidentes de demo y volumen
  Then   están bajo database/seeds/, no bajo database/migrations/

Scenario R22.3 — El seed de demo es idempotente
  Given  una base con la data de demo ya cargada (npm run db:seed)
  When   se vuelve a ejecutar db:seed
  Then   el conteo de incidentes, usuarios y notificaciones no cambia

Scenario R22.4 — El feed de Redis se reconstruye tras sembrar
  Given  incidentes cargados por el seed de demo, sin pasar por los listeners
  When   se ejecuta rebuild-feed.ts
  Then   el feed de Redis devuelve los mismos incidentes activos que Postgres

Scenario R22.5 — La seeder de usuarios crea la distribución acordada
  Given  una base limpia con 0041 aplicada
  When   se ejecuta database/seeds/users.js
  Then   existen exactamente 6 usuarios: 1 master, 1 operador_sistema, 2 admin_org, 2 operador_org
  And    los 4 usuarios admin_org/operador_org tienen organization_id = CTE - Santa Elena

Scenario R22.6 — La seeder de usuarios es idempotente por email
  Given  el seeder de usuarios ya ejecutado una vez
  When   se vuelve a ejecutar
  Then   el conteo de usuarios permanece en 6, ningún email se duplica
```

---

## D7.9.Z — Cierre y handoff al operador

### R23 — Documentación de migración 0041

El sistema DEBE registrar la migración 0041 (`geography_organizations_seed.sql`) en el registro de auditoría `database/MIGRATION_LOG.md` con descripción exacta del contenido (backfill de código, parroquias, organización semilla) y estado de aplicación (`⏳ Pending` hasta que el operador la aplique en Supabase, `✅ Applied` después).

```
Scenario R23.0 — MIGRATION_LOG.md incluye fila 0041
  Given  un repositorio tras T7.9.C completado
  When   se busca la fila `0041` en database/MIGRATION_LOG.md
  Then   existe exactamente una fila
  And    las columnas incluyen: Migración=0041, Nombre=geography_organizations_seed, Descripción=... (completa), Status=⏳ Pending, Ambiente=supabase
  And    la descripción menciona explícitamente: backfill de code, parroquias de Santa Elena (11 filas), organización CTE - Santa Elena

Scenario R23.1 — Re-anchor de R21 en openspec
  Given  los archivos de spec en openspec/
  When   se buscan referencias a "migración 0039" en contexto de R21 (parroquias/orgs)
  Then   todas apuntan a "migración 0041" en su lugar
  And    ninguna menciona "0039" en contexto de geografía (0039 sigue siendo válido para permisos/roles, T7.9.B)

Scenario R23.2 — Rango de migraciones documentado
  Given  el documento docs/tasks/3-DATABASE-SCHEMA.md
  When   se lee la sección "Estado real de las migraciones"
  Then   el rango documentado es 0001–0041 (no 0001–0040)
  And    hay un resumen de T7.9.C/D scope, qué se implementó y qué se deja para T8

Scenario R23.3 — Manual del operador listo
  Given  una base Supabase con 0040 aplicado (schema_migrations registrado)
  When   el operador ejecuta el contenido del runbook de aplicación de 0041
  Then   la migración aplica sin errores
  And    los conteos verifican (11 parroquias, 1 org)
  And    una segunda ejecución del archivo es un no-op (0 filas cambiadas)
```

### R24 — Verificación pre-deploy (CI full suite)

El sistema DEBE pasar todas las compuertas de calidad (lint, typecheck, build, tests) sin errores después de T7.9.C2–C7 y D1–D11 completas.

```
Scenario R24.0 — ESLint sin errores
  Given  los archivos nuevos en backend/test/e2e/*.e2e-spec.ts
  When   se ejecuta npm run lint desde backend/
  Then   no hay errores (exit code 0)

Scenario R24.1 — TypeScript sin errores
  Given  backend/tsconfig.json con strict mode
  When   se ejecuta tsc --noEmit -p tsconfig.json
  Then   no hay errores de tipo (exit code 0)
  And    todas las entidades resuelven contra las migraciones

Scenario R24.2 — Build success
  Given  backend/src y backend/test completos tras C/D
  When   se ejecuta nest build
  Then   exit code 0
  And    dist/ se genera sin warnings de rollup/esbuild

Scenario R24.3 — Unit + E2E tests green
  Given  backend/test/unit/ y backend/test/e2e/ con T7.9.C/D coverage
  When   se ejecuta jest (full suite)
  Then   exit code 0
  And    todos los tests C2–C7 (5 unit + 10 e2e) y D1–D11 (16 e2e) pasan
  And    regresión en los suites adyacentes pasa íntegra

Scenario R24.4 — Migration suite green
  Given  database/migrations/0001–0041 y database/rollback/*.DOWN.sql
  When   se ejecutan backend/test/migrations/* suites
  Then   exit code 0
  And    0041 aplica limpio sobre una base vacía
  And    re-aplicar 0041 no cambia conteos (idempotencia)
  And    0041.DOWN.sql revierte sin residuos
```

### R25 — Preparación de deployment a Supabase

El sistema DEBE proporcionar al operador instrucciones exactas y verificables para aplicar 0041 en producción de forma segura.

```
Scenario R25.0 — Bloque de aplicación manual documentado
  Given  el runbook de aplicación de 0041 (docs/runbooks/apply-0041.md)
  When   el operador abre el documento
  Then   contiene referencia exacta al SQL (contenido de 0041_geography_organizations_seed.sql)
  And    precondiciones explícitas (0040 debe estar en schema_migrations)
  And    checklist de verificación post-aplicación
  And    instrucción de rollback (0041.DOWN.sql + guarda ruidosa)

Scenario R25.1 — Pre-requisito de 0040 verificable
  Given  una base Supabase antes de aplicar 0041
  When   se ejecuta SELECT * FROM schema_migrations WHERE name='0040_rename_roles'
  Then   retorna exactamente 1 fila (0040 ya fue aplicado y registrado)
  And    si la query retorna 0 filas, el runbook instruye al operador correr npm run db:migrate primero

Scenario R25.2 — Status tracking en MIGRATION_LOG.md
  Given  0041 aplicada exitosamente en Supabase
  When   el operador actualiza database/MIGRATION_LOG.md fila 0041
  Then   Status pasa de ⏳ Pending a ✅ Applied
  And    se registra Applied Date (fecha/hora) y Applied By (usuario operador)
```

---

## Requisitos transversales

### R17 — Idempotencia y aplicabilidad de todo el set

```
Scenario R17.1 — Base vacía
  Given  un Postgres con PostGIS y sin ninguna tabla
  When   se aplican 0001 a 0039 en orden numérico
  Then   todas terminan sin error

Scenario R17.2 — Base con esquema actual
  Given  un Postgres con 0001 a 0029 ya aplicadas y datos de prueba
  When   se aplican 0030 a 0039
  Then   todas terminan sin error
  And    ninguna fila preexistente se pierde

Scenario R17.3 — Re-aplicación completa es inocua
  Given  un Postgres con 0001 a 0039 aplicadas
  When   se vuelven a ejecutar los archivos 0030 a 0039
  Then   todos terminan sin error y sin cambios en el esquema

Scenario R17.4 — La app bootea contra el esquema real
  Given  un Postgres con 0001 a 0039 aplicadas
  When   se levanta la aplicación NestJS con synchronize:false
  Then   arranca sin errores de mapeo de entidades
  And    GET /api/health responde 200
```

### R18 — Documentación sincronizada

```
Scenario R18.1 — El doc base refleja el estado real
  Given  el change aplicado
  When   se lee docs/tasks/3-DATABASE-SCHEMA.md
  Then   el rango de migraciones documentado llega a 0039
  And    el runner documentado apunta a backend/scripts/run-migrations.ts, que existe
  And    el mapeo declarado es 72 migraciones legacy → 37 SQL
```
