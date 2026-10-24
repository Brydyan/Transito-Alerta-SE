# `/api/auth/me` → 500 — Informe de investigación

**Fecha:** 2026-10-20
**Síntoma:** `GET /api/auth/me` responde `500 Internal Server Error`, `content-length: 52`,
de forma intermitente. El usuario reporta "el login se cuelga".
**Alcance:** análisis estático del repo + evidencia aportada desde `tase-staging`.

---

## 1. Veredicto ejecutivo

El 500 no es un problema de cache ni de "una migración posterior" que escribió strings
nuevos. Es un **dato corrupto crónico** introducido por `0021` en formato equivocado,
que `0026` **no podía limpiar por diseño**, y que 4 mecanismos distintos propagaron
de `roles` hacia `users` durante meses.

Los dos strings offenders son:

```
"incident-images:CREATE"
"incident-images:DELETE"
```

Formato `resource:ACTION`. El formato canónico del proyecto es `"ACTION resource"`
(con espacio). Ningún consumidor del sistema reconoce el formato con dos puntos.

**El 500 se dispara en `backend/src/shared/permissions/permission-lookup.service.ts:108`**,
que pasa el array sin sanear a un `IN (...)` sobre una columna `uuid`.

Además se encontraron **tres defectos operativos independientes** que explican por qué
esto no se detectó ni se corrigió antes. Detalle en §5–§7.

---

## 2. Cronología de migraciones

Renumeración del 2026-10-14 (`database/MIGRATION_LOG.md:26-34`) fusionó ~37 archivos
históricos en 37 actuales. Los números antiguos citados en documentación ya no aplican
— p. ej. `0029_incident_images.sql` hoy vive dentro de `0021_t6_t7_schema_completeness.sql`.

| Migración | Efecto sobre `roles.permissions` | Formato resultante |
|---|---|---|
| `0009` | Seed de 6 roles con strings | `"ACTION resource"` ✅ |
| `0015` | Re-seed roles (`ON CONFLICT DO NOTHING`) | `"ACTION resource"` ✅ |
| `0016`, `0018`, `0019` | Append con `\|\|` + guarda `@>` | `"ACTION resource"` ✅ |
| `0021` §1 | Append `"CREATE comment-images"` etc. | `"ACTION resource"` ✅ |
| **`0021` §6** | **Inyecta `"incident-images:CREATE"` / `DELETE`** | **`resource:ACTION` ❌** |
| **`0026`** | **Normaliza a UUID… pero no estos** | **mixto** ❌ |
| `0027`, `0028` | Append **aditivo** de UUIDs del catálogo | mixto (preserva) ❌ |
| `0029` | Sanitiza matriz de roles | mixto ❌ |
| **`0037`** | **Append `"UPDATE assignments"` a `admin_org`** | **mixto** ❌ |

### 2.1 Origen exacto del dato corrupto

`database/migrations/0021_t6_t7_schema_completeness.sql:161-183`

```sql
UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'operator_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb     -- ← línea 167
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb    -- ← línea 169
  ) sub
) WHERE name = 'operator_organizacion';
```

El propio autor_DEL archivo believed el formato válido — `0021:139-140`:

> `Grant pattern uses jsonb_agg DISTINCT UNION ALL (different from section 1's || operator — both are valid pre-0026 string format).`

**Esa premisa es falsa.** El formato `resource:ACTION` nunca matcheó nada. El propio repo
lo documenta en `openspec/changes/archive/2026-08-24-t7-database-schema-parity/apply-progress.md:27`:

> **Collateral discovery (documented in D14, NOT fixed — out of scope)**: `0029_incident_images.sql`
> grants `'incident-images:CREATE'`/`'DELETE'` … in the wrong string format (`resource:ACTION`
> instead of the canonical `"ACTION resource"`) … Those two grants have never matched anything.

Conocido desde agosto. Nunca corregido.

### 2.2 Por qué 0026 no lo limpió

