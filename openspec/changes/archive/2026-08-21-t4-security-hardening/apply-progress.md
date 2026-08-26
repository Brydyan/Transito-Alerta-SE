# Apply Progress: T4 Security Hardening

**Change**: t4-security-hardening
**Implementer**: Minimax (Mavis)
**Date**: 2026-08-21
**Status**: READY FOR VERIFY

---

## Tareas completadas

Todas las tareas de `tasks.md` marcadas como `[x]`. Resumen por fase:

### Fase 0 — Baseline
- ✅ Unit: 77 suites / 714 tests passing
- ✅ E2e: 15 suites / 134 tests passing (con `--runInBand`; default paralelo falla por colisión de containers Testcontainers)
- ✅ DTO `create-incident.dto.ts`: `title` tiene `@IsString()` + `@MinLength(1)` pero **NO** tiene `@MaxLength()`. El título malicioso se almacena como string literal (devuelve 201, no 400).

### Fase 1 — T4.3c: MoreThan en NotificationsService
- ✅ Test dedup escrito en `test/e2e/notifications.e2e-spec.ts` (nuevo top-level describe `E2E notifications — real persistence (T4.3c)` con su propio `TestEnvironment`).
- ✅ Test confirmado rojo antes del fix (`result2` era Notification, no null).
- ✅ Fix aplicado: `MoreThan` reemplaza IIFE `as any` en `notifications.service.ts:40`. Eliminado el `eslint-disable` ya innecesario.
- ✅ Typecheck + e2e verde.

### Fase 2 — T4.3a: Helmet en main.ts
- ✅ `helmet@8.3.0` instalado y declarado en `backend/package.json` dependencies.
- ✅ `app.use(helmet())` agregado en `src/main.ts` entre `useWebSocketAdapter` y `setGlobalPrefix('api')`.
- ✅ Typecheck / lint (0 errors, 16 warnings pre-existentes) / build clean.

### Fase 3 — T4.3b: Tests E2E de seguridad
- ✅ Nuevo top-level describe `E2E security — input validation and HTTP headers (T4.3a/T4.3b)` en `test/e2e/regressions.e2e-spec.ts`.
- ✅ Test SQL injection: acepta 201/400, rechaza 500, valida que la tabla `incidents` sigue existiendo.
- ✅ Test XSS: round-trip literal del payload, sin ejecución.
- ✅ Test helmet: valida `x-frame-options` y `x-content-type-options: nosniff` en respuestas.
- ✅ `test/support/test-environment.ts` actualizado: `app.use(helmet())` agregado al harness para mantener paridad con `main.ts` (necesario para que el test de Fase 3 vea los headers en e2e). Sin esto, el test pasaría en prod y fallaría en CI/local.

### Fase 4 — Verificación final
- ✅ `pnpm run lint` → 0 errors, 16 warnings (todos pre-existentes en archivos no tocados).
- ✅ `pnpm run typecheck` → 0 errors.
- ✅ `pnpm test` → 77 suites / 714 tests passing.
- ✅ `pnpm run test:e2e --runInBand` → 15 suites / **138 tests passing** (134 baseline + 1 dedup + 3 security).
- ✅ Tests nuevos visibles bajo sus describes correctos.

---

## Desviaciones del diseño

1. **T1.1 — ubicación del test dedup**: la tarea indicaba "al final del describe existente" en `notifications.e2e-spec.ts`, pero ese describe usa `Test.createTestingModule` con mocks de `NotificationsService` (no es e2e real, es unit con naming `.e2e-spec.ts`). El test real de dedup necesita `TestEnvironment` con persistencia real. Solución: agregué un **nuevo top-level describe** con su propio `TestEnvironment` (mismo patrón que `regressions.e2e-spec.ts`). Esto preserva el describe original y le da al test el harness real que el diseño asume.

2. **T2.x / T3.x — `TestEnvironment` también necesita helmet**: el harness `test-environment.ts` replica el bootstrap de `main.ts`. Sin `app.use(helmet())` en el harness, el test de Fase 3 fallaría aunque producción sí envíe los headers. Agregada la misma línea en el harness.

3. **T3.2 — assertion SQL injection**: el DTO no tiene `@MaxLength`, así que el status real es **201** (string literal almacenado). El test escrito es defensivo: acepta 200/201/400 y rechaza 500. Esto cumple el contrato del diseño ("NUNCA 500").

---

## Conteo final de tests

| Capa   | Antes  | Después | Delta |
|--------|--------|---------|-------|
| Unit   | 714    | 714     | 0     |
| E2e    | 134    | 138     | +4    |
| **Total** | **848** | **852** | **+4** |

Detalle de los 4 nuevos:
1. `E2E notifications — real persistence (T4.3c) › deduplicates identical notifications within 60 seconds (T4.3c fix)`
2. `E2E security … (T4.3a/T4.3b) › SQL injection attempt in incident title does not cause 500 or execute SQL (CC1)`
3. `E2E security … (T4.3a/T4.3b) › XSS payload in title returns 201 or 400, never causes script execution in API response (T4.3b)`
4. `E2E security … (T4.3a/T4.3b) › HTTP security headers (helmet) present on API responses (T4.3a)`

---

## Archivos modificados

- `backend/src/modules/notifications/notifications.service.ts` — fix `MoreThan`
- `backend/src/main.ts` — `app.use(helmet())`
- `backend/package.json` + `pnpm-lock.yaml` — `helmet@8.3.0`
- `backend/test/support/test-environment.ts` — `app.use(helmet())` en el harness
- `backend/test/e2e/notifications.e2e-spec.ts` — nuevo top-level describe con test dedup real
- `backend/test/e2e/regressions.e2e-spec.ts` — nuevo top-level describe con 3 tests de seguridad
- `openspec/changes/t4-security-hardening/tasks.md` — todas las tareas marcadas `[x]`

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/t4-security-hardening/specs/**` (contrato de Gemini)
- `openspec/changes/t4-security-hardening/design.md` (contrato de Gemini)
- `openspec/changes/t4-security-hardening/proposal.md`
- `database/migrations/**` (sin migraciones)
- `openspec/config.yaml`

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría.
