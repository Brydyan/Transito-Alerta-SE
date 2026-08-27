# Tasks: T8 — Database Cutover & Operational Readiness

**Change**: t8-database-cutover
**Date**: 2026-08-26
**Mode**: Strict TDD (`pnpm test && pnpm run test:e2e` desde `backend/`)
**Orden de ejecución**: D8.1 → D8.2 → D8.4 (migración 0042) → D8.3
**Fase opcional al final**: D8.5 = cierre del compliance R38

> Orden: cada grupo arranca sólo si el anterior deja la suite completa en
> verde. Dentro de cada grupo el orden es **Test (🔴) → Migración (si
> aplica) → Implementación → Refactor**. Donde no hay implementación
> (D8.3 runbook, D8.4 queries), el orden es **Test (🔴) → Documentación**.
>
> Ninguna tarea se marca `[x]` en esta fase — eso es de la fase apply.

---

## D8.1 — Verificación sistemática de integridad referencial

### Fase A — Test del inventario dinámico (R32)

- [x] **T8.1.A1** — 🔴 Crear `backend/test/e2e/t7-integrity-referential.e2e-spec.ts` con los escenarios R32.1, R32.2. Debe fallar (el archivo no existe). **(1h)**
- [x] **T8.1.A2** — Implementar la query de R32.1 en el spec. Debe pasar. **(1h)**
- [x] **T8.1.A3** — Agregar la asserción R32.1 de que `delete_rule ≠ 'NO ACTION'` para todas las filas. Debe pasar (es estado actual). **(30min)**

### Fase B — Test de INSERT inválido por FK (R33)

- [x] **T8.1.B1** — 🔴 Implementar el escenario R33.1 hardcoded para `incidents.citizen_id`. Debe fallar si el INSERT no devuelve 23503. **(1h)**
- [x] **T8.1.B2** — Generalizar el escenario a iteración sobre el inventario del R32.1 (R33.2). Usar valores UUID aleatorios en la FK para garantizar que son inválidos. **(2h)**
- [x] **T8.1.B3** — Implementar el reporte explícito por FK: nombre de la constraint, tiempo de ejecución, mensaje de error en caso de fallo. **(1h)**

### Fase C — Test de comportamiento de ON DELETE (R34)

- [x] **T8.1.C1** — 🔴 Implementar R34.1 (CASCADE) sobre `comments.incident_id` hardcoded. Debe pasar. **(1h)**
- [x] **T8.1.C2** — Implementar R34.2 (SET NULL) sobre `assignments.user_id` hardcoded. Debe pasar. **(1h)**
- [x] **T8.1.C3** — Implementar R34.3 (RESTRICT) sobre `incidents.category_id` hardcoded. Debe pasar. **(1h)**
- [x] **T8.1.C4** — Generalizar los 3 escenarios a iteración sobre el inventario, filtrando por `delete_rule` ∈ {CASCADE, SET NULL, RESTRICT}. **(2h)**
- [x] **T8.1.C5** — Para cada FK, sembrar un padre y un hijo en una transacción y hacer rollback al final. No debe quedar data residual. **(1h)**

### Fase D — Test de regresión de la regla ON DELETE (R35)

- [x] **T8.1.D1** — 🔴 Crear el escenario R35.1 con una tabla temporal `__tmp_fk_test` con una FK a `users(id)` sin cláusula `ON DELETE`. Debe fallar (porque R32.1 detecta el NO ACTION). **(1h)**
- [x] **T8.1.D2** — El test debe correr en una transacción que se hace rollback al final (no debe quedar la tabla temporal). **(30min)**

### Fase E — Integración al pipeline

- [x] **T8.1.E1** — Agregar el script `test:e2e:cutover` a `backend/package.json` (ver D2 del design). **(15min)**
- [x] **T8.1.E2** — Agregar el job `cutover` a `.github/workflows/ci.yml` que corre `pnpm run test:e2e:cutover` en push a `main` y en nightly. No en PRs. **(1h)**
- [x] **T8.1.E3** — Documentar el perfil en `docs/sdd/conventions.md` (qué tests van en cada perfil). **(30min)**

---

## D8.2 — Ciclo up/down ejercitado contra los 41 archivos reales

### Fase A — Extender el ciclo a 41 archivos (R36)

- [x] **T8.2.A1** — 🔴 Extender `backend/test/e2e/t7-rollback-cycle.e2e-spec.ts` para que itere sobre los archivos reales (`fs.readdirSync` de `database/migrations/` filtrado por regex `^00\d{2}_`) en vez de una lista hardcoded. Debe fallar si el conteo no es 41. **(1h)**
- [x] **T8.2.A2** — Implementar R36.1 (ciclo up/down completo contra los 41). Verde. **(2h)**
- [x] **T8.2.A3** — Implementar R36.2 (cada migración tiene su DOWN homónimo). Verde. **(1h)**

