# Verify Report — REG: Auto-registro del ciudadano (sc-325) — Ronda 7

**Change**: `2026-09-02-reg-citizen-self-registration`
**Fecha**: 2026-09-05
**Auditor**: sdd-verify (ronda 7, post-desarchivo)
**Modo**: Standard (Strict TDD activo per tasks.md; verificado vía ejecución real + mutación)

---

## Veredicto

**FAIL — 1 CRITICAL nuevo.** Fix 11 (el e2e que no compilaba) está **cerrado
correctamente**: el genérico de `env.pg.query<...>` ahora declara `role_name`, `pnpm run
typecheck` sale en 0, y las 3 aserciones REG.1/REG.2/REG.3 **corrieron por primera vez en la
historia de este change**. El total de la suite e2e subió de 437 a **440**, la señal exacta
que la ronda 6 pedía.

Pero al correr de verdad, **REG.2 falla**: el endpoint `POST /auth/register` devuelve un
`message` distinto según el correo ya exista o no, violando D3 (design.md) y el requirement
"El alta no revela si un correo ya está registrado" de `specs/citizen-registration/spec.md`
("la respuesta es idéntica en código de estado, **cuerpo** y forma"). Es un canal lateral de
enumeración de cuentas real, presente desde el primer commit de este change (`fa005b8`,
ronda 1), enmascarado en las 6 rondas anteriores porque el único unit test que afirmaba sobre
esto (`auth.register.spec.ts`) usa `.toMatch(/regex parcial/)` en vez de comparar el mensaje
completo, y porque hasta ahora ningún e2e ejercitaba el endpoint de punta a punta. Las tareas
A.8, A.9 y A.11 de `tasks.md` están marcadas `[x]` afirmando exactamente la propiedad que el
código viola. Es la **séptima** vez que este change marca trabajo como hecho sobre una
afirmación que no se sostenía al ejecutarla.

**No listo para archivar.**

---

## Qué se ejecutó (compuertas reales, números reales — mismas que `ci.yml`)

| Compuerta | Comando | Resultado |
|---|---|---|
| Backend install | `pnpm install --frozen-lockfile` | exit 0 (already up to date) |
| Backend lint | `pnpm run lint` | exit 0 — 0 errors, 19 warnings (preexistentes, ninguno en archivos de REG) |
| **Backend typecheck** | `pnpm run typecheck` (`tsc --noEmit -p tsconfig.json`) | **exit 0** — Fix 11 cerrado |
| Backend build | `pnpm run build` (`nest build`) | exit 0 |
| Backend unit test | `npx jest` | exit 0 — **100 suites / 911 tests** PASS |
| Frontend install | `pnpm install --frozen-lockfile` | exit 0 (already up to date) |
| Frontend test | `npx jest` | exit 0 — **44 suites / 305 tests** PASS |
| Frontend build | `pnpm run build` (`ng build`) | exit 0, 4.4 s |
| Frontend lint | condicional (ci.yml) | sin config eslint en `frontend/` → se salta por diseño, no es responsabilidad de REG |
| Frontend `tsc -b --noEmit` | trampa conocida, no es gate de CI | **19** — sin cambio vs ronda 6 (14 preexistentes + 5 de `app.routes.verify-email.spec.ts`, sin crecer) — WARNING persistente |
| **Integration e2e completo** | `npx jest --config ./test/jest-e2e.json` (50 archivos) | **1 failed, 49 passed, 50 total suites — 439 passed, 1 failed, 440 total tests** — CRITICAL 1 |

El total subió de 437 a 440 (+3), confirmando que el archivo compila y las 3 pruebas
corren. De esas 3, 2 pasan y **1 falla de verdad**, no por error de compilación.

---

## Fix 11 — verificado por ejecución y por mutación

1. `pnpm run typecheck` → exit 0. El tipo agregado es exactamente el que pedía
   `fixes-required.md`:
   ```ts
   const { rows } = await env.pg.query<{
     role_id: string;
     role_name: string;
     email_verified_at: Date | null;
     verification_otp: string | null;
   }>(...)
   ```
2. `npx jest --config ./test/jest-e2e.json --testPathPattern=registration-flow --verbose`:
   ```
   ✓ REG.1: POST /auth/register con correo nuevo crea la cuenta con rol `reporter` y emite OTP (42 ms)
   ✕ REG.2: D3 — POST /auth/register con correo existente devuelve la misma forma y NO crea cuenta duplicada (20 ms)
   ✓ REG.3: D1 — el body no acepta `role`/`roleName`/`permissions`/`organization_id` (falla con 400) (3 ms)
   ```
