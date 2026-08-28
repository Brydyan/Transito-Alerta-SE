# Proposal: T8 — Database Cutover & Operational Readiness

**Change**: t8-database-cutover
**Date**: 2026-08-26
**Author**: Gemini Architect (rol, ejecutado vía Claude Code)
**Base doc**: `docs/tasks/3-DATABASE-SCHEMA.md` (sección "Estrategia de Cutover") + `docs/tasks/0-OVERVIEW.md` (Fase 8) + `docs/tasks/1-BACKEND-MIGRATIONS.md` (cierre de pendientes T7)
**Epic**: ⚠️ Transito-Alerta-SE — cierre de la capa de datos antes de producción
**Predecesores**:
- `t7-database-schema-parity` (archivado 2026-08-24, paridad funcional al 100%)
- `2026-08-26-t7-geography-organizations-seed` (archivado 2026-08-26, geografía + seed pipeline)

---

## Intención

T7 cerró la paridad **de esquema y de referencia** del backend. Lo que queda
sin demostrar es que ese esquema sobrevive a tres cosas que sólo se ven cuando
se opera:

1. **La integridad referencial a nivel de base**, ejercitada de forma sistemática
   contra la realidad de producción (no contra fixtures seleccionadas a mano).
2. **El ciclo up/down del runner de migraciones**, probado contra los 41 archivos
   reales (no contra los 29 con los que se diseñó el runner).
