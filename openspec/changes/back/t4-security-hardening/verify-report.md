# Verify Report: T4 Security Hardening

**Change**: t4-security-hardening  
**Verified**: 2026-08-21  
**Verifier**: Claude QA  
**Verdict**: ✅ PASS (0 CRITICAL / 0 WARNING / 2 SUGGESTION)

---

## Execution Results

| Check | Result |
|-------|--------|
| `pnpm run lint` | ✅ 0 errors, 16 warnings (todos pre-existentes en archivos no tocados) |
| `pnpm run typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ 77 suites / 714 tests passing |
| `pnpm run test:e2e` | ✅ 15 suites / **138 tests** passing (+4 vs baseline de 134) |

---

## Completeness — Tasks vs Implementation

### T4.3c — MoreThan fix (bug funcional)
- `notifications.service.ts:3` — `import { MoreThan, Repository } from 'typeorm'` ✅
- `notifications.service.ts:39` — `created_at: MoreThan(sixtySecondsAgo)` ✅
- `eslint-disable` comentario eliminado ✅
- Test dedup en `notifications.e2e-spec.ts` — nuevo top-level describe, pasa verde ✅

### T4.3a — Helmet
- `package.json` — `helmet@8.3.0` en dependencies ✅
- `main.ts:4` — `import helmet from 'helmet'` ✅
- `main.ts:25` — `app.use(helmet())` antes de `setGlobalPrefix` ✅
- `test/support/test-environment.ts:198` — `app.use(helmet())` en el harness ✅ (desviación justificada)

### T4.3b — Tests E2E de seguridad
- SQL injection → acepta 201 (string literal), rechaza 500, verifica tabla intacta ✅
- XSS round-trip → 201, string almacenado como literal ✅
- Helmet headers → `x-frame-options` + `x-content-type-options: nosniff` ✅

---

## Code Review

### Correctness

**T4.3c**: `MoreThan(sixtySecondsAgo)` es el `FindOperator<Date>` correcto para TypeORM
`findOne({ where: { created_at: <FindOperator> } })`. Genera `WHERE created_at > $1`.
Antes generaba `WHERE created_at = $1` — dedup nunca podía matchear. Fix correcto.

**T4.3a**: `app.use(helmet())` antes de `enableCors()` — orden correcto. Los headers de
seguridad llegan antes que el middleware de CORS, lo que significa que OPTIONS preflight
también los recibe. Defaults de helmet apropiados para API REST (CSP deshabilitado, que
es correcto — CSP es para apps que sirven HTML, no para APIs JSON).

**test-environment.ts**: Minimax agregó `app.use(helmet())` al harness de Testcontainers
para mantener paridad con `main.ts`. Decisión correcta — sin esto, el test de helmet
fallaría en CI/local pero pasaría en producción, lo cual sería un falso negativo.

### Tests

**Test dedup (T4.3c)**: accede directamente a `NotificationsService` via `env.app.get()`.
Esto prueba la lógica de negocio con persistencia real (PostgreSQL real, no mocks).
La secuencia es correcta: `notify()` × 2 → result1 !== null, result2 === null.

**Tests de seguridad (T4.3b)**: assertions defensivas correctas.
- SQL injection: `expect([200, 201, 400]).toContain(response.status)` + `not.toBe(500)`.
  El DTO no tiene `@MaxLength` (T0.3) → title se almacena como literal → 201. Correcto.
- XSS: verifica que el string se devuelve sin alteración, no ejecutado. Correcto para API JSON.
- Helmet: verifica 2 headers representativos. No exhaustivo, pero suficiente para el objetivo.

---

## Desviaciones aceptadas

| # | Desviación | Evaluación |
|---|-----------|------------|
| 1 | Test dedup en nuevo top-level describe (no dentro del describe original de `notifications.e2e-spec.ts`) | ✅ Justificado — el describe original usa mocks, no `TestEnvironment`. El test necesita persistencia real. |
| 2 | `test-environment.ts` modificado (no estaba en scope del design) | ✅ Necesario para paridad main.ts/harness. Sin esto el test de helmet sería un falso negativo. |
| 3 | SQL injection devuelve 201 en lugar de 400 (DTO sin @MaxLength) | ✅ Correcto — el test ya maneja ambos casos. Las queries parametrizadas protegen la DB igual. |

---

## Suggestions (no bloquean)

**S1** — Agregar `@MaxLength(255)` al campo `title` en `create-incident.dto.ts`  
El título puede recibir payloads arbitrariamente largos. No es un bug de seguridad (params
previenen inyección) pero sí una mejora de robustez. Candidato para T4.4 o siguiente change.

**S2** — `Jest did not exit one second after the test run has completed`  
Warning pre-existente causado por el loop `XREADGROUP` de `RealtimeStreamsConsumer`.
Documentado en el comentario del test de regression #2 (línea ~110). No introducido por
este change. Candidato para un change de cleanup de ciclo de vida.

---

## Verdict

**PASS** — implementación completa, correcta, sin regresiones. 4 tests nuevos en verde.
Baseline preservado: 77 unit suites + 15 e2e suites. Listo para `sdd-archive`.