3. **Mutación real, ejecutada por el verificador**: en `backend/src/modules/auth/auth.register.ts:170`
   se cambió `where: { name: 'reporter' }` por `where: { name: 'operador_org' }` (el rol
   `reporter` deja de ser el asignado al alta pública). Resultado:
   ```
   Tests: 2 failed, 1 passed, 3 total
   ```
   REG.1 cayó (esperaba `role_name = 'reporter'` contra la BD), confirmando que la
   aserción SÍ depende de la BD, no de la respuesta HTTP opaca (D3). Se restauró el
   archivo original desde una copia (`cp` a scratchpad, no `git checkout`, porque el
   árbol no tenía cambios sin commitear en ese archivo — se verificó con `git status
   --short` antes y después). `git diff --stat backend/src/modules/auth/auth.register.ts`
   vacío tras restaurar: el árbol quedó igual.
4. REG.1 verifica contra la BD real (`SELECT ... FROM users u LEFT JOIN roles r`), no
   contra el cuerpo de la respuesta HTTP — cumple exactamente lo que pedía
   `fixes-required.md` ("no verificable sólo contra la respuesta, que es opaca por D3").
5. REG.3 verifica con `.expect(400)` y además contra la BD (`COUNT(*) = '0'`) que la
   cuenta no se creó — cubre el escenario de escalada de privilegios (D1) del spec.
   No distingue código de error porque en este endpoint sólo hay una fuente posible de
   403/400 (el `ValidationPipe` con `forbidNonWhitelisted`); la ambigüedad de código de
   error que preocupaba a la ronda 6 aplica a `EmailVerifiedGuard` vs `PermissionGuard`
   (ver A.7 abajo), no a este endpoint.

**Conclusión sobre Fix 11**: el archivo compila, las 3 pruebas corren, y una de ellas
**detecta un defecto real preexistente**. Fix 11 cumplió exactamente el propósito para el
que se escribió — cerrar el hueco de cobertura — y al hacerlo destapó lo que ese hueco
venía ocultando.

---

## CRITICAL

### CRITICAL 1 — D3 violado: el `message` de la respuesta revela si el correo ya existía

**Archivo**: `backend/src/modules/auth/auth.register.ts:156-163` (camino "correo existente")
vs `:230-237` (camino "correo nuevo")

```ts
// Camino "existente" (auth.register.ts:159-162):
message: 'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu
cuenta. Si ya lo estaba, te enviamos un aviso al titular.',

// Camino "nuevo" (auth.register.ts:234-236) y camino "rol reporter no encontrado" (:182-184):
message: 'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu
cuenta.',
```

Son literalmente dos strings distintos. Un cliente HTTP puede distinguir "correo existente"
de "correo nuevo" leyendo `response.body.message` — exactamente el oráculo de existencia de
cuentas que D3 (`design.md:61-65`) dice que se rechazó explícitamente a cambio de un 409:
> "Ante un correo ya registrado, la respuesta es **la misma** que ante uno nuevo."

Y el requirement de `specs/citizen-registration/spec.md:46-53`:
> "La respuesta a un correo ya existente DEBE ser indistinguible de la respuesta a uno
> nuevo... la respuesta es idéntica en código de estado, **cuerpo** y forma a la del correo
> nuevo."

Confirmado por ejecución real: `registration-flow.e2e-spec.ts:86` (`expect(second.body).toEqual(first.body)`) falla mostrando el diff exacto de arriba (ver log completo en la sección Fix 11).

**Por qué las 6 rondas anteriores no lo vieron**: `auth.register.spec.ts:155,172` afirma
sobre el mensaje con `.toMatch(/te enviamos un mensaje para verificar tu cuenta/)` — una
subcadena presente en **ambos** mensajes. El test pasa siempre, sin importar si el resto del
string difiere. Las tareas `tasks.md` A.8 (línea 64-70), A.9 (línea 71-76) y A.11 (línea
83-87) afirman "mismo `publicMessage`" / "respuesta indistinguible en cuerpo y código" citando
estos mismos tests como evidencia — la afirmación es falsa desde el primer commit
(`fa005b8`, verificado con `git log -p --follow`).

**Antigüedad**: presente desde la implementación original (ronda 1), no introducida en esta
ronda. `git log -p --follow -- backend/src/modules/auth/auth.register.ts` muestra las dos
strings distintas ya en `fa005b8`.

