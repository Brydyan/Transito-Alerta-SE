# Apply Progress: Frontend E2E Tests Quick Fix (SC-208)

**Change**: `2026-08-28-sc-208-frontend-e2e-tests-quick-fix`
**Status**: READY FOR RE-VERIFY (batch 2 — routes back the 4 CRITICAL findings from verify-report #599)
**Mode**: Standard (no strict-TDD capability record found for this project)

---

## Resumen

Batch 2 responde punto por punto a `verify-report` #599 (FAIL, 4 CRITICAL,
4 WARNING, 4 SUGGESTION). Los 5 fixes mecánicos de batch 1 (A.1-A.5,
selectors/route del e2e, `test:e2e` script, hard-fail en CI, quarantine de
`comment-flow.e2e.ts`) siguen intactos y sin regresión. Este batch cierra:

1. **CRITICAL-4 (nuevo, el más grave)** — `playwright.config.ts` no tenía
   `testMatch`, así que Playwright nunca encontraba ningún archivo `*.e2e.ts`
   (`Total: 0 tests in 0 files`, exit 1 siempre). El job `frontend-e2e` en CI
   (hard-fail desde A.5) iba a quedar rojo para siempre, sin importar el código.
2. **CRITICAL-1 (carried over)** — `logout()` era un no-op real: `header.ts`
   llamaba `this.authService.logout()` sin `.subscribe()` (el Observable de
   HttpClient nunca ejecuta sin subscriber) y `AuthService.logout()` no tenía
   ningún `router.navigate`. Clickear "Cerrar sesión" en el browser no hacía
   nada.
3. **CRITICAL-2 y CRITICAL-3 (carried over)** — apply-progress y tasks vivían
   sólo en disco, nunca se guardaron en Engram (contrato hybrid violado). Este
   documento + el `mem_save`/`mem_update` correspondientes cierran ambos.
4. **WARNING-1 (rápido, incluido)** — `header.spec.ts` y `main-layout.spec.ts`
   importaban `{ vi } from 'vitest'` pero el runner real es Jest → las 2 suites
   crasheaban en el import, 0 tests ejecutados, exactamente donde vive la
   lógica de logout que rompía CRITICAL-1. Reemplazado por `jest.fn()`.

## Cambios (batch 2, este turno)

| Archivo | Cambio |
|---------|--------|
| `frontend/playwright.config.ts` | Agregado `testMatch: '**/*.e2e.ts'` |
| `frontend/src/app/layout/header/header.ts` | `logout()` ahora hace `.subscribe({ next, error })` sobre `authService.logout()`, navega a `/login` en ambos casos |
| `frontend/src/app/core/services/auth.service.ts` | `logout()` — agregado `this.router.navigate(['/login'])` en `tap()` y en `catchError()` |
| `frontend/src/app/layout/header/header.spec.ts` | `vi.fn()` → `jest.fn()`, quitado `import { vi } from 'vitest'`; agregado test `logout() subscribes to AuthService.logout() and navigates to /login` |
| `frontend/src/app/layout/main-layout/main-layout.spec.ts` | `vi.fn()` → `jest.fn()` (2 mocks), quitado `import { vi } from 'vitest'` |

## Cambios heredados de batch 1 (sin tocar, verificados sin regresión)

| Archivo | Cambio |
|---------|--------|
| `frontend/e2e/auth-flow.e2e.ts` | `goto('/auth/login')` → `goto('/login')`, `getByLabel(/email/i)` → `getByLabel(/usuario/i)` |
| `frontend/e2e/comment-flow.e2e.ts` | `test.skip(...)` + TODO citando UI faltante |
| `frontend/package.json` | `"test:e2e": "playwright test"` |
| `.github/workflows/ci.yml` | Soft-fail (`\|\| echo "::warning::..."`) removido del job `frontend-e2e` |

## Verificación realizada (este turno)

- `npx playwright test --list` → **antes**: `Total: 0 tests in 0 files`, exit 1.
  **después**: `Total: 4 tests in 3 files` (`accept-invitation.e2e.ts` x2,
  `auth-flow.e2e.ts` x1, `comment-flow.e2e.ts` x1 — este último es el skip
  quarantined, sigue apareciendo en `--list` porque Playwright lista tests
  skipped también; correrá como `skipped`, no `failed`, per A.4).
- `pnpm test -- --testPathPatterns="auth|header|main-layout"` → 4 suites,
  20 tests, 0 fallos (antes: `header.spec.ts` y `main-layout.spec.ts`
  crasheaban en el import de `vitest`, 0 tests corridos en esos 2 archivos).
- `pnpm test` (suite completa) → **23 suites, 70 tests, 0 fallos** (nota:
  el conteo subió desde el `55 passed` del verify-report anterior porque
  trabajo concurrente de otra sesión — SC-207 accept-invitation — agregó
  specs nuevos en paralelo; no hay ninguna regresión de SC-208 en el diff).
