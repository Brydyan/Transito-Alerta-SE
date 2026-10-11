# Spec: Database Cutover

**Change**: t8-database-cutover
**Capability**: cutover
**Version**: R1
**Date**: 2026-08-26
**Base doc**: `docs/tasks/3-DATABASE-SCHEMA.md` §"Estrategia de Cutover" + `docs/tasks/0-OVERVIEW.md` §"Criterios de Éxito"

> Los escenarios de este spec se validan de dos formas:
> - **Ejecutables**: tests e2e (Jest + Testcontainers) que pasan en CI.
> - **Operativos**: ejecución documentada del runbook contra staging de Supabase,
>   con captura de stdout/timestamp.
>
> Un escenario se considera cumplido sólo si existe al menos una de las dos
> formas de evidencia. Un escenario puramente operativo sin automatización
> queda marcado como `📋 MANUAL` y debe ejecutarse antes de cerrar el change.

---

## R26 — Validación pre-cutover ejecutable

**Background**: `3-DATABASE-SCHEMA.md` lista cuatro sub-checks de validación
pre-cutover; los dos que quedan `[ ]` ("Probar integridad referencial de forma
sistemática", "Ejercitar el rollback completo") son la base de este requirement
y se prueban en el spec `verification`. Este requirement agrega los dos
sub-checks que ya estaban `[x]` y los formaliza como tests automatizados que
corren en `npm test`.

```
Scenario R26.1 — El esquema en staging coincide con la fuente de verdad
  Given  una instancia de staging de Supabase
  When   se ejecuta `npm run db:migrate:status`
  Then   el reporte lista exactamente las versiones 0001 a 0041 como aplicadas
  And    ningún reporte de drift por checksum
  And    el comando sale con código 0

Scenario R26.2 — La app NestJS arranca contra staging
  Given  una instancia de staging de Supabase con 0001-0041 aplicadas
  When   se ejecuta `pnpm start:prod` con DATABASE_URL apuntando a staging
  Then   el proceso boota sin errores de TypeORM "entity not found in schema"
  And    el endpoint GET /api/health responde 200
  And    el proceso registra la conexión al pool de Postgres

Scenario R26.3 — PostGIS está disponible con la versión esperada
  Given  una instancia de staging de Supabase
  When   se ejecuta `SELECT postgis_full_version();`
  Then   el resultado incluye la cadena "3.4" o superior hasta "4.0" (la versión
         soportada por el proyecto; ver `docs/tasks/3-DATABASE-SCHEMA.md` §1)
  And    `SELECT count(*) FROM pg_extension WHERE extname = 'postgis'`
         devuelve 1

Scenario R26.4 — La suite e2e de referencia arranca contra staging
  Given  una instancia de staging de Supabase con 0001-0041 aplicadas
  When   se ejecuta `npm run test:e2e` con DATABASE_URL apuntando a staging
         Y con REDIS_URL apuntando al Redis de staging
  Then   las suites de T1-T7 (incidents, comments, auth, organizations,
         status-history, geofencing, geo-zones, etc.) pasan en verde
  And    el conteo de tests es al menos 399 (el baseline actual)
```

---

## R27 — Runbook de cutover ejecutable

**Background**: el 0-OVERVIEW.md fija "plan de rollback probado" como criterio
de éxito del proyecto. No existe como artefacto. Este requirement lo crea y
exige que sea ejecutable desde la línea de comandos sin intervención humana
en el panel de Supabase.

```
Scenario R27.1 — El runbook existe en la ruta declarada
  Given  el repositorio en estado committed
  When   se lista `docs/runbooks/`
  Then   existe el archivo `cutover.md`
  And    comienza con un front-matter que incluye `version: 1` y `owner: ops`

Scenario R27.2 — El runbook tiene criterios go/no-go ejecutables
  Given  el archivo `docs/runbooks/cutover.md`
  When   se lee la sección "Criterios go/no-go"
  Then   cada criterio es una lista de uno o más comandos shell copy-pasteables
  And    cada comando tiene una salida esperada literal (entre backticks)
  And    ningún criterio requiere entrar al panel web de Supabase

Scenario R27.3 — El runbook lista las queries de monitoreo
  Given  el archivo `docs/runbooks/cutover.md`
  When   se lee la sección "Monitoreo post-cutover (48h)"
  Then   referencia al archivo `database/monitoring/queries.sql`
  And    ese archivo contiene queries numeradas con umbral de alerta
         documentado como comentario `-- ALERT: <condición>`

Scenario R27.4 — El rehearsal dry-run está documentado
  Given  el archivo `docs/runbooks/cutover.md`
  When   se lee la sección "Rehearsal"
  Then   contiene un bloque "Última ejecución" con:
         - fecha y hora de inicio
         - fecha y hora de fin
         - duración total
         - resultado de cada check del runbook (PASS/FAIL)
         - link al log crudo capturado durante el rehearsal
  And    el campo "duración total" es menor o igual a 30 minutos
         (la ventana de cutover del 3-DATABASE-SCHEMA.md §"Estrategia de Cutover")
```

---

## R28 — Decisión de dual-write documentada

**Background**: el plan original contemplaba un dual-write de 1 semana entre
Laravel y NestJS. `3-DATABASE-SCHEMA.md` nota que los 4 triggers de legacy
tienen semántica distinta en el stack nuevo, lo que hace el dual-write
arriesgado. Este requirement fuerza la decisión por escrito antes de fijar
fecha de cutover.

```
Scenario R28.1 — El runbook documenta la decisión de dual-write
  Given  el archivo `docs/runbooks/cutover.md`
  When   se lee la sección "Dual-write"
  Then   declara explícitamente una de dos opciones:
         (A) "No dual-write. Cutover directo con la API Laravel detenida
              antes de levantar NestJS."
         (B) "Dual-write con Laravel como mirror de NestJS durante N días,
              con el siguiente acuerdo sobre los 4 triggers de legacy: …"
  And    la opción elegida está firmada por nombre del operador
  And    la fecha de la firma está en formato ISO 8601

Scenario R28.2 — Si dual-write, los triggers están bajo control
  Given  que la opción (B) del R28.1 fue elegida
  When   se lee la sub-sección "Triggers de legacy durante dual-write"
  Then   lista los 4 triggers de legacy por nombre
  And    para cada uno declara si se conserva, se deshabilita o se reemplaza
  And    para los triggers que se conservan, declara cómo se garantiza que
         el evento no se duplique (porque NestJS también lo emite)
```

---

## R29 — Rollback probado contra staging

**Background**: el plan de rollback del 0-OVERVIEW menciona "restore
point-in-time de Supabase + reiniciar Laravel" pero no hay un ensayo
documentado de ese flujo. Este requirement cierra ese gap, pero **sin
ejercitarlo contra producción** (eso queda para el día del cutover real).

```
Scenario R29.1 — El rehearsal incluye un rollback dry-run
  Given  el archivo `docs/runbooks/cutover.md`
  When   se lee la sección "Rehearsal"
  Then   el rehearsal ejecuta, en este orden:
         1. Snapshot PITR manual de staging
         2. Aplicación de las migraciones 0001-0041 (deben estar ya aplicadas
            en staging; este paso es un no-op que verifica el runner)
         3. Inserción de un incidente de prueba con un ciudadano ficticio
         4. Verificación de que la inserción quedó en la tabla `incidents`
         5. Restore del snapshot PITR al estado previo al paso 3
         6. Verificación de que la inserción del paso 3 ya no existe
  And    cada paso tiene una salida esperada registrada

Scenario R29.2 — El tiempo de rollback cabe en la ventana de cutover
  Given  el resultado del rehearsal del R29.1
  When   se suma el tiempo de los pasos 5 y 6
  Then   el tiempo total es menor o igual a 15 minutos
  And    este valor se usa como RTO (Recovery Time Objective) en el runbook
```

---

## R30 — Monitoreo post-cutover (queries, no plataforma)

**Background**: el 3-DATABASE-SCHEMA.md menciona monitoreo 48h pero no
provee queries. Este requirement produce las queries canónicas; la
integración con Prometheus/Grafana queda para un change aparte.

```
Scenario R30.1 — Las queries canónicas existen
  Given  el repositorio en estado committed
  When   se lee `database/monitoring/queries.sql`
  Then   el archivo contiene al menos las 6 queries listadas en §3 del
         `design.md` (de este change):
         - Q1: Conteo de incidentes creados en los últimos 5 minutos
         - Q2: Latencia p95 del endpoint /api/incidents en la última hora
         - Q3: Conteo de errores 5xx en los últimos 15 minutos
         - Q4: Pool de conexiones de Postgres en uso vs. disponible
         - Q5: Tamaño del denylist de sesiones revocadas en Redis
         - Q6: Conteo de notificaciones sin leer acumuladas (alerta de fan-out)
  And    cada query tiene un comentario `-- ALERT: <condición>` que
         documenta cuándo escalar

Scenario R30.2 — Las queries son ejecutables contra staging
  Given  el archivo `database/monitoring/queries.sql`
  When   se ejecuta cada query contra staging
  Then   cada query corre sin error de SQL syntax
  And    los nombres de tablas y columnas referenciados existen en el esquema
```

---

## R31 — Cierre del plan original

**Background**: este change es el último que materializa la sección
"Estrategia de Cutover" del 3-DATABASE-SCHEMA.md. Una vez cumplidos R26-R30,
esa sección debe pasar de plan a plan-ejecutado.

```
Scenario R31.1 — El doc base refleja el estado real
  Given  todos los R26-R30 cumplidos
  When   se lee `docs/tasks/3-DATABASE-SCHEMA.md` §"Estrategia de Cutover"
  Then   la sección "1. Validación pre-cutover" tiene los 4 sub-checks en [x]
  And    la sección "3. Ventana de cutover (30 min)" referencia el runbook
         `docs/runbooks/cutover.md` con la fecha del último rehearsal
  And    la sección "4. Monitoreo post-cutover (48 h)" referencia el archivo
         `database/monitoring/queries.sql`
  And    la sección "Criterios de Éxito" tiene todos sus checks en [x] o
         referencia al change que los cierra
```
