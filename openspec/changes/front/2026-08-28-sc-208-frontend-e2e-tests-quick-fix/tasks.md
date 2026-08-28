# Tasks: Frontend E2E Tests Quick Fix (Stream 1a)

**Change**: `2026-08-28-sc-208-frontend-e2e-tests-quick-fix`
**Generated**: 2026-08-28 (from `proposal.md` since no design/tasks existed at hand-off)
**Mode**: Mechanical fix — no new abstractions

> Nota: el `proposal.md` cita line numbers del 1st pass de SC-203.
> Después del 2nd pass de SC-203 (2026-08-28) las líneas se
> corrieron. Las "verificaciones" abajo usan las líneas ACTUALES.

---

## A.1 — Corregir selectors y route en `auth-flow.e2e.ts`

- [x] **A.1.1** — `goto('/auth/login')` → `goto('/login')` (line 29)
- [x] **A.1.2** — `getByLabel(/email/i)` → `getByLabel(/usuario/i)` (line 30, label real es `Usuario` en `login.component.html:52`)
- [x] **A.1.3** — `getByLabel(/contraseña|password/i)` → mantener (label real es `Contraseña` — verificar con grep)
- [x] **A.1.4** — `waitForURL(/\/app\/dashboard/)` ya está correcto (per design.md §"Approach")

## A.2 — Fix producción: `/auth/login` → `/login` en auth.service

- [x] **A.2.1** — `auth.service.ts:92` (refresh catchError) `router.navigate(['/auth/login'])` → `['/login']`. La propuesta cita la línea 91 del 1st pass (logout); en el 2nd pass el bug sobrevive en el refresh catchError.
- [x] **A.2.2** — Verificar con `grep -n "auth/login" frontend/src/` que no quede ninguna otra referencia rota

## A.3 — Agregar `test:e2e` script

- [x] **A.3.1** — En `frontend/package.json:scripts` agregar `"test:e2e": "playwright test"`

## A.4 — Quarantine `comment-flow.e2e.ts`

- [x] **A.4.1** — Wrap ambos tests con `test.skip()` y agregar comment `// TODO(sc-208): blocked on incident-detail / comment composer UI (separate feature). Re-enable when the comment component lands.`
- [x] **A.4.2** — `import { test, expect } from '@playwright/test'` mantiene — el file compila aunque los tests estén skipped

## A.5 — Hard-fail en `ci.yml`

- [x] **A.5.1** — Remover `|| echo "::warning::Playwright suite failed (backend may not be reachable)"` (line 433) del job `frontend-e2e`. El job ahora propaga el exit code real.

## A.6 — Verificación

- [x] **A.6.1** — `pnpm test:e2e` corre localmente (sin seed real sólo podemos verificar que el test se carga y los selectors no son ambiguos — el full path requiere backend seedeado). Verificado vía `npx playwright test --list`: 4 tests en 3 files, cero ambigüedad, cero error "No tests found" (bloqueado hasta A.7 abajo).
- [ ] **A.6.2** — `comment-flow.e2e.ts` aparece como skipped en el output, no como failed. **Bloqueado en este entorno**: `pnpm start` / `ng serve` no compila — errores TS preexistentes en `dashboard.component.html`, `profile.component.ts`, `header.html` (`User.avatar`, `AuthService.updateCurrentUser` no existen todavía; trabajo concurrente de otra sesión, probablemente SC-209). No es causado por SC-208. `--list` confirma que `comment-flow.e2e.ts` es discoverable; falta correrlo end-to-end contra un dev server que compile.
- [ ] **A.6.3** — CI job `frontend-e2e` falla cuando un spec falla (verificable después del primer push)

## A.7 — CRITICAL fix (de verify-report #599): `playwright.config.ts` no discovería ningún test

- [x] **A.7.1** — Agregar `testMatch: '**/*.e2e.ts'` a `playwright.config.ts` (Playwright default sólo matchea `*.spec.ts`/`*.test.ts`; todos los E2E specs del repo usan sufijo `.e2e.ts`). Sin esto `npx playwright test --list` reportaba "Total: 0 tests in 0 files" y el job CI `frontend-e2e` (hard-fail desde A.5) fallaba siempre, sin importar el código. Verificado: ahora lista 4 tests en 3 files (`auth-flow.e2e.ts`, `comment-flow.e2e.ts`, `accept-invitation.e2e.ts`).

## A.8 — CRITICAL fix (de verify-report #599): logout es un no-op en producción

- [x] **A.8.1** — `frontend/src/app/layout/header/header.ts:34-37` — `logout()` llamaba `this.authService.logout()` sin `.subscribe()` (el Observable de HttpClient nunca se ejecuta sin subscriber → cero request HTTP, cero limpieza de estado). Se agregó `.subscribe({ next, error })` con `router.navigate(['/login'])` en ambos casos.
- [x] **A.8.2** — `frontend/src/app/core/services/auth.service.ts:101-115` (`AuthService.logout()`) — no tenía ningún `router.navigate`. Se agregó `this.router.navigate(['/login'])` dentro del `tap()` (éxito) y del `catchError()` (fallo del backend, la sesión local se limpia igual).
- [x] **A.8.3** — Test unitario nuevo en `header.spec.ts`: `logout() subscribes to AuthService.logout() and navigates to /login` — confirma `authService.logout` invocado y `router.navigate(['/login'])` llamado.

## A.9 — WARNING fix (de verify-report #599): `header.spec.ts` / `main-layout.spec.ts` crasheaban bajo Jest

- [x] **A.9.1** — Ambos archivos importaban `{ vi } from 'vitest'` pero el runner del proyecto es Jest (`package.json:test` → `jest`). Reemplazado `vi.fn()` → `jest.fn()` (global de Jest, sin import) en los dos archivos.
- [x] **A.9.2** — Confirmado: `pnpm test -- --testPathPatterns="header|main-layout"` — 0 fallos, ambos suites cargan y corren (antes: 2 test suites fallaban a nivel de import, 0 tests ejecutados).

---

## Notas para Implementer

1. **Verificación de líneas**: las del proposal son del 1st pass. El 2nd pass
   refactoreó `auth.service.ts`; el bug equivalente vive en el catchError
   del `refresh()` (línea ~92), no en `logout()`. Misma fix, distinto method.
2. **No agregar tests nuevos** — el alcance es mecánico, sólo correcciones.
3. **Hard-fail tiene riesgo**: si el backend no es reachable en CI, el
   job va a ser rojo. El proposal asume seed en staging; documentar
   en apply-progress si la primera corrida sale roja por infra, no
   por código.
