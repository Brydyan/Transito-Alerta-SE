# Verify Report: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Ronda**: 3
**Rama verificada**: `brydyan/sc-330/mail-el-correo-de-verificacion-nunca-se-pudo`
**HEAD**: `3f3a6fa8bbf1bde0f3e261368b20e5344af90e6`
**Fecha**: 2026-09-06 / 2026-09-07
**Modo**: Standard (verificación por ejecución real + mutación, exigencia explícita del usuario)

**Nota de contexto (importante, y de desconfianza explícita)**: el arreglo del
CRITICAL-CI de esta ronda (`ci.yml:226`, commit `3f3a6fa`) lo escribió el orquestador —
la misma parte que ya se equivocó una vez en esta línea exacta durante la ronda 2, dejando
`pnpm run test:e2e -- --shard=N/4` con el `--` que rompía el paso de la bandera a jest. Esta
ronda auditó el segundo intento sin darle crédito por el primero: se ejecutó la línea
literal del YAML, no se leyó y se dio por buena. Ver sección 1.

**Estado del árbol**: `git status --short` idéntico antes y después de esta ronda —
sólo `apply-progress.md` sin commitear (cambio narrativo, sin código), que ya estaba así al
empezar. Ningún `.bak` quedó en el árbol tras las tres mutaciones de esta ronda.

---

## Veredicto

**PASS.** El CRITICAL-CI de la ronda 2 está cerrado de verdad, confirmado por ejecución
real de la línea literal del YAML (no por lectura) para las cuatro particiones, por
comparación de conjuntos (no de conteo) y por una corrida real completa de una partición
(no sólo `--listTests`). El borrado de `ENQUEUED_TEMPLATE_NAMES` (WARNING-A) no dejó nada
colgando, compila, y las dos afirmaciones de su comentario de reemplazo se comprobaron
independientes de lo que digan los reportes anteriores. La regresión de la suite unitaria
es exactamente la esperada (−1 test, el tautológico borrado) y ninguna otra. Las 8
compuertas exigidas cierran en los números objetivo. **0 CRITICAL, 0 WARNING nuevos.** Dos
WARNING preexistentes (árbol sin commitear, `tsc` de frontend) siguen abiertos pero no
bloquean.

---

## 1 — El arreglo de CI (commit `3f3a6fa`), auditado con desconfianza explícita

### 1.1 — Confirmar entorno: pnpm de CI == pnpm local

`backend/package.json` fija `"packageManager": "pnpm@11.20.0"`. `pnpm --version` local:
`11.20.0`. Misma versión que instalaría `pnpm/action-setup@v4` en el runner — no hay
discrepancia de entorno que invalide la prueba local, a diferencia del defecto de
`SMTP_HOST` de la ronda 1 (rojo en local, verde en CI por un `.env` gitignoreado).

### 1.2 — La línea literal del YAML, ejecutada para las cuatro particiones

`ci.yml:238` corre hoy `pnpm run test:e2e --shard=${{ matrix.shard }}/4` (sin `--`). Se
ejecutó tal cual, con `--listTests` apendizado sólo para inspeccionar sin pagar el costo de
una corrida completa cuatro veces:

```
$ pnpm run test:e2e --shard=1/4 --listTests   → 14 archivos
$ pnpm run test:e2e --shard=2/4 --listTests   → 14 archivos
$ pnpm run test:e2e --shard=3/4 --listTests   → 13 archivos
$ pnpm run test:e2e --shard=4/4 --listTests   → 13 archivos
```

Ninguna partición dio "No tests found". Las cuatro reciben `--shard=N/4` como opción, no
como patrón de ruta — el defecto de la ronda 2 (el `--` corrompiendo el parseo de yargs) no
reaparece.

### 1.3 — Comparación por conjuntos, no por conteo

```
npx jest --config ./test/jest-e2e.json --listTests   → 54 archivos (conjunto de referencia)
unión ordenada de shard1∪shard2∪shard3∪shard4        → 54 archivos
diff (conjunto completo, conjunto unión)             → vacío, SETS IDENTICAL
sort shard1..shard4 | uniq -d                         → vacío (cero repetidos entre particiones)
14 + 14 + 13 + 13                                     → 54 (cero de más, cero de menos)
```

