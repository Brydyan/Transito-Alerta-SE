# Verify Report: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Ronda**: 2
**Rama verificada**: `brydyan/sc-330/mail-el-correo-de-verificacion-nunca-se-pudo`
**HEAD**: `e50814c6ef1181bf497e690fcfc7cf09f3285be1`
**Fecha**: 2026-09-06
**Modo**: Standard (verificación por ejecución real + mutación, exigencia explícita del usuario)

**Nota de contexto (importante)**: los arreglos de esta ronda (CRITICAL-1 y el particionado
de CI) los escribió el orquestador, no el implementador. Se auditaron con el mismo rigor
que si los hubiera escrito cualquier otro agente — sin beneficio de la duda.

**Nota de discrepancia de entorno (otra vez)**: se afirmó "árbol limpio" al iniciar esta
ronda. **Era falso.** `git status --short` mostró, desde el primer momento, 4 archivos sin
commitear:

```
 M backend/src/modules/mail/templates/mail-templates.spec.ts
 M backend/src/modules/mail/templates/mail-templates.ts
 M openspec/changes/.../apply-progress.md
 M openspec/changes/.../tasks.md
```

Estos cambios **ya implementan la opción 1 de WARNING-A** (borrar `ENQUEUED_TEMPLATE_NAMES`
y el `describe` de C.2, dejar un comentario que documenta que la cobertura real vive en
`mail-outbox.consumer.spec.ts`) — exactamente lo que el brief de esta ronda pedía **no
tocar** ("confirmalo, no lo arregles"). No lo escribí yo en esta sesión: ya estaba en el
árbol al arrancar. Se verificó tal cual estaba, sin comittear y sin revertir, siguiendo el
mismo criterio que la ronda 1 (auditar el árbol real, no el que se supone que hay). El
contenido del cambio es correcto (ver sección WARNING-A abajo) pero **queda sin commitear**
— no se puede archivar con un árbol sucio.

---

## Veredicto

**FAIL** — 1 CRITICAL nuevo bloquea el archivado. El CRITICAL-1 original (SMTP_HOST) sí
está resuelto de verdad, con evidencia de mutación. El particionado de CI que se agregó
para "resolver" la lentitud del e2e **no ejecuta ningún test en CI**: se rompe con "No
tests found, exiting with code 1" en las cuatro particiones, por un problema de paso de
flags de `pnpm run` que este mismo repo ya había sufrido antes (ver `CLAUDE.md`).

---

## 1 — CRITICAL-1 (SMTP_HOST): ¿cierra de verdad? → **Sí.**

**Sin ningún override manual**, subconjunto de 6 e2e:

```
npx jest --config ./test/jest-e2e.json --testPathPattern='mail\.e2e-spec|email-verification\.e2e-spec|email-verified-guard\.e2e-spec|registration-flow\.e2e-spec|registration-otp-flow\.e2e-spec|trust-proxy-rate-limit\.e2e-spec'
→ 6 suites / 27 tests, 0 fallos, 125.187s
```

`backend/.env` real del repo **sigue** trayendo `SMTP_HOST=localhost` (confirmado,
`.env:47`) — el fix funciona pese a eso, no porque el `.env` haya cambiado.

**Mutación** — se quitó la línea `process.env.SMTP_HOST = '';` de
`test-environment.ts` (backup con `cp`, restaurado después):

```
npx jest --config ./test/jest-e2e.json --testPathPattern='mail\.e2e-spec'
→ 1 suite falla, 2 failed / 4 passed / 6 total
● C.4: una entrada con `email_verification` se procesa y NO termina en mail:dead
    expect(await deadCount()).toBe(before);  Expected: 0, Received: 1
● C.4: una entrada con `existing_account_attempt` se procesa y NO termina en mail:dead
    expect(await deadCount()).toBe(before);  Expected: 0, Received: 1
```

**Cayeron exactamente los mismos dos tests que en la ronda 1.** El arreglo es el que hace
pasar el test, no una casualidad del entorno.

