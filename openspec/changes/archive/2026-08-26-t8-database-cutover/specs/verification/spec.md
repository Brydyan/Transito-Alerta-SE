# Spec: Database Verification

**Change**: t8-database-cutover
**Capability**: verification
**Version**: R1
**Date**: 2026-08-26
**Predecesor**: `t7-database-schema-parity` (archivado 2026-08-24) — R14, R15, R16

> Todos los escenarios se validan con Postgres + PostGIS real (Testcontainers
> + Jest), nunca con mocks. Un escenario se considera cumplido sólo si existe
> un test que pasa y prueba el comportamiento en runtime.
>
> El listado completo de FKs y constraints a verificar se genera
> **programáticamente** desde `information_schema` al inicio del spec, no
> desde una tabla hardcoded. Esto protege contra drift: si una migración
> nueva agrega una FK, el test la cubre automáticamente.

---

## R32 — Inventario dinámico de FKs del esquema

**Background**: el inventario de FKs (T7 §1.3 del design) se hizo a mano
contra las 29 migraciones de entonces. Ahora hay 41. La auditoría
sistemática debe empezar por regenerar ese inventario programáticamente.

```
Scenario R32.1 — Listado completo de FKs
  Given  una base Testcontainers con 0001-0041 aplicadas
  When   se ejecuta la query:
         SELECT
           tc.table_name,
           kcu.column_name,
           ccu.table_name AS foreign_table,
           ccu.column_name AS foreign_column,
           rc.delete_rule,
           rc.update_rule
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
  Then   la query devuelve al menos 30 filas
  And    ninguna fila tiene delete_rule = 'NO ACTION' (todas deben ser
         CASCADE, SET NULL, SET DEFAULT o RESTRICT explícitos)
  And    los nombres de tablas y columnas retornados son los esperados

Scenario R32.2 — El inventario excluye objetos de Supabase
  Given  la misma query del R32.1
  When   se filtran las filas cuyo table_schema no es 'public'
  Then   ninguna fila pasa el filtro
  And    el inventario no incluye tablas propias de Supabase
         (storage.objects, auth.users, etc.)
```

---

## R33 — INSERT con FK inválida se rechaza con SQLSTATE 23503

**Background**: el comportamiento estándar de Postgres ante una FK inválida
es devolver SQLSTATE 23503 (`foreign_key_violation`). El test verifica
este comportamiento para cada FK del esquema.

```
Scenario R33.1 — INSERT con FK inválida falla con 23503
  Given  una base Testcontainers con 0001-0041 aplicadas
         Y un usuario `users` con `id = $USER_ID$` y `device_uuid = 'dev-test'`
  When   se intenta:
         INSERT INTO incidents (id, title, location, status, priority,
                                citizen_id, organization_id, created_at, updated_at)
         VALUES (gen_random_uuid(), 'test', ST_GeomFromText('POINT(0 0)', 4326),
                 'pending', 'medium', $RANDOM_UUID$, NULL, now(), now())
  Then   el INSERT falla con error.code = '23503'
  And    el mensaje de error incluye el nombre de la constraint
         (`incidents_citizen_id_fkey` o equivalente)
  And    no se crea ninguna fila en `incidents`

Scenario R33.2 — El test recorre todas las FKs
  Given  el inventario del R32.1
  When   el test itera por cada fila del inventario
  Then   para cada (table, column, foreign_table, foreign_column) genera
         un INSERT sintético con un valor UUID aleatorio en la FK
  And    verifica que el INSERT falla con 23503
  And    registra el tiempo de ejecución por FK
  And    si alguna FK acepta el INSERT inválido, el test falla con mensaje
         explícito: "FK <name> on <table>.<column> accepts invalid value"
```

---

## R34 — Comportamiento de ON DELETE verificado

**Background**: el design de T7 §1.3 documenta 8 CASCADE, 11 SET NULL, 2
RESTRICT. Este requirement verifica el comportamiento real de cada uno,
no sólo la cláusula declarada en la migración.

```
Scenario R34.1 — ON DELETE CASCADE borra los hijos
  Given  una FK con delete_rule = 'CASCADE' (ej. comments.incident_id → incidents.id)
  When   se inserta un incidente de prueba
         Y se inserta un comentario con incident_id apuntando a él
         Y se ejecuta DELETE FROM incidents WHERE id = $INCIDENT_ID$
  Then   la fila de incidents desaparece
  And    la fila de comments asociada también desaparece
  And    el conteo de comments WHERE incident_id = $INCIDENT_ID$ es 0

Scenario R34.2 — ON DELETE SET NULL pone la columna a NULL
  Given  una FK con delete_rule = 'SET NULL' (ej. assignments.user_id → users.id)
  When   se inserta un usuario de prueba
         Y se inserta una asignación con user_id apuntando a él
         Y se ejecuta DELETE FROM users WHERE id = $USER_ID$
  Then   la fila de users desaparece
  And    la fila de assignments sobrevive con user_id = NULL
  And    el conteo de assignments WHERE user_id = $USER_ID$ es 0
  And    el conteo de assignments WHERE user_id IS NULL
         (con el resto de columnas iguales) es ≥ 1

Scenario R34.3 — ON DELETE RESTRICT rechaza el DELETE
  Given  una FK con delete_rule = 'RESTRICT' (ej. incidents.category_id → incident_categories.id)
  When   se inserta una categoría de hoja
         Y se inserta un incidente con category_id apuntando a ella
         Y se ejecuta DELETE FROM incident_categories WHERE id = $CAT_ID$
  Then   el DELETE falla con error.code = '23503'
  And    la fila de incident_categories sobrevive
  And    la fila de incidents sobrevive
  And    un mensaje de error claro indica la FK que impide el borrado
```