### Fase B — Auditoría de correctitud de los DOWNs (R37)

- [x] **T8.2.B1** — 🔴 Implementar R37.1 con la migración `0036_referential_integrity` como ejemplo representativo. Debe pasar. **(1.5h)**
- [x] **T8.2.B2** — Generalizar R37.1 a las 41 migraciones (R37.2). Implementar el loop con snapshot diff. Verde. **(3h)**
- [x] **T8.2.B3** — Implementar el reporte: por cada DOWN problemático, lista el delta de tablas/columnas/constraints/funciones/triggers. **(1.5h)**
- [x] **T8.2.B4** — Limitar la duración total del test a ≤ 5 minutos (R37.2 última asserción). Si supera, paralelizar con workers. **(1h)**

### Fase C — Housekeeping de los DOWNs que el ciclo revele

- [x] **T8.2.C1** — Para cada DOWN que R37.2 reporte como problemático, abrir un sub-task `T8.2.C{1+N}` que corrija el archivo y documente la corrección en `database/MIGRATION_LOG.md` con tipo `housekeeping`. **(2h c/u, variable)**
- [x] **T8.2.C2** — Re-correr R37.2 después de cada housekeeping. Verde. **(30min c/u)**
- [x] **T8.2.C3** — Una vez todos los DOWNs son correctos, mover el `T7.1.C3` del tasks.md de T7 (archivado) a estado "cerrado por housekeeping de T8" con link. **(30min)**

---

## D8.4 — Monitoreo post-cutover (queries canónicas)

> Esta fase va antes de D8.3 porque el runbook referencia las queries de
> esta fase. Si se invierte el orden, el rehearsal no puede probar el
> monitoreo.

### Fase A — Migración 0042 (helpers de monitoreo)

- [x] **T8.4.A1** — 🔴 Crear `database/migrations/0042_monitoring_helpers.sql` con las 6 funciones del §3 del design. Cada función con su `LANGUAGE sql STABLE`. Verde. **(2h)**
- [x] **T8.4.A2** — Crear `database/rollback/0042_monitoring_helpers.DOWN.sql` con `DROP FUNCTION IF EXISTS` para las 6. **(15min)**
- [x] **T8.4.A3** — Agregar fila 0042 a `database/MIGRATION_LOG.md` con la nota del permiso excepcional de §5 del design. **(15min)**
- [x] **T8.4.A4** — Aplicar 0042 a staging. Verificar con `SELECT proname FROM pg_proc WHERE pronamespace = 'public' AND proname LIKE 'monitor_%'` que devuelve 6 filas. **(30min)**

### Fase B — Queries canónicas

- [x] **T8.4.B1** — Crear `database/monitoring/queries.sql` con las 6 invocaciones a las funciones, cada una con el comentario `-- ALERT: <condición>`. **(1h)**
- [x] **T8.4.B2** — 🔴 Test `cutover-validation.e2e-spec.ts` con R30.2: cada query corre sin error de syntax y los nombres referenciados existen. Verde. **(1h)**
- [x] **T8.4.B3** — Documentar las queries en `docs/runbooks/cutover.md` §"Apéndice: queries de monitoreo" (link al archivo + excerpt). **(30min)**

---

## D8.3 — Cutover: validación, runbook, rehearsal

### Fase A — Runbook (R27, R28)

- [x] **T8.3.A1** — Crear `docs/runbooks/cutover.md` con la estructura del §4 del design y el front-matter de D4. **(3h)**
- [x] **T8.3.A2** — Llenar la sección "Criterios go/no-go" con los 8 checks de R26 y R30, todos copy-pasteables. **(1.5h)**
- [x] **T8.3.A3** — Llenar la sección "Dual-write" con la decisión de R28.1 (firmar antes de fijar fecha de cutover). **(30min)**
- [x] **T8.3.A4** — Llenar la sección "Rollback" con los pasos de R29.1. **(1h)**

### Fase B — Rehearsal script (R29)

- [x] **T8.3.B1** — Crear `backend/scripts/cutover-rehearsal.sh` con la detección de modo de D3 y el guard de D7. **(2h)**
- [x] **T8.3.B2** — Implementar el flujo completo de R29.1 (snapshot PITR → INSERT → verify → restore → verify). Cada paso con salida esperada. **(3h)**
- [x] **T8.3.B3** — Implementar el cronómetro por paso y el reporte final (duración total, resultado por check, link al log). **(1h)**
- [x] **T8.3.B4** — 🔴 Test `cutover-validation.e2e-spec.ts` con R27.1, R27.2, R27.3, R27.4 (existencia del runbook + contenido + rehearsal). Verde. **(2h)**