**Confirmado en código** (no sólo por el resultado del test):
`mail.config.ts:33` → `smtpHost: process.env.SMTP_HOST || undefined`. Con
`SMTP_HOST=''`, `'' || undefined` evalúa `undefined` (cadena vacía es falsy en JS).
`mail.service.ts:81` → `if (!mailConfig.smtpHost)` → `!undefined` → `true` → toma la
rama de sólo-registro. La cadena vacía SÍ llega como `undefined`, no como `''` truthy.

**Orden de ejecución**: `process.env.SMTP_HOST = ''` está en `test-environment.ts:197`,
antes de `moduleFixture.createNestApplication()` (línea 218) — se fija antes de que
`ConfigModule` lea el proceso. Correcto.

**Ningún otro test depende de un `SMTP_HOST` truthy**: `grep -rn SMTP_HOST src test` da
sólo `mail.config.ts` (lee `process.env`), `mail.service.spec.ts` (dos tests que mockean
`ConfigService` directamente, no `process.env` — no afectados, confirmado: siguen en la
corrida de 1024/1024 verdes) y los tres comentarios actualizados de `mail.e2e-spec.ts`.

**Veredicto parcial: CRITICAL-1 CERRADO, con evidencia real y mutación.**

---

## 2 — Particionado de CI: ¿las cuatro partes cubren el todo? → **Sí en teoría, NO EN LA PRÁCTICA — CRITICAL nuevo.**

### 2.1 — Cobertura de la partición (unión = todo)

`--listTests` directo con jest (sin pasar por `pnpm run`, para aislar la variable):

```
npx jest --config ./test/jest-e2e.json --listTests                → 54 archivos
npx jest --config ./test/jest-e2e.json --shard=1/4 --listTests    → 14 archivos
npx jest --config ./test/jest-e2e.json --shard=2/4 --listTests    → 14 archivos
npx jest --config ./test/jest-e2e.json --shard=3/4 --listTests    → 13 archivos
npx jest --config ./test/jest-e2e.json --shard=4/4 --listTests    → 13 archivos
```

Unión de las cuatro particiones == conjunto completo de 54, comparado por `diff` de
conjuntos ordenados (no por conteo): **coincide exactamente**. Sin solapamiento
(`uniq -d` sobre la unión: vacío). El particionado en sí, a nivel de jest, es correcto.

### 2.2 — ¿`pnpm run test:e2e -- --shard=N/4` pasa la bandera a jest? → **NO. Se rompe.**

Esta es la línea exacta de `ci.yml:226`:

```yaml
- run: pnpm run test:e2e -- --shard=${{ matrix.shard }}/4
```

Ejecutada tal cual, para las cuatro particiones:

```
$ pnpm run test:e2e -- --shard=1/4
> jest --config ./test/jest-e2e.json -- --shard=1/4
No tests found, exiting with code 1
Pattern: --shard=1/4 - 0 matches
[ELIFECYCLE] Command failed with exit code 1.
```

**Exit code 1, 0 tests ejecutados, en las cuatro particiones.** Este repo (pnpm 11.20.0,
fijado en `packageManager` y leído por `pnpm/action-setup@v4` en CI — misma versión que se
usaría en el runner) **reenvía el `--` literal** al comando subyacente en lugar de
eliminarlo, a diferencia de `npm run` (probado en paralelo: `npm run test:e2e --
--shard=1/4 --listTests` sí funciona, 14 archivos). El `--` extra queda como primer
argumento posicional para el parser de jest (yargs), que a partir de ahí trata todo lo
siguiente como patrón de ruta de test literal en vez de flags — de ahí
`Pattern: --shard=1/4 - 0 matches`.

**Confirmado que NO es "pnpm se come la bandera" sino algo peor: la corrompe.** Sin el
`--` (`pnpm run test:e2e --shard=1/4 --listTests`), el paso a jest funciona perfecto:
14 archivos, idéntico al `--listTests` directo de jest para el shard 1.