- `git diff` confirma que los 5 archivos tocados en batch 2 son exactamente
  los apuntados por el usuario, sin tocar nada del trabajo concurrente de
  SC-207/SC-209 (auth.model.ts, accept-invitation/*, etc. — no forman parte
  de este change).

## Bloqueado en este entorno (no es un defecto de SC-208)

- **Full end-to-end run de Playwright** (`pnpm run test:e2e` contra el dev
  server real, backend seedeado) no se pudo ejecutar en este sandbox:
  `pnpm start` / `npx ng serve` falla a compilar por errores TS preexistentes
  en `dashboard.component.html`, `profile.component.ts` y `header.html`
  (`Property 'avatar' does not exist on type 'User'`,
  `Property 'updateCurrentUser' does not exist on type 'AuthService'`) —
  esto es trabajo EN VUELO de otra sesión (probablemente SC-209, subida de
  imagen de perfil) sobre el mismo working tree, no algo introducido por
  SC-208. Cuando ese build compile, A.6.2/A.6.3 quedan desbloqueados sin
  ningún cambio adicional de este change.
  También: `pnpm start`/`pnpm install` intenta correr un chequeo de
  supply-chain (`ERR_PNPM_IGNORED_BUILDS`) que requiere red/aprobación
  interactiva, no disponible en este sandbox — otra razón por la que el
  dev server no bootea aquí, independiente del error de compilación arriba.

## Tasks pendientes (2/22, no son código de SC-208)

- **A.6.2** — Confirmar `comment-flow.e2e.ts` como `skipped` en un run real
  (bloqueado por el build error de arriba, ver sección anterior).
- **A.6.3** — Primer push a develop dispara `frontend-e2e`; verificar que
  falla cuando un spec falla (no se puede probar localmente sin CI real).

## Reconciliación Engram (CRITICAL-2 / CRITICAL-3 del verify-report)

- Este archivo se guarda también en Engram bajo
  `sdd/2026-08-28-sc-208-frontend-e2e-tests-quick-fix/apply-progress`
  (antes: 0 resultados en `mem_search`, sólo existía en disco).
- El artefacto `tasks` de Engram (#589, versión vieja Phase 1-5/19 subtasks,
  0/19 checked) queda obsoleto frente a `tasks.md` en disco (A.1-A.9,
  22 subtasks, 20/22 checked) — el disco es la fuente de verdad real
  ejecutada. Se actualiza el tasks de Engram con `mem_update` para
  reflejar la estructura A.1-A.9 real.
- Nota de path: el `tasks`/`spec`/`design` de Engram referencian
  `openspec/changes/2026-08-28-sc-208-...` pero el archivo real vive en
  `openspec/changes/front/2026-08-28-sc-208-...` (prefijo `front/` agregado
  después). Documentado aquí para que la próxima verify/archive no se
  pierda buscando la ruta vieja.

## Riesgos materiales (heredados de la propuesta + nuevos)

- **Hard-fail en CI**: sigue el trade-off aceptado en la propuesta original.
  Con el fix de `testMatch`, el gate ahora es real (antes era un falso-rojo
  permanente). Si el backend de staging no es reachable en el push, el merge
  se bloquea — rollback de una línea restaurando el `|| echo "::warning::"`.
- **`router.navigate(['/login'])` duplicado**: ahora se llama tanto desde
  `header.ts` (subscribe) como desde `AuthService.logout()` (tap/catchError).
  Es idempotente (Angular Router no re-navega a la ruta activa), pero es
  redundancia intencional — el usuario pidió explícitamente ambos puntos de
  fix (header.ts Y AuthService.logout()) por separado. Si se prefiere un solo
  punto de verdad, quitar el `.navigate()` de `header.ts` y dejar sólo el de
  `AuthService.logout()` es un cambio de una línea sin romper nada.

## Archivos NO modificados (fuera de alcance de SC-208)

- `openspec/changes/.../proposal.md` (contrato de propuesta)
- `backend/**`
- Todo lo relacionado a SC-207 (`accept-invitation.e2e.ts`,
  `auth.model.ts`, `features/auth/accept-invitation/`) y SC-209
  (avatar/`updateCurrentUser`) — trabajo concurrente de otras sesiones
  sobre el mismo working tree, no tocado por este apply.

---

**Status: READY FOR RE-VERIFY** — los 4 CRITICAL + el WARNING rápido del
verify-report #599 están resueltos en código y verificados con
`playwright test --list` + suite Jest completa. Sólo quedan 2 tasks de
verificación end-to-end bloqueadas por infra del sandbox (dev server no
compila por trabajo concurrente ajeno a este change), no por código de
SC-208.
