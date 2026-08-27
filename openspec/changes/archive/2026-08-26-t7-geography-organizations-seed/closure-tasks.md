# Task Checklist: T7.9.Z — Closure & Operator Handoff

> **Archive note (2026-08-26)**: this checklist was the original SDD-generated
> Z1–Z5 template. All items were completed — see the canonical, up-to-date
> completion narrative in `tasks.md` (section "Cierre") and `apply-progress.md`
> in this same archived folder, which carry the actual `[x]` state and
> execution evidence. This file is preserved verbatim for audit trail only;
> it was flagged by sdd-verify (obs #560) as a stale duplicate that never had
> its checkboxes updated — the discrepancy is resolved by archiving both
> files side by side with `tasks.md` as the authoritative source.

## Z Tasks (Cierre)

> Notas:
> - Z depende de C2–C7 + D1–D11 completadas
> - Z2/Z3 son texto-only (no código), ejecutables ahora
> - Z1/Z4/Z5 dependen de que C/D esté finalizado
> - Z4 es "pass/fail" — no tareas sino gates; si alguno falla, marcar bloqueado

---

- [x] **T7.9.Z1** — Registrar 0041 en `database/MIGRATION_LOG.md` _(30min)_

  Agrega una fila a la tabla `database/MIGRATION_LOG.md` para la migración 0041. Estructura:
  - Migración: `0041`
  - Nombre: `geography_organizations_seed`
  - Descripción: `"Backfill geo_zones.code en 4 filas preexistentes (EC-24, EC-24-01/02/03). INSERT 11 parroquias de Santa Elena desde OSM, code EC-24-0[1-6]-[50-56] con polygon ST_Multi. INSERT org CTE - Santa Elena, zone_id→EC-24-01, parent_id NULL. Idempotente: ON CONFLICT + WHERE NOT EXISTS."`
  - Status: `⏳ Pending` (hasta que operador la aplique en Supabase)
  - Ambiente: `supabase`
  - Aplicado por: vacío
  - Fecha: vacío

  **Aceptación**: Fila existe, no hay typos en Migración/Nombre, descripción menciona backfill/parroquias/org.

---

- [x] **T7.9.Z2** — Re-anclar R21 a 0041 en specs _(45min)_

  Buscar y reemplazar referencias a "0039" en contexto de R21 (geografía + organizaciones semilla) con "0041":

  1. En `openspec/changes/infra/t7-database-schema-parity/specs/database-schema/spec.md`:
     - Si menciona `0039` en R21 escenarios, cambiar a `0041_geography_organizations_seed`
     - Buscar línea "anclado a '0039'" y actualizar a "anclado a '0041'"

  2. En `openspec/changes/infra/t7-database-schema-parity/tasks.md`:
     - Si C1–C6 referencian "0039", cambiar a "0041"
     - Ejemplo: "...verificar que 0041 registró código en geo_zones..." no "0039"

  3. En archivos delta de este change:
     - `openspec/changes/infra/t7-geography-organizations-seed/specs/database-schema/spec.md` — ya está correcto ✓
     - Verificar que R21.0–R21.5 no mezclen referencias

  **Aceptación**: `grep -r "0039.*R21" openspec/changes/infra/` retorna 0 resultados. `grep -r "0041.*R21" openspec/changes/infra/` retorna >0 en al menos 2 archivos.

---

- [x] **T7.9.Z3** — Actualizar `docs/tasks/3-DATABASE-SCHEMA.md` _(30min)_

  Edita `docs/tasks/3-DATABASE-SCHEMA.md` para reflejar migraciones 0001–0041:

  1. Cambiar titular/rango de "0001–0040" a "0001–0041" donde aparezca como rango cerrado
  2. Actualizar tabla "Estado real de las migraciones":
     - Agregar fila: `0041 | T7.9.C/D | Parroquias Santa Elena + org semilla (geography seeding)`
  3. Agregar párrafo de cierre en sección T7 (antes de "Criterios de Éxito"):
     ```
     T7.9.C–D completadas: Migración 0041 siembra 11 parroquias (OSM, ODbL 1.0)
     + organización CTE - Santa Elena. D7.9.D implementa seeding pipeline
     (usuarios, demo/volumen, feed rebuild, npm scripts). T7.9.Z cierra
     con documentación + operador manual.
     ```
  4. En "Gaps" sección, marcar como ✅ cerrados:
     - Parroquias ✅
     - Organizaciones reales ✅
     - Seeding pipeline ✅

  **Aceptación**: Rango dice "0001–0041". T7 closure summary existe. Tabla de migraciones es consistente.

---

- [x] **T7.9.Z4** — Verificación completa de CI _(1h)_

  Ejecuta las cuatro compuertas desde `backend/` (cwd=backend/):

  1. **ESLint**:
     ```bash
     npm run lint
     ```
     ✓ Exit code 0, 0 errores (0 warnings OK si son advisories, no bloqueantes)

  2. **TypeScript**:
     ```bash
     tsc --noEmit -p tsconfig.json
     ```
     ✓ Exit code 0, 0 errores

  3. **Build**:
     ```bash
     nest build
     ```
     ✓ Exit code 0, `dist/` generado sin errores rollup

  4. **Tests**:
     ```bash
     npm test           # unit tests
     npm run test:e2e   # e2e tests
     ```
     ✓ Exit code 0, todos los tests pasan
     ✓ Incluye: T7.9.C2–C7 (5 unit + 10 e2e), T7.9.D1–D11 (16 e2e), regresión (134 tests en 10 suites)

  **Bloqueo**: Si alguno falla, aborta aquí. Marcar Z4 como "BLOQUEADO" con motivo. Resolver el error (likely: lint rules deprecated en D e2e specs, o org_id bug warning) antes de proceder.

  **Aceptación**: Todos 4 gates retornan exit code 0. Número de tests: unit 5 + e2e (10+16+134) ≥ 160 total.

---

- [x] **T7.9.Z5** — Redactar manual del operador _(45min)_

  Crea un documento `database/OPERATOR-MANUAL-0041.md` (o anexa a `MIGRATION_LOG.md`) con pasos exactos para que operador aplique 0041 en Supabase:

  **Contenido**:

  ```markdown
  # Manual de Aplicación: Migración 0041 en Supabase

  ## Pre-requisitos

  Verificar que 0040 (`rename_roles`) está registrada en schema_migrations:

  ```sql
  SELECT * FROM schema_migrations WHERE name='0040_rename_roles';
  ```

  Debe retornar 1 fila. Si retorna 0:
  - Desde terminal local: npm run db:migrate (registra 0040 como idempotent no-op)
  - Luego intenta de nuevo este manual

  ## Aplicación

  Copia y pega el SQL de abajo en el SQL Editor de Supabase. Ejecuta en una transacción.

  [AQUÍ: contenido exacto de database/migrations/0041_geography_organizations_seed.sql]

  ## Verificación Post-Aplicación

  Ejecuta estas 3 queries en el SQL Editor:

  ```sql
  -- Debe retornar 11
  SELECT COUNT(*) as parroquias FROM geo_zones
  WHERE level='parroquia' AND code LIKE 'EC-24-%';

  -- Debe retornar 1
  SELECT COUNT(*) as organizacion FROM organizations
  WHERE name='CTE - Santa Elena';

  -- Nota el resultado (debe ser igual si re-aplicas)
  SELECT COUNT(*) as total_geo_zones FROM geo_zones;
  ```

  ## Idempotencia (Re-run Safety)

  Si necesitas re-ejecutar 0041 en el mismo ambiente:
  - Copia y pega el SQL de nuevo
  - Ejecuta (sera un no-op, sin errores)
  - Re-ejecuta las 3 queries de verificación — números deben ser idénticos

  ## Rollback (si algo falla)

  Copia y pega el SQL de abajo (contenido exacto de database/rollback/0041_geography_organizations_seed.DOWN.sql):

  [AQUÍ: contenido exacto de .DOWN.sql]

  Luego:
  - Re-ejecuta las 3 queries de verificación — parroquias/org desaparecen, totales vuelven a antes

  ## Registro de Auditoría

  Después de aplicación exitosa, actualiza database/MIGRATION_LOG.md fila 0041:
  - Status: ✅ Applied
  - Applied Date: [HOY YYYY-MM-DD HH:MM:SS]
  - Applied By: [tu email/user]

  Committea el cambio.
  ```

  **Pasos Z5**:
  1. Copiar contenido de `database/migrations/0041_geography_organizations_seed.sql`
  2. Copiar contenido de `database/rollback/0041_geography_organizations_seed.DOWN.sql`
  3. Redactar el documento con template arriba (reemplaza [AQUÍ:...] con SQL exacto)
  4. Guardar como `database/OPERATOR-MANUAL-0041.md` o anexo a `docs/deployment/`
  5. Validar que el manual es copy-paste-ready (sin sintaxis errors, SQL bien formateado)

  **Aceptación**: Documento existe, SQL copiado exacto, 3 queries verificación presentes, instrucciones de rollback claras.

  **Nota de cierre**: entregado como `docs/runbooks/apply-0041.md` — path distinto al sugerido aquí, contenido funcionalmente superior (5 checkpoints en vez de 3, referencia el archivo SQL en vez de inlinearlo para evitar drift).

---

## Resumen Z

| Tarea | Esfuerzo | Bloqueador | Estado |
|-------|----------|-----------|--------|
| Z1 (MIGRATION_LOG) | 30min | C completo | ✅ |
| Z2 (Re-anchor R21) | 45min | Ninguno (texto) | ✅ |
| Z3 (docs actualizar) | 30min | Ninguno (texto) | ✅ |
| Z4 (CI verify) | 1h | C+D completo | ✅ GATE PASSED |
| Z5 (Operator manual) | 45min | C completo | ✅ |
| **Total** | **~4.25h** | | **5/5 done** |

**Camino crítico**: C2–C7 → Z1/Z5 (no puede empezar hasta C finalizado).
**Parallelizable**: Z2/Z3 (texto, sin dependencias) pueden hacerse ahora o después.
**Gate**: Z4 (CI) es "pass/fail" — aborta si falla, no avanza.

---

## Notas de Cierre

- T7.9 será "completa" cuando Z4 retorne exit code 0 AND operador haya aplicado 0041 en Supabase AND Z5 manual esté integrado en docs.
- T7 roadmap se cierra con T7.9.Z — próxima fase (T8) se enfoca en audit gap + organizaciones adicionales.
- Después de deployment: monitorear MIGRATION_LOG.md row 0041 Status (debe estar ✅ Applied con fecha).
- **Estado final (2026-08-26)**: Z1–Z4 completos y verificados; 0041 sigue `⏳ Pending` en Supabase — es una acción del operador, no bloquea el archivado SDD (ver archive-report.md).