**Severidad**: CRITICAL — viola un requirement de seguridad explícito del spec (prevención de
enumeración de cuentas), no un detalle cosmético. El endpoint es público y no requiere
autenticación.

**Qué hacer** (no lo hago yo, soy auditor): unificar el `message` de los tres retornos de
`register()` a un único string constante. Después, cambiar la aserción de
`auth.register.spec.ts` de `.toMatch(regex parcial)` a comparar el mensaje completo (o mejor,
a un `toEqual` contra una constante exportada), para que una futura divergencia textual
vuelva a fallar en el unitario y no dependa exclusivamente del e2e.

---

## Deuda D1–D5 (heredada de la ronda 6) — estado en la ronda 7

| # | Descripción | Estado |
|---|---|---|
| D1 | Test e2e dedicado del caso anónimo en `email-verified-guard.e2e-spec.ts` | **Sigue sin cerrar**, no bloqueante (igual que ronda 6). Sólo existe el unitario en `email-verified.guard.spec.ts` (`Fix 10: el dispositivo anónimo... pasa sin exigir verificación`, agregado esta ronda). La cobertura e2e del camino anónimo sigue siendo incidental vía `regressions.e2e-spec.ts`, no el caso explícito pedido. |
| D2 | `.js` heredado de sc-117 en `verify-email/` | **Cerrado.** `ls frontend/src/app/features/auth/verify-email/` ya no lista ningún `.js`; sólo `.ts`, `.html`, `.css`, `.spec.ts`. |
| D3 | `tasks.md` A.6 con texto contradictorio (`[x]` + "INCOMPLETO") | **Cerrado.** A.6 ahora dice "HECHO (ronda 1, ronda 4 Fix 5, ronda 6 Fix 10, ronda 7 D3)" y describe el estado consolidado sin contradicción. |
| D4 | `apply-progress.md` sin entrada de la ronda 6 | **Sigue sin cerrar, y tampoco tiene entrada de la ronda 7.** El archivo termina en la narrativa de la "Ronda 4" (líneas 169-253); no hay sección para rondas 5, 6 ni 7, aunque en esas rondas se aplicaron Fix 9, Fix 10 y Fix 11. Rompe la cadena de auditoría — WARNING, no bloqueante por sí solo, pero acumulándose. |
| D5 | Composer del OTP diferido a F4 | **Sigue anotado con claridad.** `email-verification.controller.ts` mantiene `@UseGuards(JwtAuthGuard)` a nivel de clase; el alta pública no emite JWT. `tasks.md` B.6 y el JSDoc de `verify-email.component.ts` documentan la redirección a `/login` como decisión de scope. No bloqueante. |

---

## Casillas vs código

Revisadas `tasks.md` A.1–A.11 y B.1–B.8 contra el código fuente. Sin `TODO`/`stub`/
`placeholder`/`pendiente`/`not implemented` reales en los archivos del change (dos falsos
positivos del grep: "Todo lo demás" en un comentario y "intente inyectar" no son marcadores
de trabajo pendiente).

- A.1–A.7, A.10: verificado el código, coincide con lo descrito.
- **A.8, A.9, A.11: marcadas `[x]` afirmando D3 cerrado — CRITICAL 1 arriba muestra que no lo
  está.** Esta es la casilla incorrecta de esta ronda; ninguna otra se encontró marcada sobre
  trabajo no hecho.
- B.1–B.8: verificado, coincide (B.5 correctamente destildada y marcada como diferida a F4,
  consistente con la ronda 4).

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| El alta no revela si un correo ya está registrado | Correo nuevo | `registration-flow.e2e-spec.ts > REG.1` | ✅ COMPLIANT |
| El alta no revela si un correo ya está registrado | Correo existente — respuesta idéntica en cuerpo | `registration-flow.e2e-spec.ts > REG.2` | ❌ **FAILING** |
| El alta no revela si un correo ya está registrado | Sin cuenta duplicada | `registration-flow.e2e-spec.ts > REG.2` (parte de conteo) | ✅ COMPLIANT (esta sub-aserción pasa) |
| El alta no revela si un correo ya está registrado | Aviso al titular | `auth.register.spec.ts` (unitario, mockea `notifyExistingAccountAttempt`) | ⚠️ PARTIAL (sólo unitario, sin e2e que confirme el envío real) |
| El alta no revela si un correo ya está registrado | Tiempos comparables | `auth.register.spec.ts > D3: el camino "correo existente" también invoca passwordHasher.hash` | ✅ COMPLIANT |
| El alta está limitada en tasa | Ráfaga por IP / por correo / aislada | `auth.register.spec.ts` (unitario, clock fake) | ⚠️ PARTIAL (sin e2e dedicado, no bloqueante — fuera del alcance de esta ronda) |
| El rol es constante del servidor (D1) | Payload con `role`/`permissions`/`organization_id` | `registration-flow.e2e-spec.ts > REG.3` | ✅ COMPLIANT |
| `EmailVerifiedGuard` exige verificación salvo staff/anónimo | Todos los casos | `email-verified-guard.e2e-spec.ts` (6 tests) + `email-verified.guard.spec.ts` (8 tests, incluye Fix 10) | ✅ COMPLIANT |