---

## R35 — El test falla si una migración futura omite ON DELETE

**Background**: la regla "ninguna FK sin cláusula `ON DELETE`" es una
decisión de proyecto (T7 D7.7 / R15). El test debe detectar
regresiones a esa regla.

```
Scenario R35.1 — Aplicar una FK sin ON DELETE en una migración de prueba falla el spec
  Given  una base Testcontainers con 0001-0041 aplicadas
  When   se ejecuta una migración de prueba que crea una tabla temporal
         con una FK a `users(id)` sin cláusula `ON DELETE`
  Then   el R32.1 falla porque la nueva FK tiene delete_rule = 'NO ACTION'
  And    el R33.2 falla porque el test reporta la nueva FK como "acepta
         valor inválido" (no se le puede aplicar el patrón porque el test
         itera sobre TODAS las FKs y verifica consistencia, no ausencia
         de cobertura)
  And    el mensaje de error del test cita la regla violada y la fila
         exacta de la nueva FK en information_schema
```

---

## R36 — Ciclo up/down completo contra los 41 archivos reales

**Background**: el test `t7-rollback-cycle.e2e-spec.ts` fue escrito
contra 29 archivos. Con T7.9.C/D (archivado 2026-08-26) hay 41. Este
requirement extiende el ciclo para cubrir los 12 nuevos.

```
Scenario R36.1 — Aplicar 0001-0041 y luego 0041-0001 deja la base vacía
  Given  una base Testcontainers vacía
  When   se ejecutan los 41 archivos de `database/migrations/` en orden
         numérico ascendente
  And    luego se ejecutan los 41 archivos de `database/rollback/` en
         orden numérico descendente
  Then   el conteo de tablas en information_schema.tables con
         table_schema = 'public' Y table_name IN (
           'incidents', 'comments', 'users', 'organizations',
           'roles', 'permissions', 'incident_categories',
           'geo_zones', 'assignments', 'status_history',
           'notifications', 'comment_images', 'incident_images',
           'invitations', 'password_reset_tokens', 'user_sessions',
           'schema_migrations'
         ) es 0
  And    el conteo de funciones en information_schema.routines con
         routine_schema = 'public' es 0
  And    el conteo de triggers en information_schema.triggers con
         trigger_schema = 'public' es 0

Scenario R36.2 — Cada archivo tiene su DOWN homónimo
  Given  el directorio `database/migrations/`
  When   se listan los archivos `00{01..41}_*.sql`
  Then   para cada uno existe el archivo homónimo `.DOWN.sql` en
         `database/rollback/` (verificado por `fs.existsSync`)
  And    el conteo de archivos en `database/rollback/` que NO tienen
         contraparte en `database/migrations/` es 0
```

---

## R37 — Auditoría de correctitud de los archivos DOWN

**Background**: el ciclo del R36 detecta el resultado final (tabla borrada
o trigger eliminado), pero no detecta semánticas intermedias — por ejemplo,
un DOWN que elimina la constraint pero no la columna, dejando una columna
huérfana que el siguiente UP no puede recrear porque ya existe.

```
Scenario R37.1 — Por cada archivo DOWN, su ejecución es inversible
  Given  una base Testcontainers con 0001-0041 aplicadas
  When   para cada archivo DOWN `0036_referential_integrity.DOWN.sql`
         (como ejemplo representativo), se ejecuta en una base
         dedicada y luego se vuelve a aplicar el UP correspondiente
  Then   el UP siguiente no falla
  And    el estado final del esquema es idéntico al de una base donde
         sólo se aplicó el UP sin ejecutar el DOWN antes
  And    el conteo de constraints en information_schema.table_constraints
         con table_schema = 'public' es el mismo antes y después del ciclo

Scenario R37.2 — Auditoría sistemática de los 41 archivos
  Given  una base Testcontainers vacía
  When   para i en 1..41:
           1. Aplicar `0001..00i` en una base snapshot
           2. Aplicar `00i.DOWN` en la misma base
           3. Comparar el esquema resultante con el de la base snapshot
              original (antes de 0001..00i)
  Then   las 3 bases son equivalentes en structure (tablas, columnas,
         constraints, índices, funciones, triggers)
  And    el test reporta, por cada DOWN, el delta si lo hay
  And    si algún DOWN deja estado residual, el test falla con la lista
         completa de los DOWNs problemáticos
  And    la duración total del test es ≤ 5 minutos en CI
```

---

## R38 — Cierre del compliance status del spec `database-schema`

**Background**: el compliance status del spec R2 (post-T7) lista
"R17-R18 (transversal / docs) | ⚠️ Partial" con dos items abiertos:
"T7.Z1 (e2e full-schema) and docs sync (T7.1.D2/R18.1) not yet executed".

Este requirement cierra T7.Z1 (el R37.2 de este spec es la ejecución
sistemática que faltaba). T7.1.D2 (docs sync) se cierra en el spec
`cutover` con el R31.1.

```
Scenario R38.1 — El spec database-schema R2 ya no marca R17-R18 como Partial
  Given  este change archivado
  When   se edita `openspec/specs/database-schema/spec.md` línea de
         compliance status
  Then   la fila R17-R18 dice "✅ Compliant" o "✅ Compliant (R17 cerrado
         por t8-database-cutover R37; R18 cerrado por R31.1)"
  And    no queda ningún ⚠️ Partial en la tabla de compliance
```
