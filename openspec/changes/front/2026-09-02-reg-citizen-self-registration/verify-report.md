# Verify Report — Ronda 8 — REG: Auto-registro del ciudadano (sc-325)

**Change**: `2026-09-02-reg-citizen-self-registration` (front)
**Commit auditado**: `66afee7` (árbol limpio salvo ANON, fuera de alcance)
**Modo**: Strict TDD activo
**Fecha**: 2026-09-05

---

## Veredicto

**PASS WITH WARNINGS.** No queda ningún CRITICAL. `fixes-required.md` se borra en esta
ronda porque **Fix 12 está cerrado de verdad** — código y test, no sólo código como
afirmaba el brief de esta ronda. La afirmación de que ":206 y :258 seguían con el literal
duplicado" y que "el unitario no lo cazaría" es **falsa contra el código commiteado**: la
verifiqué carácter por carácter, por `git diff` de la commit que lo introdujo, y por
mutación real ejecutada por mí. Quedan 3 WARNING de deuda documental/cobertura, ninguno
bloqueante.

---

## 1. Fix 12 — auditoría carácter por carácter

### Los tres `return` de `AuthRegisterService.register()` (estado real, no el afirmado)

| Camino | Línea | Valor |
|---|---|---|
| Correo existente | `auth.register.ts:184` | `message: REGISTRATION_INDISTINGUISHABLE_MESSAGE` |
| Rol `reporter` no encontrado | `auth.register.ts:205` | `message: REGISTRATION_INDISTINGUISHABLE_MESSAGE` |
| Correo nuevo (alta exitosa) | `auth.register.ts:256` | `message: REGISTRATION_INDISTINGUISHABLE_MESSAGE` |

`grep -n "REGISTRATION_INDISTINGUISHABLE_MESSAGE" backend/src/modules/auth/auth.register.ts`
devuelve exactamente esas tres líneas más la declaración de la constante (`:63-64`). **No
hay ningún literal duplicado en `:206` ni en `:258`** — esas líneas hoy son `},` y `},`
respectivamente (llaves de cierre), no asignaciones de string. La afirmación del brief de
esta ronda sobre esos números de línea no corresponde al código commiteado en `66afee7`;
la reviso con `git diff fa005b8 66afee7 -- backend/src/modules/auth/auth.register.ts` y
confirmo que los TRES retornos se migraron a la constante en el mismo commit que la
introdujo, no en dos de tres.

No hay ningún otro punto del código que construya este mensaje: `auth.controller.ts:91`
sólo hace `return result.publicMessage` sin tocarlo; no hay interceptor ni pipe que lo
reescriba (`SnakeCaseResponseInterceptor` opera sobre claves, no sobre valores).

### El spec unitario — también hardened, no sólo el código

`auth.register.spec.ts:158` y `:176` (no `:155,172` — el archivo creció por los comentarios
del fix): ambos usan `expect(result.publicMessage.message).toBe(REGISTRATION_INDISTINGUISHABLE_MESSAGE)`.
El `.toMatch(/subcadena parcial/)` que sobrevivió 6 rondas **ya no existe en el archivo**.
Confirmado por `git diff fa005b8 66afee7 -- backend/src/modules/auth/auth.register.spec.ts`:
el diff muestra el cambio literal de `toMatch(regex)` a `toBe(CONSTANTE)` en ambos tests, con
un comentario explícito citando el Fix 12.

### Verificación por mutación — ejecutada por mí, no leída

Con el árbol limpio confirmado (`git status --short` sin cambios en el archivo antes de
mutar), reintroduje la frase divergente **sólo** en el camino "correo existente"
(`auth.register.ts:184`, agregando `+ ' Si ya lo estaba, te enviamos un aviso al titular.'`)
y corrí:

```
$ npx jest --config package.json auth.register.spec.ts
✕ D3: con correo existente, NO crea cuenta, manda aviso al titular y devuelve la MISMA forma de respuesta
  Expected: "Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta."
  Received: "Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta. Si ya lo estaba, te enviamos un aviso al titular."
Tests: 1 failed, 9 passed, 10 total
```