La unión de las cuatro particiones es **exactamente** el conjunto completo — ni un archivo
de más, ni uno de menos, ni uno repetido entre particiones.

### 1.4 — Al menos una partición completa, de verdad (no `--listTests`)

```
$ pnpm run test:e2e --shard=2/4
Test Suites: 14 passed, 14 total
Tests:       113 passed, 113 total
Time:        141.813 s
```

14 suites reales ejecutadas y en verde, no una lista. Confirma que el fix no sólo hace que
jest *liste* el subconjunto correcto sino que lo *corre* y termina en verde.

### 1.5 — Revisión completa del YAML: `integration` + `integration-gate`

Sintaxis del job `integration` (líneas 157-238): matriz `shard: [1,2,3,4]`, `fail-fast:
false`, `defaults.run.working-directory: backend`, pasos idénticos al job `backend` salvo
el último (`pnpm run test:e2e --shard=${{ matrix.shard }}/4`, sin `--`). Bien formada, sin
errores de indentación ni de referencia a `matrix.shard`.

Agregador `integration-gate` (líneas 254-266):

```yaml
needs: integration
if: always()
steps:
  - run: |
      case "${{ needs.integration.result }}" in
        success|skipped) exit 0 ;;
        *)                exit 1 ;;
      esac
```

**Los cuatro estados posibles de `needs.integration.result`, y qué hace el agregador con
cada uno**:

| Estado de `integration` | Cuándo ocurre | Qué hace `integration-gate` |
|---|---|---|
| `success` | Las 4 particiones de la matriz pasaron | `exit 0` — verde, correcto |
| `skipped` | El job `integration` no corrió (PR sin paths de `integration`, `if` del job da falso) | `exit 0` — verde, correcto (no hay nada que probar) |
| `failure` | Al menos una de las 4 particiones falló (con `fail-fast: false`, GitHub Actions marca el resultado agregado de un job matriz como `failure` si cualquier combinación falla, aunque las demás terminen) | Cae al `*` → `exit 1` — rojo, correcto |
| `cancelled` | El job (o el workflow) se canceló antes de terminar | Cae al `*` → `exit 1` — rojo, correcto (falla cerrado, no abre una rendija) |

**Ningún camino deja al agregador en verde con una partición rota.** `if: always()` es
necesario y está presente — sin él, `integration-gate` heredaría el `skip` de `integration`
cuando el job de arriba no corre por su propio `if`, en vez de evaluar el `case`; con
`always()`, el step corre siempre y el `case` decide, incluyendo el camino `skipped` (que
si no fuera por `always()` dejaría a `integration-gate` como "skipped" también — un check
requerido que se salta bloquea igual, así que el resultado final es el mismo, pero la ruta
por la que se llega importa para no romperlo por accidente en un futuro edit).

**Veredicto parcial: CRITICAL-CI CERRADO, con evidencia real, por conjuntos y por ejecución
completa de al menos una partición. El agregador es correcto en los cuatro estados
posibles.**

---

## 2 — El borrado de WARNING-A: ¿no se llevó nada por delante?

### 2.1 — Imports colgando

```
$ grep -rn "ENQUEUED_TEMPLATE_NAMES" backend/src backend/test
(sin resultados)
```

Cero referencias colgando. `mail-templates.spec.ts` ya no importa el símbolo (confirmado
leyendo el diff del commit `3f3a6fa`: `import { ENQUEUED_TEMPLATE_NAMES, renderMailTemplate }`
pasó a `import { renderMailTemplate }`).

### 2.2 — ¿Compila?

`npx tsc --noEmit` → exit 0, sin errores (ver compuertas). Confirmado independiente de lo
que diga cualquier reporte anterior.

### 2.3 — Las dos afirmaciones del comentario de `mail-templates.ts:110-122`, comprobadas una por una

El comentario que reemplazó a `ENQUEUED_TEMPLATE_NAMES` afirma dos cosas:

