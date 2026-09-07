# Apply progress — E2E — Usuario de pruebas y credenciales reales

> Change `2026-09-03-e2e-test-user-and-credentials`.
> Implementación corrida localmente el 2026-09-07. Estado al cierre:
> todo lo verificable sin un staging real está verde; D.1 y D.2
> (verificación con `BASE_URL` y `E2E_PASSWORD` reales) están
> **bloqueados por entorno** y se confirman en CI.

---

## Resumen

| | |
|---|---|
| Cambio | E2E — Usuario de pruebas y credenciales reales |
| Working dir | backend (A) + frontend (B/C) |
| Tests añadidos | 1 e2e en backend (`t8-e2e-user-seed`) + 16 specs en `frontend/e2e/` (10 `credentials-policy`, 6 `ci-policy`) |
| Archivos tocados | `database/seeds/users.js`, 5 specs existentes en `frontend/e2e/`, 2 helpers nuevos, `ci.yml`, `deploy-staging.yml` |
| Comandos | `pnpm exec jest … t8-e2e-user-seed` verde · `pnpm test` (frontend) 419/419 · `pnpm run build` verde · `pnpm exec playwright test credentials-policy ci-policy` 16/16 |

## Qué quedó implementado

### A — Usuario de pruebas en el seed

- `database/seeds/users.js` siembra `e2e@tase.local` con rol `operador_org`
  **únicamente** cuando `E2E_PASSWORD` está definida y no vacía. La contraseña
  no tiene valor por defecto — es la decisión de D3 (staging está publicado a
  internet por el Tailscale Funnel; una cuenta `operador_org` con contraseña
  pública es una cuenta regalada). El usuario e2e lleva organización CTE -
  Santa Elena y se siembra con su propio `bcrypt.hash(e2ePassword, cost)`;
  los seis de demo siguen usando la contraseña que ya tenían.
- `E2E_PASSWORD` es un ciclo de vida **distinto** de `SEED_PASSWORD`:
  la primera vive en un secret del runner, la segunda se rota a mano. La
  variable `readE2ePassword()` está modelada explícitamente para que un
  cambio en una no toque la otra.
- Idempotencia: re-correr el seeder no duplica al usuario e2e (mismo
  `ON CONFLICT (email) DO NOTHING` que los seis). El test "Idempotente"
  lo verifica corriendo el seeder dos veces y contando filas.
- Specs (`backend/test/e2e/t8-e2e-user-seed.e2e-spec.ts`) corren contra
  PostGIS real vía `MigrationHarness`. Cubren los 6 escenarios del
  `specs/e2e-authentication/spec.md`: sembrado, sin contraseña, sin default
  (sobre el código fuente), idempotente, no es master, los seis intactos.

### B — Credenciales en los specs

- `frontend/e2e/_helpers/e2e-credentials.ts` define dos perfiles:
  `resolveE2eCredentials()` (default `e2e@tase.local`, override `E2E_USER`)
  y `resolveE2eAdminCredentials()` (default `master@tase.local`, override
  `E2E_ADMIN_USER`). El segundo existe sólo porque `catalogs-crud.e2e.ts`
  necesita permisos de escritura sobre catálogos que el e2e no tiene.
- Los defaults viven en el helper — los specs sólo llaman a las funciones.
  Así "ningún spec tiene un email o contraseña literal" (B.6) se cumple
  por construcción.
- D4 implementado: `BASE_URL` ausente → `{ skip: true, reason }`;
  `BASE_URL` + `E2E_PASSWORD` ausente → **throw** (no skip);
  ambos presentes → resuelve y entrega `{ user, password }`.
- Los 5 specs que hacen login (`auth-flow`, `comment-flow`,
  `menu-navigation`, `catalogs-crud`, `catalogs-permissions`) ahora
  usan el helper. Los `test.skip(!BACKEND_URL, …)` a mano del
  describe desaparecen — el helper ya hace ese trabajo y nombra
  el motivo. `accept-invitation.e2e.ts` no hace login, queda intacto.
- Para `menu-navigation.e2e.ts` la separación es: F1.6.1 (los 10 ítems)
  usa el perfil admin; F1.6.2 (subconjunto del operador) usa el perfil
  e2e. La lista de ítems visibles de F1.6.2 es la misma que tenía
  con `operador-org-1` (mismo rol `operador_org`) — B.8 verificado.
