# Fixes Required — E2E: Usuario de pruebas y credenciales reales

> Generado por verificación independiente. Ver `verify-report.md` para el detalle completo
> de cada hallazgo (evidencia, comandos ejecutados, salidas reales).

---

## CRITICAL-1 — `deploy-staging.yml`: "Verify seeded users" siempre falla cuando `E2E_PASSWORD` SÍ está configurado

**Archivo**: `.github/workflows/deploy-staging.yml`, paso "Verify seeded users" (línea ~352).

**Problema**: el paso lee `$E2E_PASSWORD` en su script de shell (líneas 376, 380) pero no lo declara
en su propio `env:`. En GitHub Actions, `env:` de un paso no se propaga al siguiente — cada `run:`
es un proceso nuevo. El único `env:` que declara `E2E_PASSWORD` está en el paso anterior ("Seed
users", línea 291), así que en "Verify seeded users" la variable es siempre cadena vacía.

**Efecto**: cuando el secret SÍ está configurado y el usuario e2e SÍ se siembra correctamente
(`e2e_count=1`), el chequeo `[ -z "$E2E_PASSWORD" ] && [ "$e2e_count" != "0" ]` es verdadero
(porque `$E2E_PASSWORD` vacío por el bug de scope) y el paso falla con un mensaje **falso**:
"E2E_PASSWORD ausente pero e2e@tase.local existe". El caso sin secret "funciona" por accidente.

**Fix**:
```yaml
      - name: Verify seeded users
        if: steps.users.outputs.empty == 'true'
        env:
          E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}
        run: |
          ...
```
(o subir `E2E_PASSWORD` a un `env:` de nivel de job, ya que dos pasos consecutivos lo necesitan).

**Por qué bloquea**: rompe el primer bootstrap de staging con el secret puesto — exactamente la
corrida que `apply-progress.md` marca como pendiente para cerrar D.1 y D.2 de `tasks.md`.

---

## WARNING-1 — El "fail ruidoso" de D4 aborta la colección completa de Playwright, no falla test-por-test

**Archivo**: `frontend/e2e/auth-flow.e2e.ts`, `catalogs-crud.e2e.ts`, `catalogs-permissions.e2e.ts`,
`comment-flow.e2e.ts`, `menu-navigation.e2e.ts` — todos llaman al helper a nivel de módulo
(`const creds = resolveE2eCredentials()`), fuera de cualquier `test()`.

**Efecto observado** (ejecución real, `BASE_URL` sin `E2E_PASSWORD`): Playwright aborta durante la
carga de specs, `exit 1`, sin llegar a "Running N tests". No se genera NINGÚN resultado — ni para
los specs de login ni para los que no dependen de credenciales (`incident-flow`,
`accept-invitation`, `ci-policy`, `credentials-policy`).

**No es un defecto de comportamiento** — cumple la letra de D4 ("la suite falla", "no es skipped")
— pero es más drástico de lo que sugiere el nombre, y reduce la observabilidad (posible reporte
HTML vacío) justo en el caso que más importa diagnosticar.

**Sugerencia**: mover la resolución de credenciales a `test.beforeAll` para que el error se
reporte por-describe con contexto, o documentar explícitamente esta consecuencia en `design.md`
(D4) para que no sorprenda a quien lea el reporte de CI.

---

## WARNING-2 — Acceso a `.reason` en la rama `skip: false` de `E2eCreds`: error de TypeScript real, no detectado por ningún gate de CI

**Archivos**: `auth-flow.e2e.ts:40`, `catalogs-crud.e2e.ts:28`, `catalogs-permissions.e2e.ts:27`,
`comment-flow.e2e.ts:33`, `menu-navigation.e2e.ts:92,125`.

**Problema**: `test.skip(creds.skip, creds.reason)` accede a `.reason` sin narrowing; en la rama
`{ skip: false; user; password }` esa propiedad no existe. Confirmado con
`tsc --strict e2e/auth-flow.e2e.ts`:
```
error TS2339: Property 'reason' does not exist on type 'E2eCreds'.
```
No rompe en runtime (Playwright transpila con esbuild sin type-check), pero **ningún gate de CI
type-checkea `frontend/e2e/`**: ni `tsconfig.json` lo referencia, ni `ts-jest` (sólo `*.spec.ts`),
ni `ng build` (sólo `src/`). El error queda invisible indefinidamente.

**Fix sugerido**:
```ts
test.skip(creds.skip, creds.skip ? creds.reason : '');
```
**Fix estructural (opcional, fuera de scope de esta fase pero anotado)**: agregar
`frontend/e2e/tsconfig.json` con su propio `tsc --noEmit` en el job de CI para cubrir el
directorio completo.

---

## Cómo verificar los fixes

1. CRITICAL-1: revisar el diff del `env:` agregado, y (si hay acceso a un runner self-hosted de
   staging) disparar el workflow con `E2E_PASSWORD` configurado y confirmar que "Verify seeded
   users" pasa con `e2e_count=1`.
2. WARNING-1: decisión de diseño, no requiere código si el equipo acepta el comportamiento actual
   — sólo requiere documentarlo.
3. WARNING-2: aplicar el narrowing en los 5 archivos y correr
   `npx tsc --noEmit --strict e2e/*.e2e.ts` (o el tsconfig nuevo si se crea) para confirmar 0 errores.