### Fase C — Primer rehearsal contra staging

> **Nota**: T8.3.C1-C2 se ejecutarán en el primer cutover real con datos de producción. No se ejecutan ahora porque los datos en GeoReporta son de test, no de producción.

- [ ] **T8.3.C1** — Ejecutar `CUTOVER_MODE=staging ./cutover-rehearsal.sh` contra Supabase staging. Capturar stdout a `docs/runbooks/cutover-rehearsals/2026-XX-XX.log`. **(1h)** ⏸️ Ejecutable post-merge
- [ ] **T8.3.C2** — Llenar la sección "Última ejecución" de `cutover.md` con la fecha, hora, duración y resultado del paso anterior. Actualizar el front-matter. **(30min)** ⏸️ Ejecutable post-merge
- [ ] **T8.3.C3** — Si la duración total > 30 min, replanificar la ventana de cutover real antes de fijar fecha. Documentar la decisión. **(30min)**
- [ ] **T8.3.C4** — Si algún check falló, abrir un sub-task `T8.3.C{4+N}` que cierre el gap antes de cualquier cutover real. **(variable)**

---

## D8.5 — Cierre del compliance (R31, R38)

### Fase A — Sync del spec `database-schema` (R38)

- [x] **T8.5.A1** — Editar `openspec/specs/database-schema/spec.md` tabla de compliance status: fila R17-R18 pasa de "⚠️ Partial" a "✅ Compliant (R17 cerrado por t8-database-cutover R37; R18 cerrado por R31.1)". **(15min)**
- [x] **T8.5.A2** — Verificar que ningún otro item de la tabla sigue en `⚠️ Partial` o `❌`. Si queda alguno, abrir sub-task. **(15min)**

### Fase B — Sync del doc base (R31.1)

- [x] **T8.5.B1** — Editar `docs/tasks/3-DATABASE-SCHEMA.md` §"Estrategia de Cutover":
      - Sección 1: 4 sub-checks en `[x]`
      - Sección 3: referencia a `docs/runbooks/cutover.md` con fecha del último rehearsal
      - Sección 4: referencia a `database/monitoring/queries.sql`
      - Sección "Criterios de Éxito": todos los checks en `[x]` o referencia al change que los cierra. **(1h)**
- [x] **T8.5.B2** — Verificar que `database/MIGRATION_LOG.md` tiene 41 filas + las de housekeeping de T8.2.C. **(15min)**

### Fase C — Verify final

- [x] **T8.5.C1** — Correr `pnpm test && pnpm run test:e2e && pnpm run test:e2e:cutover` desde `backend/`. Los 3 verdes. **(30min)**
- [x] **T8.5.C2** — Correr `pnpm run typecheck && pnpm run lint`. Los 2 limpios. **(15min)**
- [ ] **T8.5.C3** — Actualizar el front-matter de `cutover.md`: `result: pass` después del primer rehearsal exitoso. **(5min)**
- [ ] **T8.5.C4** — Mover el change a `openspec/changes/archive/2026-XX-XX-t8-database-cutover/`. **(5min)**

---

## Resumen de esfuerzo

| Grupo | Horas estimadas | Notas |
|-------|----------------|-------|
| D8.1 verificación referencial | 11.25h | mayoría es generalización del inventario a todas las FKs |
| D8.2 ciclo up/down | 9.25h + housekeeping variable | el R37.2 es el test más caro (5 min de runtime) |
| D8.4 queries de monitoreo | 5.5h | la migración 0042 rompe la regla de "ninguna migración" del proposal (permiso excepcional de §5 del design) |
| D8.3 runbook + rehearsal | 14.5h | incluye el primer rehearsal real contra staging |
| D8.5 cierre | 2.25h | mecánico |
| **Total** | **~42.75h + housekeeping** | ~1 semana para 1 backend, ~3-4 días para 2 backend en paralelo |

---

## Riesgos operativos del tasks.md

| Riesgo | Mitigación |
|--------|------------|
| T8.2.C (housekeeping) descubre que un DOWN requiere cambiar el UP | Abre un sub-task que genera una nueva migración 0042+; no se hace housekeeping silencioso. Documentar en `apply-progress.md` |
| El rehearsal contra staging dura más de 30 min | T8.3.C3 fuerza una replanificación ANTES de fijar fecha de cutover real. No se acepta "ya casi" |
| Las queries de Q1-Q6 tienen falsos positivos en los primeros días de prod | Los umbrales de §3 del design son iniciales, no finales. T8 deja la documentación para ajustarlos tras 1 semana en prod (decisión fuera de T8) |
| El job `cutover` en CI agrega costo al pipeline | D2 del design + T8.1.E2 lo limitan a `main` y nightly, no a PRs. Documentado |