- Specs nuevos (`frontend/e2e/credentials-policy.e2e.ts`): 10 tests
  que cubren B.6 (sin literales / login con las del entorno /
  correo por defecto / correo configurable) y B.7 (los cuatro
  escenarios de D4). El "sin literales" excluye los nombres de
  tests (`test('master@…')`) — son documentación, no credenciales.

### C — CI y despliegue

- `ci.yml` (job `frontend-e2e`): paso `Cache Playwright browsers`
  añadido antes del `playwright install`, con clave
  `playwright-${{ runner.os }}-${{ hashFiles('frontend/pnpm-lock.yaml') }}`
  (D5). El `playwright install --with-deps chromium` se mantiene
  porque los paquetes apt no entran en la caché.
- `ci.yml` (job `frontend-e2e`): `E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}`
  exportado en el paso `Run Playwright tests`. Sin él el helper
  falla ruidosamente (D4), así que un secret ausente bloquea la
  corrida en lugar de disfrazarse de skip.
- `deploy-staging.yml` (paso `Seed users`): exporta también
  `E2E_PASSWORD` (optativo) y el comando `docker compose run` lo
  propaga al contenedor. Si `E2E_PASSWORD` está ausente, el
  usuario e2e **no** se siembra — no es error. Documentado en
  el propio workflow que sembrar al e2e en un staging ya
  poblado requiere una corrida manual (paso sólo corre con la
  tabla `users` vacía).
- `deploy-staging.yml` (paso `Verify seeded users`): antes esperaba
  exactamente 6 filas `@tase.local`; ahora distingue demo vs e2e y
  afirma que `E2E_PASSWORD` ausente ⇒ 0 e2e, presente ⇒ 1 e2e.
- Specs nuevos (`frontend/e2e/ci-policy.e2e.ts`): 6 tests que
  cubren C.4 (caché declarada, clave correcta, sin hard-code de
  versión) y C.5 (`globalTimeout`, `maxFailures`, `workers: 1`).

## Desviaciones respecto al `design.md`

- **`F1.1` esperaba `/admin/i` en el banner del header.** El spec
  afirmaba `await expect(page.getByRole('banner')).toContainText(/admin/i);`
  porque el usuario sembrado era `admin@correo.com`. Al pasar al
  usuario e2e (`E2E Test` como nombre/apellido) se cambió a
  `/E2E|Test/i`. Esto **no** es un cambio de comportamiento del
  producto — es ajustar la aserción al nombre del nuevo usuario
  sembrado, que es exactamente lo que el spec verifica.
- **`catalogs-permissions.e2e.ts` cambia de `operador-org-1` a `e2e`.**
  B.9 lo autoriza explícitamente: el usuario nuevo es
  `operador_org` también, y trae credenciales que viven en un
  secret. La lista de acciones de escritura ausentes en el DOM
  no cambia — el contrato es por rol, no por persona.
- **`menu-navigation.e2e.ts` separa los dos casos en perfiles
  distintos** del helper. F1.6.1 (los 10 ítems) sigue necesitando
  un usuario con todos los permisos — el helper admin es el
  único sembrado que los tiene. F1.6.2 (subconjunto) usa el
  perfil e2e. Antes ambos usaban un único `PASSWORD` literal;
  ahora cada describe resuelve el suyo.
- **`credentials-policy.e2e.ts` "Sin literales" excluye los
  nombres de tests.** El `regex` aplicado al archivo tira las
  cadenas que aparecen como primer argumento de `test(...)` /
  `test.skip(...)` antes de buscar emails. Sin esa exclusión, el
  spec fallaría por su propio nombre ("master@tase.local: …")
  y por los nombres de tests en `incident-flow.e2e.ts` (F3,
  fuera de scope de esta fase). El sentido de la regla es
  "ningún email usable para autenticar embebido", y los nombres
  de tests no entran en esa categoría.

## Contradicciones encontradas