**El UNITARIO lo cazó**, no sólo el e2e — al revés de lo que planteaba el brief de esta
ronda ("el e2e REG.2 debería cazarlo; el unitario, no"). Esto es la evidencia directa de que
el endurecimiento de la aserción (Sección 2) ya se aplicó, y que efectivamente cierra la
clase de regresión, no sólo la instancia. Restauré el archivo desde el respaldo (`.bak`)
inmediatamente después y confirmé `git status --short` y `git diff --stat` vacíos para
`auth.register.ts`.

**Conclusión de la Sección 1: Fix 12 está cerrado en código Y en defensa de test. No es
CRITICAL ni WARNING — es un cierre completo.** El hallazgo de mayor valor de esta ronda es
que el propio brief de auditoría contenía una afirmación desactualizada o incorrecta sobre
el estado del código; verificarla en vez de heredarla es precisamente el punto de esta
ronda 8.

---

## 2. La clase de defecto — aserciones parciales donde el contrato exige igualdad

Barrido de `toMatch`, `toContain`, `objectContaining`, `expect.any`, `toMatchObject` en los
specs del change:

| Archivo:línea | Aserción | Contrato exige igualdad? | Veredicto |
|---|---|---|---|
| `auth.register.spec.ts:158,176` | ~~`toMatch`~~ → ahora `toBe(CONSTANTE)` | Sí (D3, mensaje indistinguible) | ✅ Corregida, ya no es parcial |
| `auth.register.spec.ts:99,135` | `objectContaining({...})` sobre el payload de `userRepo.save` | No — el test verifica sólo `roleId`/`permissions`/`email`, complementado en la misma prueba con `.mock.calls[0][0].roleId` y `.not.toContain('*')` puntuales | Legítima — no hay contrato de igualdad total sobre el objeto guardado |
| `auth.register.spec.ts:235` | `toMatchObject({ success: true })` | No — el test es "una alta aislada no se ve afectada" por rate limit, sólo le importa `success` | Legítima |
| `auth.register.spec.ts:249` | `toThrow(/12 characters/)` | No — mensaje de error de terceros (password policy), no un contrato de D3 | Legítima |
| `backend/test/e2e/registration-flow.e2e-spec.ts:43` | `toMatch(/te enviamos un mensaje/)` (REG.1) | No — REG.1 es el camino feliz; el contrato de igualdad D3 lo exige el **otro** test | Legítima — REG.2 (`:86`, `toEqual(first.body)`) es el que sí impone igualdad total, y lo hace correctamente |
| `email-verified.guard.spec.ts:78,94,126,137` | `toMatchObject({...})` sobre excepciones HTTP | No — el contrato del guard exige código+razón de error, cubiertos explícitamente por campo, no forma completa de la excepción | Legítima |
| `register.component.spec.ts:140` | `toMatch(/Demasiados intentos/)` | No — mensaje de UI para 429, sin contrato de igualdad en el spec | Legítima |
| `verify-email.component.spec.ts:65,70` | `toContain('...')` sobre `textContent` | No — verificación de contenido visible, no de forma de respuesta HTTP | Legítima |
| `auth.controller.spec.ts` | (sin hallazgos de `toMatch`/`toContain`/`objectContaining` relevantes) | — | — |

**Conclusión de la Sección 2**: la única aserción parcial que masking-eaba un contrato de
igualdad explícito del spec (D3) era exactamente `auth.register.spec.ts:155,172` en su
versión pre-Fix-12, y ya se corrigió. El resto de coincidencias de patrón son legítimas:
verifican subconjuntos de datos donde el requirement correspondiente no exige igualdad
total. No encontré una nueva instancia de "la clase de defecto" sin cerrar.

---

## 3. Deuda D1–D5