`database/migrations/0026_roles_permissions_uuid_format.sql:32-46`

```sql
SELECT jsonb_agg(
  COALESCE(p.uuid, elem)   -- ← línea 38: si no matchea, deja el string intacto
)
FROM jsonb_array_elements_text(r.permissions) AS elem
LEFT JOIN perm_lookup p
  ON p.action  = split_part(elem, ' ', 1)     -- ← línea 42: parte por ESPACIO
 AND p.resource = split_part(elem, ' ', 2)    -- ← línea 43
```

Para `elem = 'incident-images:CREATE'`:
- `split_part(elem,' ',1)` → `'incident-images:CREATE'` (no hay espacio → devuelve el string entero)
- `split_part(elem,' ',2)` → `''`
- No matchea el catálogo → `p.uuid` es `NULL` → `COALESCE` devuelve `elem` **sin cambios**

**El comportamiento de 0026 es intencional, no un descuido de implementación**: el
header del archivo declara *"Idempotente: si un elemento ya es UUID (no matchea ningún
`action+resource` del catálogo), se queda como está."* Es decir: 0026 confunde el formato
`resource:ACTION` con un UUID válido y lo deja pasar.

### 2.3 Los 4 vectores de propagación

| # | Ubicación | Mecanismo |
|---|---|---|
| 1 | `0026_roles_permissions_uuid_format.sql:59-66` | `UPDATE users SET permissions = r.permissions` — **0026_HANDLEO él mismo el bug de roles hacia users** |
| 2 | `0027_citizen_social_features.sql:52-77` | Patrón aditivo `r.permissions \|\| <UUIDs>` → **preserva** los strings + re-denormaliza (líneas 69-77) |
| 3 | `0028_dynamic_menus_schema.sql:110-173` | Idem patrón aditivo, 4 `UPDATE roles` + 4 `UPDATE users` |
| 4 | `backend/src/modules/roles/roles.service.ts:154` | `user.permissions = role.permissions ?? []` — copia **verbatim** en cada `assignRole` / `update` / `syncPermissions` |

**El vector #4 es el más peligroso**: es permanente. Cualquier reasignación de rol en la app
reinfecta al usuario indefinidamente, aunque la DB se limpie a mano.

---

## 3. La cadena del 500

```
GET /api/auth/me
  │
  ├─ auth.service.ts:446   getAuthContextByUserId()
  │    └─ auth-context.service.ts:160  findAuthContextRow()
  │         └─ auth-user.repository.ts:81  SELECT u.permissions …   → 18 UUIDs + 2 strings
  │
  └─ auth.service.ts:449   permissionLookup.getDescriptionsByUuids(ctx.permissions)
       └─ permission-lookup.service.ts:107-110
            permissionRepo.find({ where: { id: In(uuids) } })
                                    ▲
                                    └── 'incident-images:CREATE' contra columna UUID
```

`backend/src/modules/permissions/entities/permission.entity.ts:15`

```ts
@PrimaryGeneratedColumn('uuid')
id!: string;
```

Postgres responde:

```
ERROR: 22P02  invalid input syntax for type uuid: "incident-images:CREATE"
```

TypeORM deja la `QueryFailedError` escapar. No hay catch en
`auth.service.ts:449`, ni en `permission-lookup.service.ts:107`, ni filtro global que la
convierta. Resultado: **500 genérico de Nest**.

### Prueba directa contra la evidencia del navegador

Tu respuesta reporta `content-length: 52`.

```
{"statusCode":500,"message":"Internal server error"}
└────────────────────── 52 bytes exactos ──────────────────────┘
```

Coincidencia exacta. El error de Postgres **no** llega al cliente — es el handler 500
por defecto de Nest. Eso confirma que no hay manejo de excepciones en el camino.

---

## 4. Por qué el síntoma es intermitente

No es intermitencia del backend. Es el TTL del cache de permisos.

`backend/src/modules/auth/auth-context.service.ts:136-158`

