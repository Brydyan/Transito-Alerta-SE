# Fixes Required — REG: Auto-registro del ciudadano (sc-325)

**Estado tras la ronda 7: sigue sin poder archivarse.** Fix 11 (el e2e que no compilaba) se
cerró correctamente — compila, corre, y el total de la suite e2e subió de 437 a 440 como se
pedía. Pero al correr de verdad reveló un defecto real y preexistente: **Fix 12** abajo.
Es la séptima vez que este change marca trabajo hecho sobre una afirmación que no se
sostiene al ejecutarla — esta vez la propia ejecución del fix anterior fue la que lo destapó.

---

## Fix 12 (bloqueante) — D3 violado: el `message` de la respuesta revela si el correo ya existía

**Archivo**: `backend/src/modules/auth/auth.register.ts:156-163` (camino "correo existente")
vs `:230-237` y `:178-185` (camino "correo nuevo" / "rol reporter no encontrado")

### Síntoma

```
$ cd backend && npx jest --config ./test/jest-e2e.json --testPathPattern=registration-flow --verbose
✓ REG.1 ...
✕ REG.2: D3 — POST /auth/register con correo existente devuelve la misma forma y NO crea cuenta duplicada
✓ REG.3 ...

  ● REG.2
    expect(received).toEqual(expected)
    - Expected  - 1
    + Received  + 1
      Object {
    -   "message": "Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.",
    +   "message": "Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta. Si ya lo estaba, te enviamos un aviso al titular.",
      }
```

Suite completa: `Tests: 1 failed, 439 passed, 440 total` (subió de 437 a 440, confirmando
que el archivo SÍ corre; el fallo es real, no de compilación).

### Causa

`AuthRegisterService.register()` devuelve un `publicMessage.message` distinto según el
camino:
- Correo existente (`auth.register.ts:159-162`): incluye la frase adicional "Si ya lo
  estaba, te enviamos un aviso al titular."
- Correo nuevo (`:234-236`) y rol `reporter` no encontrado (`:182-184`): sin esa frase.

Un cliente HTTP puede distinguir ambos casos leyendo `response.body.message` — es
exactamente el oráculo de existencia de cuentas que D3 (`design.md:61-65`) dice haber
rechazado a cambio de no usar 409 Conflict. El requirement de
`specs/citizen-registration/spec.md:46-53` es explícito: "la respuesta es idéntica en código
de estado, **cuerpo** y forma a la del correo nuevo".

### Por qué 6 rondas de verify no lo vieron

`auth.register.spec.ts:155,172` afirma sobre el mensaje con
`.toMatch(/te enviamos un mensaje para verificar tu cuenta/)`. Esa subcadena está presente en
**ambos** mensajes, así que el test pasa sin importar que el resto del string difiera.
`tasks.md` A.8, A.9 y A.11 citan estos mismos tests como evidencia de que D3 está cerrado.
Nada corrió una comparación de igualdad completa hasta que Fix 11 puso en marcha el e2e con
`expect(second.body).toEqual(first.body)`.

**Antigüedad**: presente desde el primer commit de este change (`fa005b8`, ronda 1). No es
una regresión de esta ronda.

### Qué hacer

1. Unificar el `message` de los tres `return` de `AuthRegisterService.register()`
   (`:156-163`, `:178-185`, `:230-237`) a un único string constante — probablemente el que
   ya usan los caminos "nuevo" y "rol no encontrado" ("Si el correo no estaba registrado, te
   enviamos un mensaje para verificar tu cuenta."), quitando la frase condicional del camino
   "existente".
2. Endurecer `auth.register.spec.ts:155,172` — cambiar `.toMatch(regex parcial)` por una
   comparación contra una constante exportada (o `toEqual` del mensaje completo), para que
   una futura divergencia textual vuelva a fallar en el unitario sin depender exclusivamente
   del e2e.
3. Correr — no leer — las compuertas:
   - `cd backend && npx jest --config ./test/jest-e2e.json --testPathPattern=registration-flow --verbose` → 3/3 PASS.
   - `cd backend && npx jest` (unitarios) → sigue en 100/100 suites, sin bajar de 911 tests.
   - `cd backend && npx jest --config ./test/jest-e2e.json` completo (50 archivos) → 50/50
     suites, 440/440 tests (no menos).
4. Verificación por mutación sugerida: reintroducir la frase distinta en el camino
   "existente" tras el fix y confirmar que REG.2 vuelve a fallar — así queda demostrado que
   el test detecta la clase de regresión, no sólo el síntoma puntual.

No asumas que el mensaje "se ve razonable" porque las 6 rondas anteriores lo dieron por
bueno. Ese nivel de confianza es exactamente el que dejó este defecto vivo desde la ronda 1.

---

## Deuda no bloqueante, dejada para más adelante

### D1 — Fix 10 sin su test e2e dedicado

Sigue sin agregarse `it('el dispositivo anónimo publica sin verificación...')` en
`backend/test/e2e/email-verified-guard.e2e-spec.ts`. La regresión real sigue cerrada
(unitario `email-verified.guard.spec.ts` cubre la rama `isAnonymous`), pero la cobertura e2e
explícita pedida en la ronda 5 no se agregó. No bloqueante.

### D4 — `apply-progress.md` sin entradas de las rondas 5, 6 y 7

El archivo termina en la narrativa de la "Ronda 4". Fix 9, Fix 10 y Fix 11 se aplicaron sin
dejar traza en `apply-progress.md`. Rompe la cadena de auditoría de un change que ya se
archivó por error una vez. No bloqueante por sí solo, pero se acumula: documentar qué se hizo
en cada ronda desde la 5 en adelante.

---

## Cómo verificar Fix 12 de verdad

1. Unificar el mensaje.
2. Correr `registration-flow.e2e-spec.ts` solo, con `--verbose` → 3/3 PASS.
3. Correr los 50 archivos e2e completos → 440/440, ningún nuevo fallo.
4. Mutar de nuevo el mensaje del camino "existente" y confirmar que REG.2 (y sólo REG.2)
   cae. Restaurar y confirmar `git diff --stat` vacío en los archivos tocados.

---

## Referencia histórica — Fixes 1–11 (rondas 1–7, CERRADOS)

- ~~Fix 1 — boot roto por `UserEntity` faltante en `forFeature`~~
- ~~Fix 2 — lint en rojo por código muerto~~
- ~~Fix 3 — canal lateral de tiempo permitía enumerar correos~~
- ~~Fix 4 — el guard bloqueaba cuentas con `role_id` NULL~~
- ~~Fix 5 — deny-list fail-open ante renombrado del rol `reporter`~~
- ~~Fix 6 — e2e propio en rojo por el contrato derogado del 410 Gone~~
- ~~Fix 7 — casilla B.5 marcada sobre un escenario sin implementar~~
- ~~Fix 8 — el default de `provisionUser()` apagó los tests del camino sin verificar~~
- ~~Fix 9 — ruta/componente `verify-email` faltante~~ — cerrado y verificado por mutación;
  composer del OTP diferido a F4, disclosed (D5).
- ~~Fix 10 — `EmailVerifiedGuard` rompía el reporte anónimo~~ — cerrado y verificado por
  mutación real; falta sólo el test e2e dedicado (D1, no bloqueante).
- ~~Fix 11 — `registration-flow.e2e-spec.ts` no compilaba~~ — cerrado: compila, corre, total
  e2e subió de 437 a 440. **Al correr, destapó Fix 12 (arriba), que sigue abierto.**