| Ítem | Estado | Evidencia |
|---|---|---|
| **D1** — e2e dedicado del caso anónimo en `email-verified-guard.e2e-spec.ts` | **Sigue abierto.** No se agregó. | `grep -n "it("` sobre el archivo lista 7 tests; ninguno menciona `isAnonymous` ni dispositivo anónimo. No bloqueante — la regresión real la cubre el unitario `email-verified.guard.spec.ts` (rama `isAnonymous`). |
| **D2** (`.js` heredado) | **Cerrado, confirmado.** | `find frontend/src -iname "*verify-email*"` sólo devuelve `.ts/.html/.css/.spec.ts`; no hay `.js` heredado. |
| **D3** (casilla A.6, guard) | **Cerrado, confirmado.** | `email-verified.guard.ts` mantiene el allow-list exhaustivo (Fix 5) + exención `isAnonymous` (Fix 10); `email-verified.guard.spec.ts` 7/7 y `email-verified-guard.e2e-spec.ts` 7/7 PASS en la corrida de esta ronda. |
| **D4** — `apply-progress.md` sin entradas de rondas 5-8 | **Sigue abierto.** | El archivo (252 líneas) termina en la narrativa de "Ronda 4"; nada documenta Fix 9, 10, 11 ni 12. Deuda de trazabilidad que se acumula en un change que ya se archivó por error una vez — WARNING, no bloqueante por sí solo. |
| **D5** — composer del OTP diferido a F4 | **Sigue anotado con claridad.** | `tasks.md` B.6 documenta explícitamente que `verify-otp`/`resend-verification` exigen JWT y el alta pública no lo emite; `verify-email.component.spec.ts:68` etiqueta el mensaje de sesión activa como "composer queda como placeholder F4". |

---

## 4. Casillas de `tasks.md` contra el código

- **A.8, A.9, A.11** — afirman que la respuesta es indistinguible. **Ahora es cierto** (ver
  Sección 1): los tres `return` usan la misma constante, y los dos specs unitarios lo
  verifican con `toBe`, no con regex parcial. No hace falta destildar nada.
- Búsqueda de `TODO|stub|placeholder|pendiente|not implemented` en el árbol del change:
  sólo aparecen menciones documentales legítimas ("F4-placeholder" en B.6, un comentario en
  el guard que no es marcador de trabajo pendiente). No hay trabajo sin hacer marcado como
  hecho.
- El bloque **"Estado de gates"** al final de `tasks.md` (líneas 201-208) sigue con los
  números de la **ronda 2** (99/99 suites backend, 902 tests; 42/42 frontend, 298 tests) —
  no se actualizaron tras las rondas 6-8, que subieron a 100/100 · 911 y 44/44 · 305
  respectivamente. No es un defecto funcional, pero en un change auditado bajo la hipótesis
  de "se marcó hecho sin haber corrido", una sección de gates desactualizada es exactamente
  el tipo de dato que invita a confiar sin verificar. **WARNING**, no bloqueante.

---

## 5. Compuertas ejecutadas (evidencia real, no leída)

### Backend (`backend/`)
| Compuerta | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm run lint` | exit 0 — **0 errores, 19 warnings** (preexistentes, `no-explicit-any` en specs no tocados por REG) |
| `pnpm run typecheck` (`tsc --noEmit -p tsconfig.json`) | exit 0 |
| `pnpm run build` (`nest build`) | exit 0 |
| `pnpm test` (unitarios, `npx jest`) | **100/100 suites, 911/911 tests** PASS |
| e2e completo (`npx jest --config ./test/jest-e2e.json --runInBand`, 50 archivos) | **50/50 suites, 440/440 tests** PASS, **0 fallos** (bajó de 1 fallo en ronda 7 a 0) |
| `registration-flow.e2e-spec.ts` aislado | 3/3 PASS (REG.1, REG.2, REG.3) — incluido en la corrida completa |
| `email-verified-guard.e2e-spec.ts` | 7/7 PASS — incluido en la corrida completa |

### Frontend (`frontend/`)
| Compuerta | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm test` | **44/44 suites, 305/305 tests** PASS |
| `pnpm run build` | exit 0, bundle ~4.4s |
| `npx tsc -b --noEmit` | **19 errores** — mismos archivos y códigos que la ronda 7 (déficit sistémico de tipos Node en specs: `fs`, `path`, `__dirname`, `__filename` no declarados para el entorno de test), **no creció** |
| `pnpm run lint` | No existe (gap preexistente documentado en `tasks.md:208`, no de REG) |

### Árbol de trabajo
`git status --short` antes y después de todas las corridas: sin cambios en archivos del
change REG. El único archivo mutado (`auth.register.ts`, para la Sección 1) se restauró
desde `.bak` y se confirmó `git diff --stat` vacío antes de continuar.

**Ninguna compuerta se leyó sin correr.**

---

## 6. Compliance Matrix (extracto — requirement de no-revelación)