```ts
const key = `${PERMISSION_CACHE_PREFIX}uid:${userId}`;   // perm:v3:uid:{userId}
const cached = await this.cache.get<CachedAuthContext>(key);
if (cached) { return /* … */ }
```

| Momento | Cache | Resultado `/auth/me` |
|---|---|---|
| Hit (Redis tibio) | snapshot previamente cacheado | **200** |
| Miss / TTL expirado | relee DB → strings presentes | **500** |
| `assignRole` → `invalidatePermissionCache` (`roles.service.ts`) | borrado | **500 inmediato** |

`permissionCacheTtlSeconds` puede llegar a 1h (comentario en `auth-context.service.ts:141-142`).
Ciclo work/break de hasta una hora.

### 4.1 Por qué "se cuelga" y no sólo "falla"

`frontend/src/app/core/services/auth.service.ts:141-154`

```ts
error: (err: { status?: number }) => {
  if (err?.status === 401) {      // ← SÓLO 401 limpia sesión
    this.clearAuthState();
  }
  this.sessionValidating.set(false);
}
```

Un 500 **no** limpia la sesión, pero `user()` queda `null`. Entonces
`frontend/src/app/core/guards/permission.guard.ts:33-37`:

```ts
const decide = (user: User | null): boolean => {
  if (!user) {
    router.navigate(['/login']);   // ← rebota al login
```

Resultado: **bounce loop** `/login` ↔ `/app/dashboard`. No es un freeze de red — la red
responde rápido. El usuario percibe "se cuelga" porque nunca logra entrar.

---

## 5. Hallazgo crítico — `schema_migrations` de staging es un backfill, no evidencia

`database/MIGRATION_LOG.md:117-132`

> ### Caso real — `tase-staging` 2026-10-18
> `SELECT COUNT(*) FROM schema_migrations` devolvía **24** mientras que `ls database/migrations/*.sql`
> sumaba **37**. Los 13 huérfanos eran: `0021, 0022, 0024, 0025, **0026**, 0029, 0030, …, 0037`.
>
> Verificación de que estaban aplicados (no eran drift real):
> - `pg_constraint` contenía `fk_organizations_zone` (creado por `0002`).
> - `pg_indexes` contenía `uq_users_phone` (creado por `0036`).
> - `roles` contenía `master`, `admin_org`, `operator_org` (creados por `0023`).
>
> Tras el backfill, `schema_migrations` quedó con las **37** filas contiguas `0001 → 0037`.

**La verificación chequeó 3 objetos que no tienen nada que ver con `0026`.**
No se verificó que `roles.permissions` estuviera normalizado a UUID — que es
exactamente lo que `0026` hace.

Las 13 filas se insertaron a mano con `INSERT … ON CONFLICT DO NOTHING`
(`MIGRATION_LOG.md:167-173`) y checksums calculados desde disco.

> **Consecuencia:** `SELECT version FROM schema_migrations WHERE version = '0026'`
> devuelve fila ⇒ **no prueba que 0026 se haya ejecutado en staging**.
> Ese chequeo es exactamente el que llevó al diagnóstico original por el camino equivocado.

---

## 6. Hallazgo crítico — ninguna migración nueva se va a ejecutar nunca

`backend/scripts/entrypoint-migrations.sh:17-35`

```sh
if [ "$SCHEMA_EXISTS" = 'f' ]; then
  echo "[migrations] ► Bootstrapping schema (applying 0001-0062)..."
  for f in /app/database/migrations/*.sql; do … done
else
  echo "[migrations] ✓ Schema exists. Skipping bootstrap."
fi
exit 0
```

**No existe runner de migraciones pendientes.** Si `schema_migrations` existe, el script
imprime "Skipping bootstrap" y sale con 0. No lee la tabla, no compara checksums, no
aplica nada faltante.

Implicaciones:

1. En staging, `0026`–`0037` se aplicaron **a mano**.
2. **Una `0038` nueva NUNCA se va a aplicar sola.** Requiere ejecución manual.
3. El `echo` de la línea 22 dice "0001-0062" pero sólo existen 37 archivos — comentario
   obsoleto de la era pre-consolidación. Confirma que este script no se ha mantenido.
4. La defensa que `MIGRATION_LOG.md:109-115` describe ("Próximas corridas del runner lanzan
   `ERROR: already exists`") **no aplica a este entrypoint** — el archivo no lanza esos
   errores porque no intenta nada.

---

## 7. Hallazgo crítico — `0037` reintroduce el bug en cada instalación limpia

`database/migrations/0037_admin_org_reassign_permission.sql:23-26`

```sql
UPDATE roles
SET permissions = permissions || '["UPDATE assignments"]'::jsonb
WHERE name = 'admin_org'
  AND NOT (permissions @> '["UPDATE assignments"]'::jsonb);
```

En una DB **virgen**:

1. `0009:163` siembra `admin_organizacion` con el string `"UPDATE assignments"`.
2. `0026` lo convierte a UUID. El string **desaparece** del array.
3. `0037` evalúa `permissions @> '["UPDATE assignments"]'` → **FALSE** (ya es UUID).
4. `0037` **añade el string de nuevo**.

Resultado: `admin_org` queda con el UUID correcto **y** un string basura duplicado.
El siguiente `assignRole` lo propaga a `users.permissions` → `/auth/me` 500.

**Afecta a toda instalación limpia futura: CI, onboarding, Supabase nuevo.**
No es un problema exclusivo de staging.

Además, `0037` es un regex-literal sobre un permiso sin UUID: es el mismo patrón de bug
que `0021`, reintroducido después de que `0026` estableciera el formato UUID como estándar.

---

## 8. Hallazgo secundario — `permission_version` no invalida nada

Tres migraciones razonan explícitamente sobre la invalidación de cache por versión:

- `0026_roles_permissions_uuid_format.sql:61`
- `0027_citizen_social_features.sql:68` — *"Bumpear permission_version invalida perm:v3:uid:*"*
- `0028_dynamic_menus_schema.sql:156`

Y `backend/src/modules/roles/roles.service.ts:45-47`:

> *bumps `permission_version` (design D2's `pv`) so a stale cached Redis blob can be
> told apart from a fresh one*

**Es falso.** La clave de cache es `perm:v3:uid:{userId}` (`auth-context.service.ts:136`) —
**no contiene `pv`**. Un grep de `permissionVersion` en `backend/src` devuelve sólo
`roles.service.ts` (que lo incrementa) y sus tests. **Ningún consumidor lo lee.**

Consecuencia: bumpear `permission_version` desde SQL **no invalida nada**. Los snapshots
sucios sobreviven en Redis hasta el TTL. Sólo la ruta de aplicación
(`RolesService` → `invalidatePermissionCache`) borra de verdad.

---

## 9. Por qué el SQL propuesto era un no-op

El diagnóstico anterior propuso:

```sql
COALESCE(
  (SELECT id::text FROM permissions p
   WHERE p.action  = split_part(elem, ' ', 1)
     AND p.resource = split_part(elem, ' ', 2)
     AND elem LIKE '% %'          -- ← filter kills it
     AND p.deleted_at IS NULL),
  elem
)
```

Para `elem = 'incident-images:CREATE'`:
- `elem LIKE '% %'` → **FALSE** (no hay espacio) → subquery devuelve `NULL`
- `COALESCE(NULL, elem)` → devuelve el string **sin cambios**

**Cero filas afectadas.** Y aunque se removiera el `LIKE`, seguiría fallando: el orden
está invertido, el dato es `resource:ACTION`, no `ACTION resource`.

---

## 10. Qué NO se pudo verificar desde el código

Sé honesto sobre los límites de este análisis — los siguientes puntos requieren acceso a
la DB de staging para cerrarse:

| # | Pregunta abierta | Por qué importa |
|---|---|---|
| 1 | ¿0026 se ejecutó realmente en staging, o sólo se registró en `schema_migrations`? | Determina si 0027/0028 corrieron sobre un schema normalizado o sobre uno crudo |
| 2 | ¿De dónde vienen los 18 UUIDs de la fila observada si 0026 no corrió? | Candidatos: `PATCH /roles/:id` del role-editor (envía UUIDs), `assignRole`, o un 0026 sí ejecutado |
| 3 | ¿Existen otros elementos no-UUID además de los 2 strings? | El filtro propuesto en §11 los descarta silenciosamente |
| 4 | ¿Otros ambientes (prod, supabase) tienen el mismo dataset? | Si prod tiene `operator_org`/`admin_org` con usuarios asignados, arrastra el mismo bug |

Queries para cerrarlas (en `tase-staging`):

```bash
# 1. ¿qué hay realmente en roles.permissions, no sólo en users?
docker exec tase-postgres psql -U postgres transito_alerta -c "
  SELECT r.name,
         count(*) FILTER (WHERE e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$') AS uuids,
         count(*) FILTER (WHERE e !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$') AS basura,
         jsonb_agg(e) FILTER (WHERE e !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$') AS no_uuids
    FROM roles r, jsonb_array_elements_text(r.permissions) e
   WHERE r.deleted_at IS NULL
   GROUP BY r.name;"

# 2. ¿el Anonymous/0025 dejó users huérfanos con strings?
docker exec tase-postgres psql -U postgres transito_alerta -c "
  SELECT count(*) FROM users
   WHERE deleted_at IS NULL AND is_active
     AND permissions::text ~ '[a-z].*[: ]';"

# 3. ¿el DOWN de 0026 es reversible sin perder datos?
docker exec tase-postgres psql -U postgres transito_alerta -c "
  SELECT version, checksum, applied_at FROM schema_migrations
   WHERE version IN ('0021','0026','0027','0028','0037') ORDER BY version;"
```

---

## 11. Plan de fix

### 11.1 Migración `0038` — normalización de formato UUID

Mapea los tres formatos conocidos y descarta lo irreconocible.
`('assignments','UPDATE')` **sí existe** en catálogo (`0009_roles_permissions.sql:66`),
así que 0037 también queda saneado por esta migración.

```sql
-- 0038_permissions_uuid_normalization.sql
BEGIN;

WITH perm_lookup AS (
  SELECT resource, action, id::text AS uuid
    FROM permissions
   WHERE deleted_at IS NULL
),
normalized AS (
  SELECT r.id AS role_id, e.elem,
         COALESCE(
           -- formato canónico "ACTION resource"
           (SELECT p.uuid FROM perm_lookup p
             WHERE p.action = split_part(e.elem,' ',1)
               AND p.resource = split_part(e.elem,' ',2)),
           -- formato erroneo "resource:ACTION" (0021 §6)
           (SELECT p.uuid FROM perm_lookup p
             WHERE p.resource = split_part(e.elem,':',1)
               AND p.action   = split_part(e.elem,':',2)),
           -- ya es UUID
           CASE WHEN e.elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN e.elem END
         ) AS uuid
    FROM roles r
    CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS e(elem)
   WHERE r.deleted_at IS NULL
),
role_remap AS (
  SELECT role_id,
         COALESCE(jsonb_agg(uuid) FILTER (WHERE uuid IS NOT NULL), '[]'::jsonb) AS perms
    FROM normalized
   GROUP BY role_id
)
UPDATE roles r
   SET permissions = remap.perms
  FROM role_remap remap
 WHERE r.id = remap.role_id
   AND r.permissions IS DISTINCT FROM remap.perms;

-- Denormalizar a users (mismo patrón que 0026/0027/0028)
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL
   AND u.permissions IS DISTINCT FROM r.permissions;

COMMIT;
```

**Precondición:** verificar primero (§10, query 1) cuántos elementos se descartarían.
`jsonb_agg(...) FILTER (WHERE uuid IS NOT NULL)` los **borra silenciosamente** — si el
resultado es inesperado, se van sin aviso.

**Post-apply:** `FLUSHALL` en Redis (o borrar `perm:v3:*`). Bump de
`permission_version` **no** sirve (§8).

### 11.2 Defensa en código — `permission-lookup.service.ts:100-112`

Convierte "500 que tumba el login" en "permisos faltantes". Degradación en vez de caída:

```ts
private static readonly UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async getDescriptionsByUuids(uuids: string[]): Promise<string[]> {
  const valid = (uuids ?? []).filter((u) => PermissionLookupService.UUID_RE.test(u));
  if (valid.length === 0) return [];
  if (!this.cache) await this.buildCache();
  const rows = await this.permissionRepo.find({
    where: { id: In(valid), deletedAt: IsNull() },
    select: ['id', 'action', 'resource'],
  });
  return rows.map((row) => `${row.action} ${row.resource}`);
}
```

Agregar un `Logger.warn()` con los descartados — así la próxima corrupción queda visible
en logs en vez de ser un 500 silencioso.

### 11.3 Corregir `0037` (para instalaciones limpias)

`0037` debe resolverse por catálogo, no por string literal:

```sql
UPDATE roles r
   SET permissions = r.permissions || (
       SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
         FROM permissions p
        WHERE p.resource = 'assignments' AND p.action = 'UPDATE'
          AND p.deleted_at IS NULL)
 WHERE r.name = 'admin_org' AND r.deleted_at IS NULL
   AND NOT (r.permissions @> (
       SELECT jsonb_build_array(p.id::text) FROM permissions p
        WHERE p.resource = 'assignments' AND p.action = 'UPDATE'
          AND p.deleted_at IS NULL));
```

**Nota:** `MIGRATION_LOG.md:89` marca 0037 como `⏳ Pending`, pero su checksum ya fue
registrado en `schema_migrations` de staging el 2026-10-18 (`MIGRATION_LOG.md:121`).
El log y la DB discrepan — reconciliar antes de editar el archivo.

### 11.4 Test de regresión

Un test que falle si algún elemento de `roles.permissions` no es UUID post-migración.
Es la defensa que habría atrapado esto en agosto de 2026, cuando
`apply-progress.md:27` ya lo había documentado como "NOT fixed — out of scope".

---

## 12. Resumen de defectos encontrados

| # | Severidad | Defecto | Ubicación |
|---|---|---|---|
| 1 | 🔴 Crítico | Strings en formato `resource:ACTION` entran en `roles.permissions` y matan `/auth/me` con 500 | `0021:161-183` → `permission-lookup.service.ts:108` |
| 2 | 🔴 Crítico | `0026` no puede limpiar el formato con dos puntos (parsea por espacio) | `0026:42-43` |
| 3 | 🔴 Crítico | `0037` reintroduce el bug en toda instalación limpia | `0037:23-26` |
| 4 | 🔴 Crítico | No hay runner de migraciones pendientes — 0038 nunca se aplicará sola | `entrypoint-migrations.sh:33-35` |
| 5 | 🟠 Alto | `schema_migrations` de staging backfilled con verificación irrelevante | `MIGRATION_LOG.md:117-132` |
| 6 | 🟠 Alto | `assignRole` reinfecta usuarios perpetuamente | `roles.service.ts:154` |
| 7 | 🟡 Medio | `permission_version` se escribe pero nunca se lee | `auth-context.service.ts:136` |
| 8 | 🟡 Medio | Frontend no distingue 500 de sesión válida → bounce loop | `auth.service.ts:141-154` |
| 9 | ⚪ Info | Comentario obsoleto "0001-0062" (37 archivos) | `entrypoint-migrations.sh:22` |
| 10 | ⚪ Info | `MIGRATION_LOG.md:61` afirma que 0009 normaliza a UUID; el archivo siembra strings | doc vs código |