# Verify Report — E2E: Usuario de pruebas y credenciales reales

> Verificación independiente (no Minimax). Change `2026-09-03-e2e-test-user-and-credentials`.
> Fecha: 2026-09-07. Rama: `brydyan/sc-328/e2e-usuario-de-pruebas-y-credenciales-reales` (sin commitear).

---

## Veredicto

| Punto | Veredicto |
|---|---|
| D1 — e2e es `operador_org`, no `master` | **HELD** — `E2E_USER.role = 'operador_org'` en `database/seeds/users.js`, confirmado por test T8. |
| D3 — sin contraseña por defecto | **HELD** — no existe `DEFAULT_E2E_PASSWORD`; `readE2ePassword()` retorna `null` sin `E2E_PASSWORD`. |
| D4 — skip vs fail | **HELD** — verificado con ejecución real en los 3 modos (ver abajo). Con matiz: el "fail" aborta la colección completa de Playwright, no sólo los specs de login (ver WARNING). |
| Cobertura del helper | **HELD** — los 5 specs de login importan y usan el helper; sin literales de email/password. |
| Honestidad de los specs nuevos | **HELD** — `credentials-policy.e2e.ts` y `ci-policy.e2e.ts` hacen aserciones reales (regex sobre contenido de archivo, manipulación de env + valores devueltos), no checks vacíos. |
| Seed test (6 escenarios) | **HELD (estático)** — cubre los 6 escenarios de `spec.md`. **No ejecutado** en este entorno (sin runtime de contenedores; ver Gate #1 abajo). |
| Integración CI | **REFUTADO parcialmente** — `ci.yml` está correcto (secret + caché). `deploy-staging.yml` tiene un **bug CRÍTICO**: el paso `Verify seeded users` lee `$E2E_PASSWORD` sin declararlo en su propio `env:`, así que siempre lo ve vacío. |
| Gates ejecutados | Ver tabla de "Build & Tests Execution". Todos los números coinciden con lo declarado en `apply-progress.md`, excepto el seed test de backend (no ejecutable acá). |
| Contrato conductual de D4 | **HELD** — confirmado con `npx playwright test` real en los 3 modos, números exactos abajo. |

---

## Completeness

| Métrica | Valor |
|---|---|
| Tasks totales | 21 |
| Tasks completas `[x]` | 21 |
| Tasks incompletas `[ ]` | 0 |

Las dos únicas tareas marcadas pero con nota de bloqueo por entorno son D.1 y D.2 (verificación contra staging real y medición de la caché) — documentado honestamente en `apply-progress.md` como pendiente de la primera corrida post-merge, no ocultado.

---

## Build & Tests Execution (ejecución real, no confiada de `apply-progress.md`)

### Backend

**`npm test`** (unit, `src/` + `test/unit/`):
```
Test Suites: 111 passed, 111 total
Tests:       1024 passed, 1024 total
Time:        28.834 s
```
✅ Verde. **Nota**: este comando NO incluye el nuevo test de seed — `testRegex` de `package.json` sólo matchea `*.spec.ts`, y `t8-e2e-user-seed.e2e-spec.ts` vive bajo `test/e2e/` con extensión `.e2e-spec.ts`, que sólo corre con `test:e2e` (config separada, `test/jest-e2e.json`).

**`npm run test:e2e -- --testPathPattern='t8-e2e-user-seed'`**: ❌ **No ejecutable en este entorno** — `MigrationHarness` requiere un runtime de contenedores (testcontainers + `postgis/postgis:16-3.4`), y `docker ps` falla en esta sandbox ("Could not find a working container runtime strategy"). Verificación de este gate quedó **estática únicamente** (lectura de código, ver sección Correctness). Los 6 `it()` cubren exactamente los 6 escenarios de `specs/e2e-authentication/spec.md` (Sembrado, Sin contraseña, Sin valor por defecto, Idempotente, No es master, Los seis intactos) y las aserciones son correctas por inspección.

### Frontend

**`pnpm test`** (Jest, `ts-jest`):
```
Test Suites: 60 passed, 60 total
Tests:       419 passed, 419 total
Time:        6.583 s
```
✅ Verde. Coincide exactamente con lo declarado en `apply-progress.md`.

**`pnpm run build`** (`ng build`): ✅ Verde. Bundle generado sin errores (5.281s).

**`npx playwright test`** — ejecutado en los 3 modos del contrato de D4:

| Modo | Comando | Resultado real |
|---|---|---|
| 1. Sin `BASE_URL`, sin `E2E_PASSWORD` | `npx playwright test` | **16 passed, 13 skipped** (exit 0). Coincide con lo declarado. |
| 2. `BASE_URL` sin `E2E_PASSWORD` | `BASE_URL=https://staging.tase.ec npx playwright test` | **Exit 1**. El proceso aborta durante la carga de specs (`auth-flow`, `catalogs-crud`, `catalogs-permissions`, `comment-flow`, `menu-navigation` tiran `Error: E2E_PASSWORD no está definida...` al invocar el helper a nivel de módulo). **No se generó ningún resultado de test** (ni pass, ni fail, ni skip) — Playwright no llega a "Running N tests": falla en la fase de collect. Nombra la variable faltante (`E2E_PASSWORD`) en el mensaje, tal como exige el escenario "Configuración incompleta" del spec. |
| 3. `BASE_URL` + `E2E_PASSWORD` (dummy) | `BASE_URL=https://staging.tase.ec E2E_PASSWORD=dummy-e2e-password npx playwright test` | **16 passed, 10 failed, 3 skipped** (exit 1). Los 10 fallos son reales — `net::ERR_NAME_NOT_RESOLVED` contra un dominio dummy — no placeholders ni skips disfrazados. Los 3 skips son `accept-invitation` (x2, no hace login) + `comment-flow` F2.1 (skip explícito por feature no implementada, documentado, no relacionado a credenciales). |

**Coverage**: no configurado (`--coverage` no forma parte del flujo del proyecto para e2e); no aplica.

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Resultado |
|---|---|---|---|
| Existe un usuario de pruebas dedicado | Sembrado | `t8-e2e-user-seed.e2e-spec.ts > Sembrado` | ⚠️ COMPLIANT (estático) — no ejecutado en este entorno |
| Existe un usuario de pruebas dedicado | Sin contraseña no se siembra | `t8-e2e-user-seed.e2e-spec.ts > Sin contraseña no se siembra` | ⚠️ COMPLIANT (estático) |
| Existe un usuario de pruebas dedicado | Sin valor por defecto | `t8-e2e-user-seed.e2e-spec.ts > Sin valor por defecto` | ⚠️ COMPLIANT (estático) |
| Existe un usuario de pruebas dedicado | Idempotente | `t8-e2e-user-seed.e2e-spec.ts > Idempotente` | ⚠️ COMPLIANT (estático) |
| Existe un usuario de pruebas dedicado | No es master | `t8-e2e-user-seed.e2e-spec.ts > No es master` | ⚠️ COMPLIANT (estático) |
| Existe un usuario de pruebas dedicado | Los seis de demo intactos | `t8-e2e-user-seed.e2e-spec.ts > Los seis de demo intactos` | ⚠️ COMPLIANT (estático) |
| Los specs toman credenciales del entorno | Sin literales | `credentials-policy.e2e.ts > Sin literales` | ✅ COMPLIANT (ejecutado, pasó) |
| Los specs toman credenciales del entorno | Login con las del entorno | `credentials-policy.e2e.ts > Login con las del entorno` | ✅ COMPLIANT (ejecutado, pasó) |
| Los specs toman credenciales del entorno | Correo por defecto | `credentials-policy.e2e.ts > Correo por defecto` | ✅ COMPLIANT (ejecutado, pasó) |
| «No configurado» se salta; «roto» falla | Sin entorno | `credentials-policy.e2e.ts > Sin entorno` + modo 1 real | ✅ COMPLIANT (ejecutado, pasó, y confirmado en corrida real) |
| «No configurado» se salta; «roto» falla | Configuración incompleta | `credentials-policy.e2e.ts > Configuración incompleta` + modo 2 real | ✅ COMPLIANT (ejecutado, pasó, y confirmado en corrida real — nombra `E2E_PASSWORD`) |
| «No configurado» se salta; «roto» falla | No se salta por falta de secret | `credentials-policy.e2e.ts > No se salta...` + modo 2 real | ✅ COMPLIANT |
| «No configurado» se salta; «roto» falla | Configuración completa | `credentials-policy.e2e.ts > Configuración completa` + modo 3 real | ✅ COMPLIANT |
| Login e2e funciona contra backend real | Login correcto / inválido / alcance | (ninguno — requiere staging real) | ➖ NO VERIFICABLE en este entorno; bloqueado y anotado por el propio apply-progress como D.1 |
| CI cachea navegadores Playwright | Caché declarada / acierto / invalidación | `ci-policy.e2e.ts` (3 tests) | ✅ COMPLIANT (ejecutado, pasó) |
| La corrida está acotada | Techo global / corte temprano / en serie | `ci-policy.e2e.ts` (3 tests) | ✅ COMPLIANT (ejecutado, pasó) |

**Resumen**: 16/16 escenarios verificables sin staging están COMPLIANT y ejecutados; 6/6 del seed están COMPLIANT sólo estáticamente (bloqueo de entorno, no defecto de la fase); 3 escenarios de "login e2e real" son legítimamente no verificables sin staging.

---

## Correctness (evidencia estructural)

| Requirement | Estado | Nota |
|---|---|---|
| Usuario e2e con rol `operador_org` | ✅ Implementado | `database/seeds/users.js:57-62` |
| Sin `DEFAULT_E2E_PASSWORD` | ✅ Implementado | Grep confirma ausencia; test T8 lo protege sobre código fuente |
| Helper D4 (skip/fail/run) | ✅ Implementado | `frontend/e2e/_helpers/e2e-credentials.ts:49-62` |
| Helper usado por los 5 specs de login | ✅ Implementado | Confirmado por grep en los 5 archivos |
| CI: secret `E2E_PASSWORD` en `ci.yml` | ✅ Implementado | `.github/workflows/ci.yml` línea ~538 |
| CI: caché de Playwright | ✅ Implementado | `.github/workflows/ci.yml`, clave correcta |
| Deploy: seed pasa `E2E_PASSWORD` | ✅ Implementado | Paso "Seed users" |
| Deploy: verificación del seed distingue demo/e2e | ❌ **Roto** | Paso "Verify seeded users" lee `$E2E_PASSWORD` sin declararlo — ver CRITICAL-1 |

---

## Coherence (Design)

| Decisión | ¿Seguida? | Nota |
|---|---|---|
| D1 — `operador_org`, no `master` | ✅ Sí | Con una excepción documentada y razonable: `resolveE2eAdminCredentials()` (default `master@tase.local`) para `catalogs-crud.e2e.ts` y F1.6.1 de `menu-navigation.e2e.ts`, que necesitan probar el camino "sí tiene permiso". No contradice D1 — D1 habla del usuario *por defecto* de la suite, y el caso admin está anotado con el motivo. |
| D2 — usuario dedicado | ✅ Sí | `e2e@tase.local`, no reutiliza los seis. |
| D3 — sin contraseña en el repo | ✅ Sí | |
| D4 — skip vs fail | ✅ Sí, con matiz | Ver WARNING-1: el "fail" es un abort de colección completo, no un fallo por-test. El resultado agregado (`exit 1`, sin skip) igual satisface la letra del spec. |
| D5 — caché de Playwright | ✅ Sí | Clave atada al lockfile, no a versión hardcodeada. |
| D6 — `workers: 1` | ✅ Sí | Confirmado en `playwright.config.ts` y protegido por `ci-policy.e2e.ts`. |

---

## Issues Found

### CRITICAL (deben resolverse antes de archivar)

**CRITICAL-1 — `deploy-staging.yml`: el paso "Verify seeded users" siempre falla cuando `E2E_PASSWORD` SÍ está configurado.**

El paso "Seed users" (línea ~287) declara `E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}` en su propio `env:`. El paso siguiente, "Verify seeded users" (línea 352), **no** declara ningún `env:` propio, y no hay `env:` a nivel de job. En GitHub Actions las variables de `env:` de un paso NO persisten al paso siguiente — cada `run:` es un proceso de shell nuevo. Resultado: dentro de "Verify seeded users", `$E2E_PASSWORD` es **siempre** la cadena vacía, sin importar si el secret está configurado.

Efecto concreto, línea 376-383:
```bash
if [ -z "$E2E_PASSWORD" ] && [ "$e2e_count" != "0" ]; then
  echo "::error::E2E_PASSWORD ausente pero e2e@tase.local existe (count=${e2e_count})"
  exit 1
fi
```
Cuando el secret SÍ está configurado, el paso "Seed users" siembra correctamente al usuario e2e (`e2e_count=1`), pero "Verify seeded users" ve `$E2E_PASSWORD` vacío por el bug de scope, entra en la rama de arriba (`-z` es verdadero, `e2e_count=1 != 0`) y **falla con un mensaje falso**: "E2E_PASSWORD ausente pero e2e@tase.local existe". Es decir: el escenario exacto que D3/D4 declaran como el caso de éxito ("con el secret configurado, se siembra") hace que el deploy a staging **falle** en el primer bootstrap con el secret puesto.

El caso sin secret "funciona" por accidente: `$E2E_PASSWORD` vacío + `e2e_count=0` no dispara ninguna de las dos condiciones.

**Fix**: declarar `E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}` también en el `env:` del paso "Verify seeded users" (o subirlo a nivel de job, ya que ambos pasos lo necesitan).

**Impacto**: bloquea el primer bootstrap de staging con `E2E_PASSWORD` configurado — justo la corrida que D.1/D.2 necesitan para desbloquearse. Si nadie lo agarra antes del primer merge post-secret, el job de deploy se rompe en producción (self-hosted runner, rama `develop`).

### WARNING (deberían resolverse)

**WARNING-1 — El "fail ruidoso" de D4 aborta la colección completa de Playwright, no falla test-por-test.**

Con `BASE_URL` presente y `E2E_PASSWORD` ausente, los 5 specs de login llaman al helper a nivel de módulo (`const creds = resolveE2eCredentials()`), fuera de cualquier `test()`. El `throw` ocurre durante la fase de *carga* de los archivos de spec, no durante la ejecución de un test. Confirmado con ejecución real: el proceso de Playwright termina con `exit 1` **sin llegar a imprimir "Running N tests"** — no se genera NINGÚN resultado (ni pass, ni fail, ni skip) para NINGÚN spec de la suite, incluyendo los que no dependen de credenciales (`incident-flow.e2e.ts`, `accept-invitation.e2e.ts`, `ci-policy.e2e.ts`, `credentials-policy.e2e.ts`).

Esto satisface la letra del requisito ("la suite falla", "el resultado no es skipped" — cierto, no hay reporte de skip porque no hay reporte de nada), pero es más drástico de lo que el nombre "falla ruidosamente" sugiere: en CI, esto significa que el step `Run Playwright tests` de `ci.yml` fallará sin generar el reporte HTML de Playwright (el `Upload Playwright report` del paso siguiente puede no tener nada útil que subir, o fallar también). No es un defecto de comportamiento — technically cumple D4 — pero reduce la observabilidad exactamente en el caso que más importa diagnosticar (secret mal configurado). Sugerencia: mover la resolución de credenciales a un `test.beforeAll` en vez de top-level de módulo, para que el error se reporte por-describe con contexto, o documentar explícitamente esta consecuencia en el design.

**WARNING-2 — Acceso a `.reason` en la variante `skip: false` del tipo `E2eCreds` es un error de TypeScript real, no detectado por ningún gate de CI.**

En `auth-flow.e2e.ts:40`, `catalogs-crud.e2e.ts:28`, `catalogs-permissions.e2e.ts:27`, `comment-flow.e2e.ts:33`, `menu-navigation.e2e.ts:92,125` se llama `test.skip(creds.skip, creds.reason)` con `creds` tipado como la unión discriminada `E2eCreds`. `.reason` sólo existe en la rama `{ skip: true; reason: string }`; en la rama `{ skip: false; user; password }` no existe. Verificado ejecutando `tsc --strict` directamente sobre el archivo:
```
e2e/auth-flow.e2e.ts(40,31): error TS2339: Property 'reason' does not exist on type 'E2eCreds'.
```
No rompe en runtime (Playwright transpila con esbuild, que no type-checka; el valor es simplemente `undefined` y se ignora porque el primer argumento de `test.skip` ya es `false`), pero es una laguna real de tipos.

Más de fondo: **ningún gate de CI type-checkea `frontend/e2e/`**. `frontend/tsconfig.json` no referencia el directorio `e2e/` (sólo `tsconfig.app.json` y `tsconfig.spec.json`), `pnpm test` (ts-jest) sólo compila `*.spec.ts`, y `pnpm run build` (`ng build`) sólo compila `src/`. Este directorio queda fuera de todo typecheck de CI — este error habría pasado desapercibido indefinidamente. No es una regresión introducida por esta fase (la falta de cobertura de tipos sobre `e2e/` es preexistente), pero esta fase es la que introdujo el primer error real que la expone.

**Fix sugerido**: usar el patrón de narrowing correcto, p.ej. `test.skip(creds.skip, creds.skip ? creds.reason : '')`, y considerar agregar `frontend/e2e/tsconfig.json` con su propio `tsc --noEmit` en CI.

### SUGGESTION (mejoras, no bloqueantes)

**SUGGESTION-1** — La deuda anotada sobre limpieza de comentarios e2e contra staging compartido (Q1 de `apply-progress.md`) sigue sin dueño formal más allá de la mención a `front/2026-09-03-tool-ci-gates`. Vale la pena confirmar que esa fase hermana efectivamente la tomó, o crear el ticket explícito.

**SUGGESTION-2** — Los errores de `tsc -b` preexistentes en `auth.service.spec.ts`, `placeholder.component.spec.ts` y `layout-tokens.regression.spec.ts` (mencionados en `apply-progress.md`, confirmados fuera de scope de esta fase) siguen sin ticket de seguimiento. No bloquean esta fase, pero acumulan.

---

## Verdict

**PASS WITH WARNINGS** — con un hallazgo CRITICAL que debe resolverse antes de dar por cerrada la integración de CI/CD, aunque no invalida el trabajo central de la fase (D1, D3, D4 y el helper están sólidamente implementados y verificados con ejecución real).

El núcleo de la fase — el contrato de comportamiento D4, que es la innovación central del change — está **verificado con evidencia de ejecución real** en los tres modos y se comporta como el diseño exige. El bug encontrado (CRITICAL-1) está en la periferia (el script de verificación post-seed de `deploy-staging.yml`, no en el helper ni en el seeder ni en los specs), pero es real y bloqueará el primer despliegue a staging con el secret configurado — que es precisamente la corrida que `apply-progress.md` marca como pendiente para cerrar D.1 y D.2. Recomendado: resolver CRITICAL-1 antes de mergear, o al menos antes de configurar `secrets.E2E_PASSWORD` en el entorno `staging` de GitHub.