**Impacto real**: en CI, las cuatro particiones de `integration` fallarían con "No tests
found" — **cero tests e2e se ejecutarían nunca**, en cada push a `main`/`develop` y en cada
PR que toque paths de `integration`. No es un falso verde (ver 2.3), es una compuerta que
se vuelve permanentemente roja y bloquea todo merge sin ejecutar una sola prueba real.

**Fix necesario** (no aplicado — sólo diagnóstico, según las reglas de esta ronda): quitar
el `--` de la línea 226 → `pnpm run test:e2e --shard=${{ matrix.shard }}/4`. Verificado que
así sí reenvía correctamente (mismo split 14/14/13/13 que el jest directo).

### 2.3 — `integration-gate`: ¿algún camino queda en verde con una partición rota?

Lógica revisada (`ci.yml:242-254`):

```yaml
integration-gate:
  needs: integration
  if: always()
  steps:
    - run: |
        case "${{ needs.integration.result }}" in
          success|skipped) exit 0 ;;
          *)                exit 1 ;;
        esac
```

- `success` → las 4 particiones (matrix) pasaron → OK.
- `skipped` → el job `integration` no corrió (PR sin cambios en paths de integración) → OK,
  correcto.
- `failure` (cualquier partición falla, matrix agregada) → cae al `*` → exit 1. **Correcto.**
- `cancelled` → cae al `*` → exit 1. **Correcto** (falla cerrado, no abre una rendija).

**No encontré ningún camino que quede en verde con una partición rota.** El agregador en sí
está bien diseñado — el problema NO es que `integration-gate` mienta, es que `integration`
nunca corre ni un test real por el bug de 2.2. El gate sería consistentemente rojo (lo
correcto dado el estado actual), pero eso significa que la suite de integración quedaría
bloqueando cada push/PR de main indefinidamente hasta que alguien note por qué "no hay
tests" en vez de un fallo de test real — un modo de fallo confuso, aunque no silencioso.

**Veredicto parcial: la partición en sí es correcta y el agregador es correcto. La
invocación de `pnpm run` está rota y es CRITICAL — el gate completo de integración queda
inoperante en CI tal como está escrito hoy.**

---

## 3 — WARNING-A: ¿sigue abierto? → **No — ya estaba resuelto (sin commitear) al empezar esta ronda.**

Ver la nota de discrepancia de entorno arriba. El array `ENQUEUED_TEMPLATE_NAMES` y el
`describe` de C.2 **ya no existen** en el árbol de trabajo (diff sin commitear,
`mail-templates.ts` / `mail-templates.spec.ts`). Se aplicó la opción 1 de
`fixes-required.md` ("Borrarlo"), con un comentario nuevo en `mail-templates.ts:110-122`
que documenta correctamente que:

- la cobertura de `TEMPLATES: Record<TemplateName, TemplateFn>` la garantiza el compilador
  (todo miembro del union `TemplateName` debe tener entrada, o no compila);
- el caso real que el compilador no ve — un nombre que llega como cadena desde Redis —
  está cubierto en runtime.

**Confirmado con ejecución real**: `mail-templates.spec.ts` → 14/14 pasan (bajó de 15 a 14,
consistente con la eliminación de 1 test tautológico).

**Mutación pedida para la parte que sí importa** — romper la detección de nombre
desconocido en el consumidor (`mail-outbox.consumer.ts:154`,
`(err as Error).message?.startsWith('Unknown mail template')` → cambiado a una cadena que
nunca matchea, backup con `cp`, restaurado después):

```
npx jest src/modules/mail/mail-outbox.consumer.spec.ts
→ 1 failed / 8 passed / 9 total
● sends an unknown template straight to mail:dead (data defect)
    expect(jest.fn()).toHaveBeenCalledWith(...)  Number of calls: 0
```