| Requirement | Scenario | Test | Resultado |
|---|---|---|---|
| El alta no revela si un correo ya está registrado | Correo nuevo | `auth.register.spec.ts > D3: con correo nuevo...` (unit) + `registration-flow.e2e-spec.ts > REG.1` (e2e) | ✅ COMPLIANT |
| El alta no revela si un correo ya está registrado | Correo existente, misma forma | `auth.register.spec.ts > D3: con correo existente...` (unit, `toBe`) + `registration-flow.e2e-spec.ts > REG.2` (e2e, `toEqual(first.body)`) | ✅ COMPLIANT |
| El alta no revela si un correo ya está registrado | Sin cuenta duplicada | `registration-flow.e2e-spec.ts > REG.2` (conteo en BD) | ✅ COMPLIANT |
| El alta no revela si un correo ya está registrado | Aviso al titular | `auth.register.spec.ts > D3: con correo existente...` (`notifyExistingAccountAttempt` llamado) | ✅ COMPLIANT |
| El alta no revela si un correo ya está registrado | Tiempos comparables | `auth.register.spec.ts > D3: el camino "correo existente" también invoca passwordHasher.hash` | ✅ COMPLIANT (estructural — no hay medición de latencia real, aceptado desde ronda 1) |
| El rol es constante del servidor (D1) | Payload sucio no escala privilegios | `auth.register.spec.ts > A.5` + `registration-flow.e2e-spec.ts > REG.3` (400) | ✅ COMPLIANT |
| Verificación de correo requerida para publicar | Publicar sin verificar → 403 | `email-verified.guard.spec.ts` + `email-verified-guard.e2e-spec.ts` | ✅ COMPLIANT |
| Verificación de correo requerida para publicar | Dispositivo anónimo exento | `email-verified.guard.spec.ts` (unit, rama `isAnonymous`) | ⚠️ PARTIAL — sin e2e dedicado (D1, no bloqueante) |

---

## Issues Found

**CRITICAL** (must fix before archive): **None.**

**WARNING** (should fix, no bloqueante):
1. `tasks.md:201-208` — sección "Estado de gates" con números de la ronda 2, no
   actualizados tras las rondas 6-8. Riesgo: invita a confiar en un dato desactualizado en
   un change ya marcado por auditar-antes-de-confiar.
2. `apply-progress.md` (D4) — sin entradas para las rondas 5, 6, 7 y 8 (Fix 9-12). Rompe la
   cadena de auditoría de un change que ya se archivó por error una vez.
3. `email-verified-guard.e2e-spec.ts` (D1) — falta el caso e2e dedicado al dispositivo
   anónimo. La regresión real está cubierta por unitario; el hueco es de cobertura e2e
   explícita, no de comportamiento.

**SUGGESTION** (nice to have):
1. Los 19 errores de `tsc -b --noEmit` en frontend (déficit de tipos Node en archivos de
   test) son un gap sistémico preexistente, no de REG, pero sería razonable abrir un ticket
   aparte para agregar `@types/node` a `tsconfig.spec.json` y bajar el ceiling en vez de
   mantenerlo como línea base aceptada.

---

## ¿Se puede archivar?

**Sí.** Con evidencia ejecutada, no leída:
- Fix 12 cerrado en código (3/3 retornos con la constante) y en test (2/2 unitarios con
  `toBe`, más el e2e con `toEqual` de cuerpo completo) — confirmado por `git diff` de la
  commit y por mutación real que el propio unitario detecta la regresión.
- Backend: lint 0 errores, typecheck exit 0, build exit 0, 100/100 unit suites (911 tests),
  **50/50 e2e suites (440/440 tests, 0 fallos)** — el fallo de la ronda 7 desapareció.
- Frontend: 44/44 suites (305 tests), build exit 0, tsc -b 19 errores sin crecer.
- Deuda D1 y D4 sigue abierta pero es no-bloqueante y estaba ya así clasificada en rondas
  previas; no hay evidencia de que oculte un defecto de comportamiento.
- Árbol de trabajo verificado limpio antes y después de la auditoría (sólo archivos de ANON,
  fuera de alcance, permanecen sin commitear).

No queda ningún CRITICAL abierto. `fixes-required.md` se elimina en esta ronda.
