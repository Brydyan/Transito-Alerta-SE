# Tasks: E2E — Usuario de pruebas y credenciales reales

> **Strict TDD activo.** Test primero, ver fallar, implementar.
> Backend desde `backend/`; frontend desde `frontend/`.
> **Typecheck: `npx tsc -b tsconfig.json --noEmit`**, con `-b`. Con `-p` compila cero
> archivos y sale 0 siempre.

---

## A · Usuario de pruebas en el seed

- [ ] **A.1** — `database/seeds/users.js`: añadir `e2e@tase.local` con rol
  `operador_org` y la organización por defecto, **condicionado a que `E2E_PASSWORD`
  exista**. Sin ella, no se siembra.
- [ ] **A.2** — **No crear un `DEFAULT_E2E_PASSWORD`.** El `DEFAULT_SEED_PASSWORD` que ya
  existe es una constante en claro del repo, y staging está publicado a internet por el
  Funnel: una cuenta `operador_org` con contraseña pública es una cuenta regalada.
- [ ] **A.3** — El usuario e2e usa `E2E_PASSWORD`, **no** `SEED_PASSWORD`. Son ciclos de
  vida distintos: la del humano se rota a mano, la de la máquina vive en un secret.
- [ ] **A.4** — Specs de seed: sembrado, sin contraseña no se siembra, sin valor por
  defecto, idempotente, no es master, los seis de demo intactos.
- [ ] **A.5** — El spec «sin valor por defecto» se verifica sobre el **código fuente**,
  no sobre el comportamiento: que no exista la constante. Un test de comportamiento no
  distingue «no hay default» de «el default no se usó en este camino».

## B · Credenciales en los specs

- [ ] **B.1** — Helper compartido en `frontend/e2e/` que resuelve `E2E_USER`
  (por defecto `e2e@tase.local`) y `E2E_PASSWORD`.
- [ ] **B.2** — El helper implementa D4: sin `BASE_URL` → salta con motivo; con
  `BASE_URL` y sin `E2E_PASSWORD` → **falla** nombrando la variable ausente.
- [ ] **B.3** — `auth-flow.e2e.ts`: sustituir `admin@correo.com` / `123456`
  (líneas 69-70) por el helper. Actualizar el docblock, que hoy documenta como requisito
  un seed que no existe.
- [ ] **B.4** — `comment-flow.e2e.ts` y `menu-navigation.e2e.ts`: mismo helper. Retirar
  los `test.skip` a mano que quedaron de cuando no había backend.
- [ ] **B.5** — `accept-invitation.e2e.ts` no hace login: dejarlo como está.
- [ ] **B.6** — Specs: sin literales en `frontend/e2e/`, login con las del entorno,
  correo por defecto.
- [ ] **B.7** — Specs de D4: sin entorno se salta, configuración incompleta falla, no se
  salta por falta de secret, configuración completa ejecuta de verdad.
- [ ] **B.8** — Ajustar el aserto de rol: el usuario e2e es `operador_org`, así que ve un
  **subconjunto** del menú. `menu-navigation.e2e.ts` ya tiene un caso para eso
  (`F1.6.2`); comprobar que sigue siendo coherente con el usuario nuevo.

## C · CI y despliegue

- [ ] **C.1** — Secret `E2E_PASSWORD` consumido por el job `frontend-e2e` de `ci.yml`.
- [ ] **C.2** — Caché de `~/.cache/ms-playwright` con clave
  `playwright-${{ runner.os }}-${{ hashFiles('frontend/pnpm-lock.yaml') }}`. Mantener
  `--with-deps`: los paquetes de sistema no los cubre la caché y reinstalarlos es barato
  comparado con el navegador.
- [ ] **C.3** — El paso `Seed users` de `deploy-staging.yml` pasa también `E2E_PASSWORD`.
  Ojo: ese paso sólo corre con la tabla `users` vacía, así que **sembrar el usuario e2e en
  un staging ya poblado requiere una corrida manual**. Documentarlo en el propio workflow.
- [ ] **C.4** — Specs de CI: caché declarada, acierto de caché, invalidación por lockfile.
- [ ] **C.5** — Verificar la config acotada que ya entró en `efe021f`: `globalTimeout`,
  `maxFailures`, un worker. Specs de «la corrida está acotada».

## D · Verificación de extremo a extremo

- [ ] **D.1** — Con `BASE_URL` y `E2E_PASSWORD` reales, los 6 tests corren y su resultado
  **no** es «skipped». Es la única prueba de que esta fase cumplió: el objetivo no era que
  el job dejara de fallar, sino que empezara a probar.
- [ ] **D.2** — Confirmar que el job tarda menos que antes con la caché activa, y anotar
  el número en `apply-progress.md`.

---

## Qué NO hacer

- No añadir escenarios e2e nuevos: esta fase hace que los existentes **puedan** pasar
- No poner una contraseña de prueba en el repo, ni como valor por defecto
- No usar `master` para el e2e (D1)
- No paralelizar: staging es compartido (D6)
- No tocar los asertos de `accept-invitation.e2e.ts`

## Deuda que esta fase deja anotada

Los specs crean comentarios contra staging compartido y **nada los limpia**. Crece con
cada corrida. Fuera de alcance; necesita dueño.