**Cayó exactamente el test esperado.** La protección real (bloque B, tipo + este test de
runtime) tiene red; el WARNING-A queda cerrado y bien cerrado — pero **sin commitear**.
Este verify-report lo trata como "resuelto, pendiente de commit", no como abierto.

---

## 4 — IPv4-mapped IPv6 en `proxy-trust.ts`: ¿tiene red? → **Sí.**

Mutación: se quitó el strip de `::ffff:` (`isTrustedProxyAddress`, línea 75:
`const ipv4 = addr.startsWith('::ffff:') ? addr.slice(7) : addr;` → `const ipv4 = addr;`,
backup con `cp`, restaurado después):

```
npx jest src/common/proxy-trust.spec.ts
→ 1 failed / 13 passed / 14 total
● IPv4-mapped IPv6 (::ffff:127.0.0.1) SÍ es de confianza (G.4 — Node dual-stack)
    expect(isTrustedProxyAddress('::ffff:127.0.0.1')).toBe(true);
    Expected: true, Received: false
```

**Cayó exactamente el test que declara la garantía.** El arreglo del commit `9581104` tiene
red real, no es cosmético.

---

## Compuertas

| Compuerta | Resultado | Detalle |
|-----------|-----------|---------|
| backend `npx tsc --noEmit` | ✅ exit 0 | Sin errores |
| backend `pnpm run lint` | ✅ exit 0, 24 warnings | Idéntico a la línea base de ronda 1 (mismos 5 archivos, mismo patrón `no-explicit-any`) |
| backend `nest build` | ✅ exit 0 | |
| backend unit (jest) | ✅ **111 suites / 1024 tests**, 0 fallos, 19.99s | Incluye el árbol tal cual (con WARNING-A ya resuelto sin commitear) |
| backend e2e SUBCONJUNTO (6 archivos) | ✅ **6/6 suites, 27/27 tests**, 125.19s | Sin override manual de `SMTP_HOST` |
| backend e2e COMPLETO (54 archivos) | ✅ **54/54 suites, 470/470 tests**, 614.28s | Objetivo cumplido exactamente: 54/54 y 470/470 |
| frontend `npx tsc -b --noEmit` | ❌ exit 2 (preexistente, no de este change) | Mismos 3 archivos que ronda 1: `auth.service.spec.ts:227`, `placeholder.component.spec.ts`, `layout-tokens.regression.spec.ts` — ninguno tocado por commits de MAIL |
| frontend unit (jest) | ✅ **60 suites / 415 tests**, 0 fallos, 5.11s | |
| frontend build | No re-ejecutado esta ronda (sin cambios de frontend en round 2; ronda 1 ya confirmó exit 0) | |

**Tiempo del subconjunto vs. completo, otra vez confirmado**: 125s vs 614s (≈4.9×). Sin
falsos negativos: el subconjunto predijo correctamente el resultado (todo verde) de la
suite completa. La estrategia sigue valiendo la pena para iterar.

---

## Mutaciones de esta ronda — resumen

| # | Mutación | Archivo | Test(s) que cayeron | Restaurado |
|---|----------|---------|----------------------|------------|
| 1 | Quitar `process.env.SMTP_HOST = ''` | `test-environment.ts` | `C.4: email_verification...`, `C.4: existing_account_attempt...` (mail.e2e-spec.ts) — los mismos 2 de ronda 1 | ✅ |
| 2 | Quitar el strip `::ffff:` | `proxy-trust.ts` | `IPv4-mapped IPv6 (::ffff:127.0.0.1) SÍ es de confianza (G.4)` | ✅ |
| 3 | Romper el `startsWith('Unknown mail template')` del consumidor | `mail-outbox.consumer.ts` | `sends an unknown template straight to mail:dead (data defect)` | ✅ |
| 4 | Quitar el `--` de `pnpm run test:e2e -- --shard=N/4` (verificación positiva, no mutación de regresión) | invocación directa, no archivo | N/A — confirma que SIN el `--` el flag llega bien (14/14/13/13) | N/A (no tocó archivos) |

