# Archive Report — E2E: Usuario de pruebas y credenciales reales

**Change**: `2026-09-03-e2e-test-user-and-credentials`  
**Archived**: 2026-09-08  
**Status**: ✅ COMPLETE  

---

## SDD Cycle Summary

| Phase | Status | Date |
|-------|--------|------|
| Proposal | ✅ Done | 2026-09-03 |
| Design | ✅ Done | 2026-09-03 |
| Tasks | ✅ Done | 2026-09-03 |
| Apply | ✅ Done | 2026-09-07 (Minimax + fixes) |
| Verify | ✅ Done | 2026-09-08 (Ronda 3) |
| Archive | ✅ Done | 2026-09-08 |

---

## Artifacts Archived

### Source Documents
- ✅ `proposal.md` — Propuesta inicial, intent y scope
- ✅ `design.md` — 6 decisiones de arquitectura (D1-D6)
- ✅ `tasks.md` — 21 tasks, todas completadas [x]

### Implementation Log
- ✅ `apply-progress.md` — Seguimiento detallado de la implementación, fixes aplicados, deuda anotada
- ✅ `verify-report.md` — Verificación ronda 1-2, hallazgos de CRITICAL-1 y WARNING-2
- ✅ `verify-report-ronda-3.md` — Verificación final, PASS sin bloqueantes

### Specifications
- ✅ `specs/e2e-authentication/spec.md` — 4 requirements, 16 scenarios (copiado a `openspec/specs/e2e-authentication/`)

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| e2e-authentication | Created | 4 requirements, 16 scenarios. Nuevo dominio en `openspec/specs/`. |

Main spec location: `openspec/specs/e2e-authentication/spec.md`

---

## Implementation Summary

### A — Usuario de pruebas en el seed
- ✅ `database/seeds/users.js` siembra `e2e@tase.local` con rol `operador_org` cuando `E2E_PASSWORD` está definida
- ✅ Sin contraseña por defecto en el código (D3)
- ✅ Idempotente, no duplica el usuario e2e
- ✅ Backend spec `t8-e2e-user-seed.e2e-spec.ts` cubre 6 escenarios

### B — Credenciales en los specs
- ✅ Helper compartido en `frontend/e2e/_helpers/e2e-credentials.ts` con perfiles `resolveE2eCredentials()` y `resolveE2eAdminCredentials()`
- ✅ D4 implementado: sin `BASE_URL` → skip; con `BASE_URL` sin `E2E_PASSWORD` → **falla**; con ambos → ejecuta
- ✅ 5 specs de login ahora usan el helper (sin literales de credenciales)
- ✅ Specs de política en `credentials-policy.e2e.ts` (10 tests) verifican B.6 y B.7
- ✅ Menu navigation separa perfiles admin/e2e correctamente (B.8)

### C — CI y despliegue
- ✅ `ci.yml`: caché de Playwright con clave `playwright-${{ runner.os }}-${{ hashFiles(...) }}`
- ✅ `ci.yml`: secret `E2E_PASSWORD` pasado al job `frontend-e2e`
- ✅ `deploy-staging.yml`: seed pasa `E2E_PASSWORD` y verifica resultado
- ✅ Specs de política en `ci-policy.e2e.ts` (6 tests) verifican C.4 y C.5

---

## Issues Found & Resolution

### CRITICAL-1 (Fixed)
**Issue**: `deploy-staging.yml` "Verify seeded users" leía `$E2E_PASSWORD` sin declararlo en su `env:`.  
**Root Cause**: GitHub Actions env no se propaga entre pasos.  
**Resolution**: Agregado `env: E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}` al step.  
**Verification**: ✅ Ronda 3 confirmó fix.

### WARNING-2 (Fixed)
**Issue**: TypeScript TS2339 — acceso a `creds.reason` sin narrowing en unión discriminada.  
**Root Cause**: Falta de type-check en `frontend/e2e/` (no cubierto por ningún CI gate).  
**Resolution**: Narrowing ternary aplicado en 5 archivos: `test.skip(creds.skip, creds.skip ? creds.reason : '')`.  
**Verification**: ✅ `npx tsc --strict --noEmit e2e/*.e2e.ts` → NO TS2339.

### WARNING-1 (Accepted & Refactored)
**Issue**: Helper refactorizado a resolución lazy para mejor observabilidad.  
**Status**: ✅ Documentado en `apply-progress.md` como mejora de diagnóstico.

### SUGGESTION-1 (Anotado)
**Issue**: Deuda de limpieza de comentarios e2e contra staging compartido.  
**Status**: Asignada a `front/2026-09-03-tool-ci-gates` (fase hermana).  
**Impact**: No bloqueante para esta fase.

---

## Verification Gates (Ronda 3)

| Gate | Result |
|------|--------|
| Frontend Jest | 419/419 passed ✅ |
| Angular build | Verde ✅ |
| TypeScript --strict | No TS2339 ✅ |
| Playwright sin env | 16 passed, 13 skipped ✅ |
| Spec compliance | 16/16 scenarios COMPLIANT ✅ |
| Completeness | 21/21 tasks ✅ |

**Overall**: PASS — Sin bloqueantes.

---

## Next Steps

This change is COMPLETE. No follow-up work is required unless:
1. `secrets.E2E_PASSWORD` is configured in GitHub staging environment → D.1 and D.2 can be verified in CI
2. Q1 debit (comment cleanup) is picked up by `front/2026-09-03-tool-ci-gates`

---

## Source of Truth

The following are now the authoritative specs:
- `openspec/specs/e2e-authentication/spec.md` — E2E user, credential management, D4 behavior

## SDD Cycle Complete ✅

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