**Afirmación 1**: "la cobertura la garantiza `Record<TemplateName, TemplateFn>` al
compilar". **Comprobado por mutación** (no por lectura del tipo): se quitó la entrada
`'email_verification'` de `TEMPLATES` dejando el nombre en el union `TemplateName`
(backup con `cp`, restaurado después con `mv`):

```
npx tsc --noEmit
→ src/modules/mail/templates/mail-templates.ts(41,7): error TS2741:
  Property 'email_verification' is missing in type '{ ... }' but required
  in type 'Record<TemplateName, TemplateFn>'.
```

`TS2741` exactamente como afirma el comentario, en la línea de la declaración de
`TEMPLATES` (41). **Verdadera.**

**Afirmación 2**: "el caso runtime vive en `mail-outbox.consumer.spec.ts`". **Comprobado
por dos vías**:

1. El test existe donde el comentario dice: `grep -n "sends an unknown template straight
   to mail:dead" backend/src/modules/mail/mail-outbox.consumer.spec.ts` → línea 133.
2. **Tiene red real, no es un nombre de test vacío**: se rompió la detección en el
   consumidor (`mail-outbox.consumer.ts:154`,
   `(err as Error).message?.startsWith('Unknown mail template')` → cambiado a una cadena
   que nunca matchea, backup con `cp`, restaurado con `mv`):

```
npx jest src/modules/mail/mail-outbox.consumer.spec.ts
→ 1 failed / 8 passed / 9 total
● sends an unknown template straight to mail:dead (data defect)
    expect(jest.fn()).toHaveBeenCalledWith(...)
    Number of calls: 0
```

Cayó exactamente el test que el comentario nombra. **Verdadera.**

Ninguna de las dos afirmaciones se aceptó por lectura del reporte de la ronda 2 — ambas se
re-verificaron desde cero esta ronda, independientemente.

**Veredicto parcial: el borrado no dejó nada colgando, compila, y las dos afirmaciones del
comentario de reemplazo son ciertas y están comprobadas por mutación, no por lectura.**

---

## 3 — Regresión: ¿el borrado bajó la cobertura real?

```
Backend unit (ronda 2, con el borrado sin commitear):  111 suites / 1024 tests
Backend unit (ronda 3, con el borrado commiteado):     111 suites / 1023 tests
```

**Diferencia: −1 test, 0 suites.** Explica exactamente: `mail-templates.spec.ts` pasó de 15
a 14 tests con el borrado del único `describe`/`it` de C.2 (el bloque tautológico completo
era un solo `it` dentro de un `describe` propio — un test, no varios). El número de suites
no cambió porque el archivo sigue existiendo con el resto de sus tests (A.5, invitation,
password-reset, existing_account_attempt). **No bajó más de lo que se borró: la
regresión es exactamente 1:1 con el test eliminado, sin efectos colaterales en ninguna otra
suite.**

---

## Compuertas

| Compuerta | Resultado | Detalle |
|-----------|-----------|---------|
| backend `npx tsc --noEmit` | ✅ exit 0 | Sin errores |
| backend `pnpm run lint` | ✅ exit 0, 24 warnings | Idéntico a la línea base (mismos 6 archivos, mismo patrón `no-explicit-any`) |
| backend `nest build` | ✅ exit 0 | |
| backend unit (jest) | ✅ **111 suites / 1023 tests**, 0 fallos, 23.3s | −1 test vs. ronda 2 (1024), explicado en full por el borrado del tautológico C.2 |
| backend e2e SUBCONJUNTO (6 archivos) | ✅ **6/6 suites, 27/27 tests**, 86.9s | Sin override manual de `SMTP_HOST`, idéntico a ronda 2 |
| backend e2e COMPLETO (54 archivos) | ✅ **54/54 suites, 470/470 tests**, 638.6s | Objetivo cumplido exactamente: 54/54 y 470/470 |
| frontend `npx tsc -b --noEmit` | ❌ exit 2 (preexistente, no de este change) | Mismos 3 archivos que rondas 1-2: `auth.service.spec.ts:227`, `placeholder.component.spec.ts`, `layout-tokens.regression.spec.ts` — ninguno tocado por commits de MAIL |
| frontend unit (jest) | ✅ **60 suites / 415 tests**, 0 fallos, 4.6s | Idéntico a ronda 2 |
| frontend build | ✅ exit 0 | `ng build`, bundle generado sin errores |