`git status --short` idéntico antes y después de las mutaciones 1-3 (mismo estado sucio de
las 4 archivos preexistentes, ver nota de discrepancia). Ningún `.bak` quedó en el árbol.

---

## Issues Found

### CRITICAL (bloquean el archivado)

**CRITICAL-CI — El particionado de e2e no ejecuta ningún test en CI.**
`ci.yml:226`: `pnpm run test:e2e -- --shard=${{ matrix.shard }}/4`. El `--` se reenvía
literal al comando subyacente (comportamiento de pnpm 11.20.0, distinto de `npm run`,
confirmado por ejecución directa), lo que hace que jest interprete `--shard=N/4` como un
patrón de ruta de test en vez de una opción, matcheando 0 archivos, saliendo con código 1
("No tests found"). Las cuatro particiones de la matriz fallarían así en cualquier push a
`main`/`develop` o PR que toque paths de integración. El agregador `integration-gate` no
miente (reportaría `failure`, no un falso verde), pero el efecto práctico es que **la
compuerta de e2e queda permanentemente roja sin ejecutar un solo test real**, bloqueando
todo merge. Fix sugerido (no aplicado): quitar el `--` → `pnpm run test:e2e --shard=${{ matrix.shard }}/4` (verificado que reenvía correctamente).

### WARNING (deberían atenderse antes de archivar)

- **Árbol sin commitear con el fix de WARNING-A y el ajuste de G.5 en tasks.md.** Ambos
  cambios son correctos (verificados con ejecución real + mutación en las secciones 3 y 4
  de este reporte) pero no están comiteados. No se puede archivar sobre un árbol sucio.
  Alguien tiene que decidir si se comitean como parte de este change o se descartan
  intencionalmente — no es una decisión que le corresponda a esta fase de verify.
- **Frontend `npx tsc -b --noEmit` sigue en rojo** (exit 2), deuda preexistente no tocada
  por este change (confirmado, mismos 3 archivos que ronda 1). Sigue sin ticket propio.

### SUGGESTION

- El comentario nuevo de `mail-templates.ts:113` dice "C.2 de la ronda 14" — probablemente
  un cambio de nomenclatura entre rondas que quedó pegado (el resto del proyecto habla de
  "ronda 1"/"ronda 2" para sc-330). No afecta la lógica, pero puede confundir a quien lo lea
  después.

---

## Completeness

`tasks.md` (versión sin commitear, la que refleja el estado real del árbol): C.2 pasó de
"nuevo test" a "rebajado a WARNING por la auditoría de la ronda 1, bloque borrado" y G.5 se
ajustó para pedir sólo la caída de G.4. Ambos cambios de texto son consistentes con el
código verificado en las secciones 3 y 4. El resto de tareas ([x]) tiene evidencia
estructural y de ejecución consistente con lo reportado en ronda 1 (no re-verificado línea
por línea esta ronda, salvo los bloques tocados por el CRITICAL-1 y las 4 mutaciones de
arriba, conforme a la instrucción explícita de esta ronda de no re-tocar B/D/E/F/H).

---

## Qué queda abierto

1. **CRITICAL-CI**: sacar el `--` de `ci.yml:226` para que `pnpm run test:e2e` reciba
   `--shard=N/4` como opción, no como patrón de test. Sin esto, el particionado de CI que
   se agregó esta ronda no ejecuta ni un solo test e2e en el pipeline real.
2. Decidir qué hacer con el árbol sin commitear (WARNING-A resuelto + ajuste de G.5 en
   tasks.md): comitearlo como parte de este change (recomendado, ya está verificado y
   correcto) o descartarlo explícitamente.
3. Frontend `tsc -b --noEmit`: deuda preexistente, sigue sin ticket propio.

**Next recommended**: `sdd-apply` para corregir CRITICAL-CI (una línea) y decidir sobre el
árbol sin commitear, antes de reintentar `sdd-verify`. No archivar.
