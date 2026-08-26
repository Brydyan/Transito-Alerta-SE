# Delta for Documentation & Verification (T7.9.Z — Closure)

## MODIFIED Requirements

### Requirement: R23 — Documentación de migración 0041

El sistema DEBE registrar la migración 0041 (`geography_organizations_seed.sql`) en el registro de auditoría `database/MIGRATION_LOG.md` con descripción exacta del contenido (backfill de código, parroquias, organización semilla) y estado de aplicación (`⏳ Pending` hasta que el operador la aplique en Supabase, `✅ Applied` después).

```
Scenario R23.0 — MIGRATION_LOG.md incluye fila 0041
  Given  un repositorio tras T7.9.C completado
  When   se busca la fila `0041` en database/MIGRATION_LOG.md
  Then   existe exactamente una fila
  And    las columnas incluyen: Migración=0041, Nombre=geography_organizations_seed, Descripción=... (completa), Status=⏳ Pending, Ambiente=supabase
  And    la descripción menciona explícitamente: backfill de code, parroquias de Santa Elena (11 filas), organización CTE - Santa Elena

Scenario R23.1 — Re-anchor de R21 en openspec
  Given  los archivos de spec en openspec/changes/infra/t7-database-schema-parity/
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
  When   el operador ejecuta el contenido de Z5 (0041_geography_organizations_seed.sql)
  Then   la migración aplica sin errores
  And    los conteos verifican (11 parroquias, 1 org)
  And    una segunda ejecución del archivo es un no-op (0 filas cambiadas)
```

### Requirement: R24 — Verificación pre-deploy (CI full suite)

El sistema DEBE pasar todas las compuertas de calidad (lint, typecheck, build, tests) sin errores después de T7.9.C2–C7 y D1–D11 completas.

```
Scenario R24.0 — ESLint sin errores
  Given  los archivos nuevos en backend/test/e2e/*.e2e-spec.ts
  When   se ejecuta npm run lint desde backend/
  Then   no hay errores (exit code 0)
  And    si hay advertencias (@typescript-eslint/no-require-imports deprecated warning), están resueltas

Scenario R24.1 — TypeScript sin errores
  Given  backend/tsconfig.json con strict mode
  When   se ejecuta tsc --noEmit -p tsconfig.json
  Then   no hay errores de tipo (exit code 0)
  And    todas las entidades (IncidentImageEntity, etc.) resuelven contra las migraciones

Scenario R24.2 — Build success
  Given  backend/src y backend/test completos tras C/D
  When   se ejecuta nest build
  Then   exit code 0
  And    dist/ se genera sin warnings de rollup/esbuild

Scenario R24.3 — Unit + E2E tests green
  Given  backend/test/unit/ y backend/test/e2e/ con T7.9.C/D coverage
  When   se ejecuta jest (full suite, ~2 minutos)
  Then   exit code 0
  And    todos los tests C2–C7 (5 unit + 10 e2e) y D1–D11 (16 e2e) pasan
  And    regresión en los 10 suites adyacentes: 134/134 pasan

Scenario R24.4 — Migration suite green
  Given  database/migrations/0001–0041 y database/rollback/*.DOWN.sql
  When   se ejecutan backend/test/migrations/* suites
  Then   exit code 0
  And    0041 aplica limpio sobre una base vacía
  And    re-aplicar 0041 no cambia conteos (idempotencia)
  And    0041.DOWN.sql revierte sin residuos
```

### Requirement: R25 — Preparación de deployment a Supabase

El sistema DEBE proporcionar al operador instrucciones exactas y verificables para aplicar 0041 en producción de forma segura.

```
Scenario R25.0 — Bloque de aplicación manual documentado
  Given  Z5 completado (operator manual redactado)
  When   el operador abre el documento Z5
  Then   contiene: SQL exact copy-paste (contenido de 0041_geography_organizations_seed.sql)
  And    precondiciones explícitas (0040 debe estar en schema_migrations)
  And    checklist de verificación post-aplicación (3 queries de count)
  And    instrucción de rollback (si algo falla, restore point en Supabase + reiniciar)

Scenario R25.1 — Pre-requisito de 0040 verificable
  Given  una base Supabase antes de aplicar 0041
  When   se ejecuta SELECT * FROM schema_migrations WHERE name='0040_rename_roles'
  Then   retorna exactamente 1 fila (0040 ya fue aplicado y registrado)
  And    si la query retorna 0 filas, Z5 instruye al operador correr npm run db:migrate primero

Scenario R25.2 — Status tracking en MIGRATION_LOG.md
  Given  0041 aplicada exitosamente en Supabase
  When   el operador actualiza database/MIGRATION_LOG.md fila 0041
  Then   Status pasa de ⏳ Pending a ✅ Applied
  And    se registra Applied Date (fecha/hora) y Applied By (usuario operador)
```
