# Apply Progress: T4.1b E2E Flows

**Change**: t4.1b-e2e-flows
**Implementer**: Minimax (Mavis)
**Date**: 2026-08-23
**Status**: READY FOR VERIFY

> **Nota**: este es un cambio retroactivo. La implementación en
> `backend/test/e2e/flows.e2e-spec.ts` (250 líneas, 5 tests) **ya existía** y
> **ya pasaba** en la suite e2e antes de este change. Este `apply-progress.md`
> formaliza la cobertura propuesta y verifica que sigue verde.

---

## Verificación de la implementación existente

### Archivo
- `backend/test/e2e/flows.e2e-spec.ts` — 10009 bytes, 250 líneas, **5 tests** en un único describe block
- Describe: `E2E flows (T4.1a step 2, Part B)`
- Usa el mismo `TestEnvironment` de T4.1a (Testcontainers real)
- Imports detectados: `INCIDENTS_STREAM_KEY`, `decodeStreamEntry`, `ProvisionedUser`, `TestEnvironment`

### Tests cubiertos

| # | Test | Flujo | Verificación extra |
|---|------|-------|--------------------|
| 1 | anonymous emergency report: inside Santa Elena, outside all zones (still accepted per R2), then read back | FL-1 | — |
| 2 | anonymous ceiling (CC2): READ/CREATE succeed; UPDATE/DELETE/ASSIGN refused 403; unauthenticated refused 401 | FL-2 | — |
| 3 | assignment: an operator claims an incident, a second claim conflicts, the event reaches incidents:events | FL-3 | `XREVRANGE` directo en `incidents:events` |
| 4 | comment lifecycle: a `<script>` payload is sanitized in the PERSISTED row, owner deletes, non-owner refused | FL-4 | `env.pg.query` directo sobre la fila |
| 5 | status lifecycle: pending → in_progress → resolved; out-of-order refused; each transition purges cached listings and emits to the stream | FL-5 | `env.redisCache.get`, `XREVRANGE` |

### Resultados de suite

| Check | Resultado |
|-------|-----------|
| `pnpm run test:e2e --testPathPattern=flows --runInBand` | ✅ 1 suite / 5 tests, 14s |
| `pnpm run test:e2e --runInBand` (suite completa) | ✅ 15 suites / 138 tests |
| `pnpm test` (unit) | ✅ 77 suites / 714 tests |
| `pnpm run typecheck` | ✅ 0 errores |
| `pnpm run lint` | ✅ 0 errores, 16 warnings pre-existentes (sin nuevos) |

### Decisiones técnicas validadas contra el código

- **D1** (un TestEnvironment por describe): el archivo tiene exactamente un `beforeAll`/`afterAll` con `env.start()` y `env.stop()`, y `beforeEach(() => env.reset())` para aislamiento.
- **D2** (provisionUser para auth): todos los actores se crean con `env.provisionUser([...])`, ningún credencial fija.
- **D3** (XSS verificado en DB): test 4 hace `env.pg.query` directo sobre la fila persistida, no solo en el response.
- **D4** (Streams y cache directos): test 3 usa `env.redisStreams.xrevrange` y test 5 usa `env.redisCache.get` para verificar efectos en las costuras reales.
- **D5** (anonymous device_uuid): el CC2 test usa el seed `anonymous` del reset() (consistente con ciudadano real).
- **D6** (5 tests en un describe): confirmado.
- **D7** (SANTA_ELENA_ZONE_ID hardcoded): constante `8f14e45f-ceea-4c1f-8f2c-000000000024` presente como invariante del esquema (migración 0003).

---

## Criterios de cierre (tasks.md)

- [x] `pnpm run test:e2e` incluye y pasa `flows.e2e-spec.ts` (5 tests)
- [x] Job `integration` en CI queda verde
- [x] Ningún test preexistente modificado
- [x] Los 5 flujos cubren: auth anónimo, RBAC ceiling, asignación, XSS, ciclo de estado

Todos los criterios cumplidos.

---

## Archivos analizados (sin modificación)

- `backend/test/e2e/flows.e2e-spec.ts` — verificado, intacto, pasando

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/t4.1b-e2e-flows/specs/**`
- `openspec/changes/t4.1b-e2e-flows/design.md`
- `openspec/changes/t4.1b-e2e-flows/proposal.md`
- Cualquier archivo bajo `backend/src/` (no se toca lógica)
- Cualquier test preexistente (verificado con grep — solo `flows.e2e-spec.ts` se inspeccionó)
- `database/migrations/**` (sin migraciones)

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría formal. La cobertura ya está validada contra la suite completa.
