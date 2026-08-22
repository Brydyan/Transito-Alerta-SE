# Apply Progress: T4 Documentation

**Change**: t4-documentation
**Implementer**: Minimax (Mavis)
**Date**: 2026-08-21
**Status**: READY FOR VERIFY

---

## Tareas completadas

### Fase 0 — Baseline
- ✅ Unit: 77 suites / 714 tests passing
- ✅ E2e: 15 suites / 138 tests passing
- ✅ `helmet@^8.3.0` confirmado en `package.json` dependencies

### Fase 1 — T4.4a: Swagger
- ✅ `@nestjs/swagger@11.4.7` + `swagger-ui-express@5.0.1` instalados y en `package.json`
- ✅ `import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'` agregado en `main.ts`
- ✅ Bloque Swagger agregado en `bootstrap()` después de `useGlobalInterceptors`, antes de `const port`
- ✅ Guard `NODE_ENV !== 'production' && NODE_ENV !== 'test'` (Swagger solo activo en `development`)
- ✅ Typecheck 0 errores
- ✅ Lint 0 errores (16 warnings pre-existentes, sin nuevos)
- ✅ Build limpio
- ✅ E2e 138/138 sin regresiones (Swagger no se monta en `NODE_ENV=test`)

### Fase 2 — T4.4b: Runbook
- ✅ `docs/runbooks/deploy.md` creado con 5 secciones:
  - Pre-requisitos
  - Proceso de Despliegue (CC3)
  - Rollback
  - Variables de Entorno
  - Notas de seguridad

### Fase 3 — Verificación final
- ✅ Lint: 0 errores
- ✅ Typecheck: 0 errores
- ✅ Build: limpio
- ✅ Unit: 77 / 714
- ✅ E2e: 15 / 138
- ✅ Runbook existe con las 5 secciones requeridas

---

## Desviaciones del diseño

1. **`pnpm-workspace.yaml` actualizado**: pnpm 11.20 introduce `verify-deps-before-run` que bloquea `pnpm install` cuando hay build scripts sin aprobar. El `allowBuilds` ya estaba en el archivo pero usaba el formato legacy. Lo migré al formato actual (igual contenido, lista explícita) para que pnpm install no falle con `[ERR_PNPM_IGNORED_BUILDS]`. Sin esto, ningún script `pnpm run` funcionaba.

2. **Sin test E2E de Swagger**: el diseño D4 marca la verificación E2E como opcional. La guard `NODE_ENV=test` ya impide que Swagger se monte en CI, así que no interfiere con tests existentes. El build limpio + arranque manual son la verificación suficiente.

---

## Conteo final de tests

| Capa   | Antes  | Después | Delta |
|--------|--------|---------|-------|
| Unit   | 714    | 714     | 0     |
| E2e    | 138    | 138     | 0     |
| **Total** | **852** | **852** | **0** |

T4.4 no agregó tests — es documentación + setup, no lógica.

---

## Archivos modificados

- `backend/package.json` + `pnpm-lock.yaml` — `@nestjs/swagger@11.4.7`, `swagger-ui-express@5.0.1`
- `backend/src/main.ts` — import + bloque Swagger
- `backend/pnpm-workspace.yaml` — `allowBuilds` migrado a formato pnpm 11 (sin cambio funcional, ya estaba)
- `docs/runbooks/deploy.md` — runbook nuevo (5835 bytes)
- `openspec/changes/t4-documentation/tasks.md` — todas las tareas `[x]`

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/t4-documentation/specs/**`
- `openspec/changes/t4-documentation/design.md`
- `openspec/changes/t4-documentation/proposal.md`
- `database/migrations/**` (sin migraciones)
- Cualquier controller/service/entity existente (Swagger es additive, no toca lógica)

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría.