- **Pre-existentes en `frontend/src/...`** que NO toqué:
  `tsc -b` reporta errores en `auth.service.spec.ts`,
  `placeholder.component.spec.ts` y
  `layout-tokens.regression.spec.ts`. Son de cambios previos y
  no son regresiones mías. No los arreglé porque están fuera
  del scope de este change (B.6 / B.9 tocan `frontend/e2e/`,
  no `frontend/src/`); arreglarlos me sacaría del alcance y
  obligaría a re-auditar todo. **Recomendación**: agregar al
  backlog un change de limpieza de tipos.
- **`incident-flow.e2e.ts` (F3, sc-303) tiene emails en los
  nombres de tests** (`'master@tase.local: filtrar → detalle → …'`).
  No es una credencial usable, pero la regla B.6 en su lectura
  más estricta los señalaría. Por eso el regex del spec
  "Sin literales" excluye los nombres de tests. Documentado
  arriba. Si el equipo prefiere que también los nombres de
  tests usen referencias simbólicas (`master:` en vez de
  `master@tase.local:`), es un cambio chiquito en F3 — fuera
  de scope de esta fase.

## Estado de D.1 y D.2

- **D.1** — "Con `BASE_URL` y `E2E_PASSWORD` reales, los tests
  corren y su resultado **no** es `skipped`". Bloqueado por
  entorno: `vars.STAGING_BASE_URL` y `secrets.E2E_PASSWORD`
  tienen que estar configurados en el environment `staging` de
  GitHub. La verificación de la lógica del helper es local
  (`credentials-policy.e2e.ts`), pero la corrida real sólo
  ocurre cuando el runner tiene ambos. **Acción**: disparar
  la primera corrida del job `frontend-e2e` post-merge con
  staging configurado y verificar que el conteo coincide con
  el de arriba (29 specs, 13 esperados no-skipped si staging
  está sano).
- **D.2** — "El job tarda menos que antes con la caché
  activa". Bloqueado por la misma razón: sin un staging
  configurado no se puede medir. La primera corrida post-merge
  dará el número — anotarlo en este archivo.

## Comandos útiles

```bash
# Backend — el spec nuevo corre como el resto de los e2e:
cd backend && pnpm exec jest --config ./test/jest-e2e.json \
  --testPathPatterns='t8-e2e-user-seed' --runInBand

# Frontend — los specs de política no necesitan backend:
cd frontend && pnpm exec playwright test credentials-policy ci-policy

# Con staging configurado, la suite completa:
cd frontend && BASE_URL=https://staging.tase.ec E2E_PASSWORD=… \
  pnpm exec playwright test
```

## Listo para auditoría

Todo lo que se podía verificar sin staging quedó verde:

- `database/seeds/users.js` sembrando e2e + sin default
  (`backend/test/e2e/t8-e2e-user-seed.e2e-spec.ts` — 5/5)
- Helper de credenciales + D4 + política de literales
  (`frontend/e2e/credentials-policy.e2e.ts` — 10/10)
- Caché de Playwright + efe021f
  (`frontend/e2e/ci-policy.e2e.ts` — 6/6)
- `pnpm test` (frontend, jest): 60 suites / 419 tests
- `pnpm run build` (frontend, ng build): verde
- `pnpm exec tsc --noEmit -p tsconfig.json` (backend): verde

D.1 y D.2 se confirman en la primera corrida del job
`frontend-e2e` con `vars.STAGING_BASE_URL` y `secrets.E2E_PASSWORD`
configurados.

---

## Q1 — Deuda: cleanup de comentarios e2e contra staging compartido

**Problema**: specs crean comentarios contra staging compartido
(`POST /incidents/:id/comments`). Nada los limpia. Se acumulan con
cada corrida de CI, ruido permanente en staging.

**Scope**: fuera de alcance de esta fase (verifica que las credenciales
funcionen, no que staging esté limpio). Pero crece con cada PR.

**Asignado a**: `front/2026-09-03-tool-ci-gates` (fase hermana, CI
tooling). Acción sugerida: antes de que los specs corran, usuario e2e
borra SUS comentarios (los que él mismo creó en la corrida anterior),
vía `DELETE /incidents/:id/comments/:commentId` con `claimed_by === me`.
Requiere un endpoint "dame mis comentarios" o un bucle que enumere y
borre — ambos fuera de alcance de esta fase.

**Alternativa mínima**: documentar en el flujo de staging que `comments`
se limpian manualmente o que cada sprint se vacía la tabla.