3. **El cutover en sí** — la transición desde GeoReporta/Laravel hacia este stack
   NestJS, que el `0-OVERVIEW.md` fija como criterio de éxito de todo el proyecto
   ("Cutover en producción: despliegue Blue-Green, 0 tiempo inactivo, plan de
   rollback probado") y que `3-DATABASE-SCHEMA.md` documenta como Fase 8 pendiente.

Este change produce los artefactos de verificación y operación que faltan entre
"el esquema está aplicado en Supabase" y "podemos cortar el tráfico de Laravel".
No introduce migraciones de esquema nuevas: lo que introduce es **evidencia
reproducible** de que lo que ya está aplicado funciona, y un **runbook** de
cutover con criterios objetivos de go/no-go.

### Relación con el estado actual (post-T7)

`docs/tasks/3-DATABASE-SCHEMA.md` (actualizado 2026-08-26) reconoce explícitamente
estos pendientes:

> - [ ] Probar integridad referencial de forma sistemática — pendiente, T7 D7.7
> - [ ] Ejercitar el rollback completo — pendiente, T7 D7.1 Fase C

Y describe la estrategia de cutover (sección "Estrategia de Cutover") con cuatro
pasos — validación pre-cutover, dual-write opcional, ventana de cutover, monitoreo
post-cutover — pero sin automatización que los ejecute. Este change materializa
los pasos 1, 2 (parcial) y 3; el 4 (monitoreo post-cutover) se delega al change
siguiente o al runbook operativo, no a este SDD.

El `compliance status` del spec `database-schema` (R2) confirma el mismo estado
desde el lado de los requirements:

> R17-R18 (transversal / docs) | ⚠️ Partial | Full-schema e2e (T7.Z1) and
> docs sync (T7.1.D2/R18.1) not yet executed

Este change ejecuta T7.Z1 (e2e sistemático de integridad referencial) y T7.1.C3
(auditoría + corrección de archivos DOWN), que son los dos items que quedan en
"Partial".

---

## Alcance

### D8.1 — Verificación sistemática de integridad referencial (cierra T7 D7.7)

- **G1**: La suite e2e actual prueba constraints de FK de forma incidental
  (cuando un test intenta un INSERT que viola una FK), pero no existe un test
  que recorra **todas** las FK del esquema y verifique, para cada una, los tres
  escenarios relevantes:
  1. INSERT con FK válida → persiste.
  2. INSERT con FK inválida → falla con código `23503` (foreign_key_violation).
  3. DELETE del padre con el comportamiento `ON DELETE` documentado
     (`CASCADE`, `SET NULL`, `RESTRICT`) → la tabla hija queda en el estado
     declarado en la migración.

  El test existe parcialmente para `incidents.category_id` (constraint de hoja
  de D7.7) y para la propia cascada de `comments.parent_id` de D7.4, pero el
  resto de las ~30 FK del esquema no se prueba contra la realidad.
- **G2**: Las 6 FK declaradas sin cláusula `ON DELETE` (inventariadas en T7
  §1.3 del design, "sin cláusula (NO ACTION implícito)") están corregidas en
  la migración 0036 (R15), pero **no hay un test que falle** si alguien edita
  una migración futura y vuelve a omitir la cláusula.
- **G3**: El test de rollback del D7.1 (T7.1.C1) verifica que `0039 DOWN`
  revierte la migración, pero no verifica que el resultado es coherente con
  el estado previo a la migración ascendente — sólo verifica que la tabla
  ya no existe.

### D8.2 — Ciclo up/down ejercitado contra los 41 archivos reales (cierra T7 D7.1 Fase C)

- **G4**: `backend/test/e2e/t7-rollback-cycle.e2e-spec.ts` fue escrito cuando
  había 29 migraciones, no 41. Las 12 migraciones nuevas (0030–0041) y sus
  archivos DOWN no fueron agregadas al ciclo de prueba hasta donde alcanza la
  auditoría de T7 (`tasks.md` T7.1.C3 sigue `[ ]`).
- **G5**: El task T7.1.C3 ("Corregir los archivos DOWN existentes que el
  ciclo revele como incompletos") nunca se ejecutó contra los 41 archivos
  reales; el ciclo del test de rollback es la única forma sistemática de
  detectarlo.
- **G6**: Los archivos DOWN de las migraciones 0030–0041 fueron escritos en
  los cambios archivados 2026-08-24 y 2026-08-26, pero el `tasks.md` de T7
  no los enumeró en su lista de tareas (R3.2: "para cada uno existe el
  archivo homónimo .DOWN.sql"). Hoy la regla se cumple por inspección
  humana, no por test.

### D8.3 — Cutover: validación pre-cutover y rehearsal automatizado

- **G7**: `3-DATABASE-SCHEMA.md` describe cuatro pasos para el cutover
  (validación pre-cutover, dual-write opcional, ventana de 30 min, monitoreo
  48h) pero ninguno está automatizado. El primer paso (validación
  pre-cutover) tiene cuatro sub-checks; tres están marcados `[x]` y dos
  están marcados `[ ]`. Este change automatiza los dos pendientes.
- **G8**: La estrategia de cutover asume un dual-write opcional entre Laravel
  y NestJS durante una semana, pero `3-DATABASE-SCHEMA.md` nota que los
  cuatro triggers de legacy (`log_incident_status`, `auto_assign_location`,
  `notify_on_status_change`, `check_is_leaf_category`) tienen semánticas
  distintas en el stack nuevo. Un dual-write real requiere un acuerdo
  explícito sobre cuáles triggers se instalan temporalmente. Este change
  produce el acuerdo escrito (en el runbook) y un test que demuestra que la
  estrategia de cutover (con o sin dual-write) no produce pérdida de
  auditoría.
- **G9**: El "Rollback probado" de los Criterios de Éxito del 0-OVERVIEW.md
  requiere un restore point-in-time de Supabase + reinicio de Laravel. No
  existe un test de rehearsal que ejercite ese camino contra un snapshot
  real. Este change produce un script de rehearsal + su primer ensayo
  documentado.

### D8.4 — Runbook de cutover y criterios go/no-go

- **G10**: El "plan de rollback probado" del 0-OVERVIEW es un criterio de
  éxito explícito del proyecto entero. No existe como artefacto. Este
  change lo produce en `docs/runbooks/cutover.md`, con criterios objetivos
  de go/no-go medibles desde la línea de comandos (sin necesidad de estar
  en el panel de Supabase).
- **G11**: El monitoreo 48h post-cutover está listado como paso 4 del
  cutover pero no tiene queries de monitoreo pre-escritas, ni umbrales
  de alerta definidos. Este change produce las queries canónicas y los
  umbrales, pero **no** la integración con Prometheus/Grafana (esa
  integración es un change aparte, fuera de alcance de T8).

---

## Fuera de alcance (deliberado)

| Tema | Decisión | Motivo |
|------|----------|--------|
| Migraciones de esquema nuevas | ❌ No | T8 es de verificación y operación, no de esquema. Cualquier nueva columna la haría un change aparte. |
| Stack de observabilidad (Prometheus/Grafana/Loki) | ❌ No | Identificado como gap en el diagnóstico 2026-08-26; requiere un change `t9-observability` propio. |
| Integración real con Laravel para dual-write | ❌ No | El stack Laravel de GeoReporta ya no se mantiene activamente; el dual-write agrega riesgo sin valor claro para un proyecto de un solo cliente. |
| Storage S3 real (cierre del gap del diagnóstico) | ❌ No | Es código de backend, no verificación de base. Change aparte: `t10-storage-real-backend`. |
| Frontend (Angular v17+ PWA) | ❌ No | La Fase 5 del 0-OVERVIEW está pendiente; este change no la toca. |
| Cambio de versión de Postgres o PostGIS | ❌ No | El stack queda en PostgreSQL 16 + PostGIS 3.4 (verificado ✅). |
| Estrategia de backup pre-cutover (más allá del restore point-in-time de Supabase) | ❌ No | Supabase administrada provee PITR por defecto. La decisión de cuánto快照 tomar antes del cutover es operativa, no de SDD. |

---

## Migraciones nuevas

**Ninguna.** Este change no introduce archivos en `database/migrations/`. Si
durante la ejecución del D8.1 o del D8.2 se descubre un gap que requiere una
migración (ej. una FK con `ON DELETE` ausente en producción que el test
revela), se abre un change aparte con un nombre de la familia `t8.x-…` y se
referencia desde aquí. No se hace una migración improvisada en medio de un
change de verificación.

Por la misma razón, **no se modifican entradas existentes** de
`database/MIGRATION_LOG.md`. El log queda intacto.

---

## Permisos RBAC afectados

**Ninguno.** T8 no introduce recursos ni acciones nuevas en la tabla
`permissions`. La verificación del D8.1 ejercita los permisos ya
existentes (los mismos que D7.9 sembró), no agrega ni quita ninguno.

Si durante la verificación se descubre un permiso faltante, se documenta
como hallazgo en `apply-progress.md` con la misma forma que T7.9 documentó
G23 (permisos de `notifications`).

---

## Dependencias entre módulos

| Grupo | Módulos NestJS / artefactos tocados |
|-------|--------------------------------------|
| D8.1 | `backend/test/e2e/t7-integrity-referential.e2e-spec.ts` (nuevo), `backend/src/entities/*` (sólo lectura — para derivar la lista de FK) |
| D8.2 | `backend/test/e2e/t7-rollback-cycle.e2e-spec.ts` (extender), `database/migrations/*` y `database/rollback/*` (sólo corrección, no adición) |
| D8.3 | `backend/scripts/cutover-rehearsal.sh` (nuevo), `docs/runbooks/cutover.md` (nuevo), `backend/test/e2e/cutover-validation.e2e-spec.ts` (nuevo) |
| D8.4 | `docs/runbooks/cutover.md` (nuevo), `database/monitoring/queries.sql` (nuevo) |

---

## Criterios de éxito

- [ ] El test `t7-integrity-referential.e2e-spec.ts` recorre las 30 FK del
      esquema y para cada una verifica los tres escenarios (INSERT válido,
      INSERT inválido, DELETE con `ON DELETE` declarado). Verde contra
      Testcontainers con 0001–0041 aplicadas.
- [ ] El test `t7-integrity-referential.e2e-spec.ts` falla si una
      migración futura omite la cláusula `ON DELETE` en una FK nueva.
- [ ] El ciclo up/down del test `t7-rollback-cycle.e2e-spec.ts` cubre
      los 41 archivos reales (no los 29 originales). Tras un ciclo
      completo, `information_schema.tables` no contiene ninguna tabla
      de nuestro dominio.
- [ ] Cada uno de los 41 archivos `.sql` tiene un `.DOWN.sql` homónimo,
      verificado por el test, no por inspección humana.
- [ ] Los archivos DOWN que el ciclo revela como incompletos están
      corregidos, con cada corrección documentada en
      `database/MIGRATION_LOG.md` como entrada de housekeeping (no como
      nueva migración).
- [ ] `docs/runbooks/cutover.md` existe, con criterios go/no-go
      ejecutables desde la línea de comandos, y un rehearsal dry-run
      completo registrado con su duración real y los hallazgos.
- [ ] `backend/scripts/cutover-rehearsal.sh` corre en menos de 10
      minutos y produce un reporte (stdout) con el resultado de cada
      check de validación pre-cutover.
- [ ] `database/monitoring/queries.sql` contiene las 6 queries canónicas
      de monitoreo post-cutover, con umbrales de alerta documentados
      inline como comentarios.
- [ ] Suite completa verde: `pnpm test && pnpm run test:e2e` desde
      `backend/`, con el conteo de tests **superior** al baseline actual
      (856 unit + 399 e2e = 1255), porque T8 suma tests.
- [ ] `docs/tasks/3-DATABASE-SCHEMA.md` actualizado: la sección
      "Estrategia de Cutover" pasa de plan a plan-ejercitado, con
      referencia al runbook y a la fecha del primer rehearsal.

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| El test sistemático de FK (D8.1) descubre FKs con `ON DELETE` incorrecto en producción, no sólo en los 41 archivos | Hot-fix de producción durante el cutover | El test corre sobre Testcontainers con el esquema real, no contra Supabase; los hallazgos se documentan y se priorizan ANTES del cutover, no durante |
| El ciclo up/down (D8.2) revela que un archivo DOWN es incorrecto para una migración ya aplicada en Supabase | Imposible hacer rollback real | El hallazgo se reporta a Supabase como housekeeping; el ciclo de rehearsal usa la BD de Supabase staging, no la de producción |
| El rehearsal del D8.3 toma más de los 30 min presupuestados en la ventana de cutover real | Cutover abortado | El rehearsal se cronometra; si supera 20 min, se replanifica la ventana antes de fijar fecha de producción |
| La auditoría sistemática de FK introduce churn en `database/rollback/` justo antes del cutover | Riesgo de regresión | Las correcciones a archivos DOWN existentes pasan por el mismo flujo que una migración nueva: `MIGRATION_LOG.md` actualizado, ciclo up/down verificado, `pnpm test` verde |
| El dual-write con Laravel, si se opta por él, no contempla los 4 triggers con semántica distinta | Auditoría inconsistente | El runbook documenta explícitamente que durante dual-write se asume que el stack nuevo es la fuente de verdad de la auditoría; los triggers de legacy quedan deshabilitados en el PITR de pre-cutover |
| Un test e2e contra Testcontainers + los 41 archivos reales dura más de lo tolerable en CI | Pipeline de PR se vuelve lento | Los tests de D8.1 y D8.2 se marcan como `test:e2e:cutover` (perfil opcional) y corren sólo en `main` + `nightly`, no en cada PR. Documentado en `design.md` D3 |
| El arquitecto (este agente) interpreta alcance y el implementer lo lee distinto | Re-trabajo | Este proposal fija el alcance en formato Given/When/Then en los specs. El implementer trabaja contra los specs, no contra el proposal. La puerta de aprobación humana entre spec_ready e in_progress cubre este riesgo |

---

## Cómo se relaciona con el resto del roadmap

```
T6 paridad funcional ─┐
                       │
T7 paridad de esquema ─┼─→ T8 verificación + cutover ─→ Fase 8 (rollout real)
                       │
T7.9.C/D geografía ────┘
```

Después de T8, el proyecto entra en su última fase de pre-producción
(integración con frontend, load testing contra staging, hardening de
seguridad, y por fin el rollout en producción). T8 no es la última
puerta — es la penúltima. La última es la ejecución del runbook que
T8 produce.