**CI e2e (particionado), verificado esta ronda**: unión de 4 particiones == 54/54 archivos
del `--listTests` completo, comparado por conjuntos (diff vacío, `uniq -d` vacío,
14+14+13+13=54). Al menos una partición (2/4) corrida de verdad: 14/14 suites, 113/113
tests, verde. Ninguna partición dio "No tests found".

---

## Mutaciones de esta ronda — resumen

| # | Mutación | Archivo | Test(s)/verificación que cayó | Restaurado |
|---|----------|---------|----------------------|------------|
| 1 | Quitar la entrada `'email_verification'` de `TEMPLATES`, dejando el nombre en el union `TemplateName` | `mail-templates.ts` | `npx tsc --noEmit` → `TS2741` en línea 41 (no un test runtime — el typecheck es la primera barrera) | ✅ (`mv` desde `.bak`) |
| 2 | Romper el `startsWith('Unknown mail template')` del consumidor (cambiado a una cadena que nunca matchea) | `mail-outbox.consumer.ts` | `sends an unknown template straight to mail:dead (data defect)` (`mail-outbox.consumer.spec.ts`) | ✅ (`mv` desde `.bak`) |
| 3 | Ejecutar la línea literal de `ci.yml:238` para las 4 particiones (verificación positiva, no mutación de regresión) | invocación directa, no archivo | N/A — confirma que las 4 particiones listan y una corre de verdad, sin "No tests found" | N/A (no tocó archivos) |

`git status --short` idéntico antes y después de las mutaciones 1-2 (sólo el
`apply-progress.md` preexistente sin commitear). Ningún `.bak` quedó en el árbol — ambos se
restauraron con `mv` sobre el archivo original.

---

## Issues Found

### CRITICAL (bloquean el archivado)

Ninguno.

### WARNING (deberían atenderse antes de archivar)

- **Árbol sin commitear**: `apply-progress.md` tiene un diff narrativo sin commitear
  (actualiza fechas, rama, y resume los commits `3f3a6fa`/`e50814c`/`9581104`). No es
  código — no afecta ninguna compuerta ni comportamiento — pero técnicamente sigue siendo
  un árbol no limpio. Recomendado: commitearlo antes de archivar, o el propio `sdd-archive`
  puede absorberlo como parte del cierre.
- **Frontend `npx tsc -b --noEmit` sigue en rojo** (exit 2), deuda preexistente no tocada
  por este change (confirmado otra vez, mismos 3 archivos que rondas 1-2). Sigue sin
  ticket propio.

### SUGGESTION

- El comentario de `mail-templates.ts:113` dice "C.2 de la ronda 14" — nomenclatura de una
  convención de rondas anterior a sc-330 que quedó pegada. No afecta la lógica; ya señalado
  en la ronda 2, sigue sin corregirse, pero no bloquea.

---

## Completeness

`tasks.md`: C.2 documentado como rebajado a WARNING y borrado (consistente con el código),
C.3 documentado como verificado por typecheck en vez de test runtime (consistente con la
mutación 1 de esta ronda), G.5 aclarado para pedir sólo la caída de G.4 (no re-verificado
esta ronda — fuera del alcance del material nuevo, sigue en pie desde la ronda 2 con
evidencia de mutación propia). El resto de bloques (B, D, E, F, H) no se re-tocó esta ronda,
conforme al alcance explícito del material nuevo a auditar.

---

## Qué queda abierto

1. Decidir si commitear el diff narrativo de `apply-progress.md` como parte de este change
   antes de archivar (recomendado, no bloqueante).
2. Frontend `tsc -b --noEmit`: deuda preexistente, sigue sin ticket propio.

**Next recommended**: `sdd-archive`. El change está listo para archivarse: 0 CRITICAL, 0
WARNING nuevos, todas las compuertas objetivo cumplidas, y el material nuevo de esta ronda
(el arreglo de CI y el borrado de WARNING-A) auditado con evidencia de ejecución real y
mutación, sin darle crédito al autor del fix.
