# Tasks: Frontend E2E Tests Quick Fix (Stream 1a)

**Change**: `2026-08-28-sc-208-frontend-e2e-tests-quick-fix`
**Generated**: 2026-08-28 (from `proposal.md` since no design/tasks existed at hand-off)
**Mode**: Mechanical fix — no new abstractions

> Nota: el `proposal.md` cita line numbers del 1st pass de SC-203.
> Después del 2nd pass de SC-203 (2026-08-28) las líneas se
> corrieron. Las "verificaciones" abajo usan las líneas ACTUALES.

---

## A.1 — Corregir selectors y route en `auth-flow.e2e.ts`

- [ ] **A.1.1** — `goto('/auth/login')` → `goto('/login')` (line 29)
- [ ] **A.1.2** — `getByLabel(/email/i)` → `getByLabel(/usuario/i)` (line 30, label real es `Usuario` en `login.component.html:52`)
- [ ] **A.1.3** — `getByLabel(/contraseña|password/i)` → mantener (label real es `Contraseña` — verificar con grep)
- [ ] **A.1.4** — `waitForURL(/\/app\/dashboard/)` ya está correcto (per design.md §"Approach")

## A.2 — Fix producción: `/auth/login` → `/login` en auth.service

- [ ] **A.2.1** — `auth.service.ts:92` (refresh catchError) `router.navigate(['/auth/login'])` → `['/login']`. La propuesta cita la línea 91 del 1st pass (logout); en el 2nd pass el bug sobrevive en el refresh catchError.
- [ ] **A.2.2** — Verificar con `grep -n "auth/login" frontend/src/` que no quede ninguna otra referencia rota

## A.3 — Agregar `test:e2e` script

- [ ] **A.3.1** — En `frontend/package.json:scripts` agregar `"test:e2e": "playwright test"`

## A.4 — Quarantine `comment-flow.e2e.ts`

- [ ] **A.4.1** — Wrap ambos tests con `test.skip()` y agregar comment `// TODO(sc-208): blocked on incident-detail / comment composer UI (separate feature). Re-enable when the comment component lands.`
- [ ] **A.4.2** — `import { test, expect } from '@playwright/test'` mantiene — el file compila aunque los tests estén skipped

## A.5 — Hard-fail en `ci.yml`

- [ ] **A.5.1** — Remover `|| echo "::warning::Playwright suite failed (backend may not be reachable)"` (line 433) del job `frontend-e2e`. El job ahora propaga el exit code real.

## A.6 — Verificación

- [ ] **A.6.1** — `pnpm test:e2e` corre localmente (sin seed real sólo podemos verificar que el test se carga y los selectors no son ambiguos — el full path requiere backend seedeado)
- [ ] **A.6.2** — `comment-flow.e2e.ts` aparece como skipped en el output, no como failed
- [ ] **A.6.3** — CI job `frontend-e2e` falla cuando un spec falla (verificable después del primer push)

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