**Compliance summary**: 5/8 escenarios listados plenamente compliant, 1 failing (bloqueante), 2 parciales (no bloqueantes).

---

### Coherence (Design)

| Decisión | ¿Seguida? | Notas |
|---|---|---|
| D1 — rol constante del servidor | ✅ Sí | Verificado por e2e real (REG.1, REG.3) y mutación. |
| D2 — verificación no bloquea login, sólo publicar | ✅ Sí | `EmailVerifiedGuard` sólo en métodos POST de incidents/comments. |
| D3 — respuesta indistinguible | ❌ **No** | CRITICAL 1. El código implementa la intención en el status HTTP y en la ausencia de cuenta duplicada, pero no en el texto del `message`. |
| D4 — rate limit por IP y correo | ✅ Sí | Verificado por unitarios con clock fake; sin e2e dedicado (no bloqueante). |
| D9 — igualación de tiempo | ✅ Sí | `DUMMY_PASSWORD_FOR_TIMING`, verificado por TDD en ronda 2. |

---

## Issues Found

**CRITICAL** (must fix before archive):
1. CRITICAL 1 — `backend/src/modules/auth/auth.register.ts:159-162` vs `:234-236`/`:182-184`
   — el `message` de la respuesta distingue correo existente de correo nuevo, violando D3 y
   el requirement de no-revelación de `specs/citizen-registration/spec.md:46-53`. Confirmado
   por ejecución real (`registration-flow.e2e-spec.ts > REG.2` falla). `tasks.md` A.8/A.9/A.11
   afirman lo contrario.

**WARNING** (should fix):
1. `apply-progress.md` sin entradas de las rondas 5, 6 y 7 (D4, arrastrada). Rompe la cadena
   de auditoría de un change que ya se archivó por error una vez.
2. `frontend`: `npx tsc -b --noEmit` en 19 errores (sin crecer desde la ronda 6), 5 de ellos
   en `app.routes.verify-email.spec.ts` por falta de tipos de Node (`fs`/`path`/`__dirname`).
   No es gate de CI pero es deuda de REG, documentada, no creciente.
3. `auth.register.spec.ts:155,172` usa `.toMatch(regex parcial)` en vez de comparar el
   mensaje completo — es el mecanismo que enmascaró CRITICAL 1 durante 6 rondas. Aun después
   de corregir el mensaje, esta aserción débil debería reforzarse para no volver a enmascarar
   una futura regresión del mismo tipo.
4. D1 (ronda 5/6) sigue sin su test e2e dedicado en `email-verified-guard.e2e-spec.ts`; la
   cobertura del camino anónimo sigue siendo incidental.

**SUGGESTION** (nice to have):
1. Tipar los parámetros `(l) => …` en `app.routes.verify-email.spec.ts` como `string` para
   eliminar 2 de los 19 errores de `tsc -b`.
2. Considerar `@types/node` en el tsconfig de test del frontend para no seguir acumulando
   este patrón en specs nuevos.
3. Cuando F4 implemente el composer real del OTP, revisar si el mensaje único post-fix de
   CRITICAL 1 sigue siendo apropiado para la UX (D3 acepta el costo de UX a cambio de no
   revelar cuentas — el mensaje unificado debería mantener ese balance).

---

## Verdict

**FAIL**

Fix 11 se cerró correctamente y cumplió su propósito: destapó un defecto de seguridad real
(D3 violado) que las 6 rondas anteriores no vieron porque nada corría la prueba correcta.
El change no puede archivarse hasta que CRITICAL 1 se corrija y se reverifique por ejecución
real (no basta con leer que el mensaje "se ve" igual).
