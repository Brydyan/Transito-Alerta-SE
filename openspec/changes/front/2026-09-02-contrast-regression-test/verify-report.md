# Verification Report

**Change**: `2026-09-02-contrast-regression-test`
**Story**: sc-324
**Version**: N/A (openspec)
**Mode**: Strict TDD

---

# ▶ RONDA 2 — 2026-09-03 (esta pasada)

**Veredicto: PASS.** 0 CRITICAL, 0 WARNING, 1 SUGGESTION (pre-existente, no bloqueante) + 1 SUGGESTION nueva (cosmética).

Contexto limpio, verificación desde cero contra el contrato completo (no sólo la lista de
`fixes-required.md` de ronda 1). Todo lo que sigue es evidencia propia de esta pasada —
ejecuté los comandos, no confié en `apply-progress.md`.

## Estado del árbol (sin commitear, verificado contra working tree, no HEAD)

```
 M frontend/src/app/shared/components/ui-badge/ui-badge.component.ts
 M frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.spec.ts
 M frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts
 M frontend/src/styles/_variables.css
 M openspec/changes/front/2026-09-02-contrast-regression-test/tasks.md
?? frontend/src/app/shared/components/contrast.regression.spec.ts
```

## Gates — ejecutados de nuevo, no reusados de round 1

```
rtk jest                            → PASS (217) FAIL (0)
rtk jest contrast.regression.spec.ts → PASS (25) FAIL (0)
npx tsc -b tsconfig.json --noEmit   → exit 2 (errores preexistentes, ver C2 abajo)
rtk npm run build                   → verde, 3.558s, sin warnings
git diff --stat backend/ database/ openspec/specs/ → vacío
```

## C1 (round 1) — CERRADO, verificado con lectura de código, no de prosa

`fixes-required.md` R1 pedía: declarar un token propio "texto sobre color sólido"
(`--color-fg-on-solid` o similar, `#FFFFFF` explícito, independiente del lienzo) — ésa era
la alternativa preferida sobre el literal inline.

Verifiqué en `frontend/src/styles/_variables.css:59`:
```css
--color-fg-on-solid: #FFFFFF;
```
con comentario explícito de que es intencionalmente independiente de `--color-bg-secondary`
y que documenta que `text-white` de Tailwind resuelve al mismo valor.

Verifiqué en `contrast.regression.spec.ts:244,248,251,252,254` que los 5 pares
(`BADGE_PAIRS.critical`, `KPI_PAIRS.brand/red/slate/violet`) ahora usan
`textToken: 'fg-on-solid'`, no `'bg-secondary'`.

**Verifiqué que el arreglo no movió el sujeto de la medición**: `ui-badge.component.ts` y
`ui-kpi-card.component.ts` siguen emitiendo la clase Tailwind `text-white` sin cambios —
confirmé con `git diff` que el único cambio en esos dos archivos es de comentarios (61 líneas
en `ui-kpi-card.component.ts`, todas documentación; 15 líneas en `ui-badge.component.ts`,
mismo patrón). El fix tocó el TEST (qué token lee) y el TOKEN (uno nuevo, dedicado), no el
COMPONENTE. Es exactamente la corrección correcta: si hubiera cambiado los tokens que
consume el componente para que el par pasara, eso habría sido "cambiar el sujeto para que
la medición pase" — no fue el caso.

**Residual conocido, no bloqueante**: `--color-fg-on-solid` es honesto sobre ser una
constante dedicada (no un alias prestado), pero sigue existiendo una dependencia implícita
de que Tailwind v4 mantenga `text-white` = `#FFFFFF` (paleta stock, no personalizable sin
config extra — hecho verificado en la ronda 1 y no cambiado desde entonces). Es el mismo
techo que design.md aceptó al rechazar la lectura del DOM vía jsdom (D1, alternativa
rechazada). No hay nada mejor disponible sin herramientas nuevas fuera de alcance.

D1 en `Coherence` pasa de "⚠️ Deviated (partial)" a "✅ Yes" — el test ahora mide un token
real y dedicado de `_variables.css`, ninguno de los 15 pares usa un proxy prestado.

## C2 (round 1) — CERRADO, gate real reejecutado

`tasks.md:8-11` y `:87-90` ahora documentan `npx tsc -b tsconfig.json --noEmit` como el
comando y explican por qué `-p` sin `-b` es un falso negativo (confirmado empíricamente en
esta pasada también: `-p` da exit 0 con 0 archivos revisados via `--listFiles`, no repetido
acá porque ya está protocolizado en round 1, pero el comando correcto SÍ se re-ejecutó).

Re-corrí `npx tsc -b tsconfig.json --noEmit` desde cero en esta pasada: **exit 2**, 15
errores en 4 archivos:
- `auth.interceptor.regression.spec.ts` (3: `node:fs`, `node:path`, `__dirname`)
- `auth.service.spec.ts:227` (1: `TS2345`, no relacionado, preexistente)
- `layout-tokens.regression.spec.ts` (4: `node:fs`, `node:path`, `__filename`, `__dirname`)
- `sidebar.spec.ts` (3: `node:fs/promises`, `node:path`, `__dirname`)
- `contrast.regression.spec.ts:24,25,167` (3: `node:fs`, `node:path`, `__dirname`)

Los 3 errores de `contrast.regression.spec.ts` son **el mismo patrón exacto** (falta
`@types/node` en `tsconfig.spec.json`) que ya tenían los otros 3 archivos de regresión antes
de este change. **No hay ningún error nuevo, de ningún tipo, introducido por este change.**
El gate ahora es real (detecta 15 errores reales en vez de fingir 0), y lo que detecta en el
árbol de este change es exactamente lo declarado: herencia del hueco preexistente, no
regresión nueva. Esto satisface lo pedido: "que la compuerta ahora sea real" — no exige
arreglar `@types/node` en todo el repo, que está fuera de alcance de sc-324.

## W1 (round 1) — CERRADO

`apply-progress.md:9-36` tiene la tabla "TDD Cycle Evidence" con columnas
Tarea/RED/GREEN/TRIANGULATE/SAFETY NET/REFACTOR, una fila por tarea T1.1–T6.4, más filas C1/
C2/W3 documentando las correcciones de ronda 2 en el mismo formato narrativo-por-columna.
Formato presente, no sólo sustancia.

## W2 (round 1) — CERRADO

`tasks.md` tiene 28/28 checkboxes en `[x]`. Confirmé con `git diff` que el cambio real
existe (no es un artefacto de lectura stale): 35 líneas con `- [ ]` → `+ [x]`.

## W3 (round 1) — CERRADO, con matiz sobre el pedido de "recalcular"

El pedido era recalcular las cifras que hubiera y no asumir que Minimax las corrigió bien.
Lo que encontré: el bloque D10 en `_variables.css:61-70` ya **no contiene ninguna cifra
puntual** — las 6 razones (`9.5 ✓`, `6.5 ✓`, etc.) fueron reemplazadas por una referencia al
umbral y al spec ejecutable, igual que en los otros 4 archivos de D4. No hay números que
recalcular porque no quedan números — la corrección fue retirarlos, no corregirlos, que es
justamente lo que D4 pide ("citar el umbral, no el valor") y lo que W3 original recomendaba
como arreglo ("extendé la limpieza de D4 a este bloque").

## Regla de F6 — specs existentes sin editar aserciones

Verifiqué con `git diff` línea por línea:
- `ui-badge.component.spec.ts`: no aparece en `git status` — cero modificaciones.
- `ui-kpi-card.component.spec.ts`: diff de 13 líneas, las 13 son comentarios/JSDoc. El
  `CONTRACT` (línea 29-43), `ALLOWED_CLASS_PREFIXES`, `FORBIDDEN_CLASS_PREFIXES` y las 7
  `it.each` con sus `expect(...)` están byte-idénticos al `HEAD` anterior a esta ronda —
  sólo cambiaron comentarios en las líneas 4-17 y 37.
- `_variables.css`: diff de 19 líneas — 12 son el bloque nuevo `--color-fg-on-solid` (no
  toca ningún valor existente), 7 son el reemplazo de cifras por prosa en el comentario D10.
  Ningún `--color-*` existente cambió de valor.

Ningún comportamiento cambió — sólo texto de comentarios y un token nuevo aditivo. F6
respetado.

## Prueba de mutación — repetida en esta pasada, no confiada al reporte

Bajé `--color-on-tint-green` de `#065F46` a `#A7F3D0` en `_variables.css`, corrí
`rtk jest contrast.regression.spec.ts`:

```
PASS (23) FAIL (2)
1. resuelto: status-resuelto (α=0.15) vs on-tint-green — Received: 1.1166506254876671
2. low: prio-low (α=0.15) vs on-tint-green — Received: 1.1166506254876671
```

Falla exactamente en los dos consumidores del token, con la razón calculada (no un mensaje
genérico). Revertí manualmente (no con `git checkout`, con `sed` inverso) y confirmé
`git diff --stat -- frontend/src/styles/_variables.css` volvió a mostrar sólo el diff
original de esta ronda (12+/7- del token nuevo + limpieza D10) — cero rastro de la mutación.
Re-corrí: `PASS (25) FAIL (0)`. El test mide de verdad y detecta de verdad.

## Cobertura de las 8 variantes de `ui-badge` y los 6 `on-tint-*` de F0/D10

`BADGE_PAIRS` (contrast.regression.spec.ts:236-245) cubre las 8 variantes vía
`Record<UiBadgeVariant, ContrastPair>` (garantía de compilación). Los `textToken` usados
cubren los 6 tokens `on-tint-*` declarados en `_variables.css:71-76`: `on-tint-slate`,
`on-tint-violet`, `on-tint-green` (reusado en `resuelto` y `low`, dos consumidores reales
del mismo token, ambos medidos independientemente), `on-tint-graphite`, `on-tint-amber`,
`on-tint-red`. Los 6 están cubiertos, ninguno queda sin par.

## Mezcla de alfa sobre el color compuesto

`resolveEffective()` (líneas 173-186): `bg = alpha < 1 ? blend(bgRaw, alpha, bg-secondary) :
bgRaw`. Confirmé que el `it.each` de T4.1/T4.2 llama `resolveEffective(pair)` y mide
`contrastRatio(bg, text)` sobre el resultado compuesto, no sobre `bgRaw` directo. El test
`T4: el fondo tintado se compone antes de medir` (líneas 316-350) además afirma
explícitamente `plainRatio).not.toBeCloseTo(composedRatio, 1)` — verificación positiva de
que blend cambia el resultado, no sólo que existe la función.

---

### Issues Found (round 2)

**CRITICAL**: Ninguno.

**WARNING**: Ninguno.

**SUGGESTION**:
1. **S1 (persiste de round 1, no bloqueante)** — `T3.3` sigue duplicando a mano la lista de
   variantes (`contrast.regression.spec.ts:259-268` y `:274-282`) junto al
   `Record<UiBadgeVariant/UiKpiTone, …>` que ya fuerza la completitud en compilación. No
   crea un hueco silencioso. Sin cambios desde round 1 — sigue siendo opcional.
2. **S2 (nueva, cosmética)** — `contrast.regression.spec.ts:226` tiene un carácter CJK
   incrustado en un comentario en español: `"el sistema de tipos no podría阻止 sin
   Record<…, …>"`. Aparenta ser un artefacto de encoding/copy-paste (probablemente debía
   decir "no podría impedir"). No afecta la compilación ni la ejecución — es sólo un
   comentario — pero vale limpiarlo si se vuelve a tocar el archivo.

---

### Verdict (round 2)
**PASS.** Los 2 CRITICAL de round 1 están cerrados con evidencia propia (no narrativa de
`apply-progress.md`): el token `fg-on-solid` es real, dedicado, y no movió el sujeto de la
medición a los componentes; el gate de typecheck corregido (`-b`) es real, detecta errores
reales, y los 3 que hereda `contrast.regression.spec.ts` son el mismo patrón preexistente ya
presente en 3 archivos hermanos, sin ningún error nuevo. Los 3 WARNING de bookkeeping/
documentación (W1, W2, W3) están cerrados y verificados con `git diff`, no con lectura de
prosa. Repetí la prueba de mutación de forma independiente y el test sigue detectando de
verdad. Sin regresiones en los specs existentes de `ui-badge`/`ui-kpi-card` (sólo
comentarios tocados, cero cambios de aserciones). Queda 1 SUGGESTION heredada (S1, opcional)
y 1 SUGGESTION nueva cosmética (S2, un carácter CJK perdido en un comentario) — ninguna
bloquea el archivo.

---
---

# ▶ RONDA 1 — 2026-09-02 (histórico, preservado)

**Working tree**: verified uncommitted (not HEAD) — 3 modified + 1 new source file + 1 new artifact

---

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 28 |
| Tasks complete (checked in tasks.md) | 0 |
| Tasks incomplete (checked in tasks.md) | 28 |
| Tasks complete (independently verified in code/tests) | 28 |

`tasks.md` has zero `[x]` — pure bookkeeping gap (see W2). Independently verified all 6
task groups (T1-T6) are actually implemented and gates pass; this is a paperwork issue,
not missing work.

---

### Build & Tests Execution

**Build**: ✅ Passed (`rtk npm run build`, 3.756s, no warnings)

**Tests**: ✅ 217 passed / 0 failed / 0 skipped (`npx jest`, baseline was 192, +25 new,
none broken). `contrast.regression.spec.ts` alone: 25/25 passed, 1s.

Live regression check (reproducing T4.4 myself, not trusting the report): lowered
`--color-on-tint-green` from `#065F46` to `#A7F3D0` in `_variables.css`, re-ran —
2 failures exactly on `resuelto` and `low` (the two consumers of that token),
`Received: 1.1166506254876671` vs `Expected: >= 4.5`. Reverted; `git diff --stat` on
`_variables.css` came back empty. **The test genuinely measures, and genuinely
detects.**

**Coverage**: `ui-badge.component.ts` 100%/100%/100%/100%, `ui-kpi-card.component.ts`
100%/100%/100%/100% (statements/branch/funcs/lines). No threshold configured in
`jest.config.js`.

**Typecheck — CRITICAL finding (see C2)**: the mandated command
(`npx tsc --noEmit -p tsconfig.json`, tasks.md:85) checks **zero files** and always
exits 0 because `tsconfig.json` has `"files": []` and only `"references"` (project-
references mode, requires `-b`). Real command (`npx tsc -b tsconfig.json --noEmit`)
exits **2**, with pre-existing repo-wide errors (missing `@types/node`) that
`contrast.regression.spec.ts` inherits rather than exposes.

**Linter**: ➖ Not available — no `eslint` config or `npm run lint` script in `frontend/`.

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ Partial | Narrative evidence present in `apply-progress.md`, but no formal "TDD Cycle Evidence" table (see W1) |
| All tasks have tests | ✅ | `contrast.regression.spec.ts` covers T1-T4; T5/T6 are cleanup/gates, not test-bearing tasks |
| RED confirmed (tests exist) | ✅ | File exists, 25 tests, verified by direct execution |
| GREEN confirmed (tests pass) | ✅ | 25/25 pass on current tree |
| Triangulation adequate | ✅ | 8 badge + 7 KPI + 3 alpha-composition + 5 formula-validation cases — real variance in expected values, not repeated trivial asserts |
| Safety Net for modified files | ✅ | `ui-badge.component.spec.ts` (0 modifications, ran clean), `ui-kpi-card.component.spec.ts` (comment-only diff, assertions/CONTRACT untouched — confirmed via `git diff`) |

**TDD Compliance**: 5/6 checks fully passed (1 partial — format, not substance)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 25 | 1 (`contrast.regression.spec.ts`) | Jest, pure functions + `fs.readFileSync` on real CSS |
| Integration | 0 (new) | 0 | Angular TestBed (pre-existing, unmodified specs) |
| E2E | 0 | 0 | Playwright (not applicable) |
| **Total (new)** | **25** | **1** | |

---

### Changed File Coverage
| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `ui-badge.component.ts` | 100% | 100% | — | ✅ Excellent |
| `ui-kpi-card.component.ts` | 100% | 100% | — | ✅ Excellent |
| `contrast.regression.spec.ts` | n/a (test file) | — | — | — |

**Average changed file coverage**: 100%

---

### Assertion Quality
✅ All assertions in `contrast.regression.spec.ts` verify real behavior — real WCAG math
computed from CSS parsed at runtime, not class names or snapshot strings. No
tautologies, no ghost loops (collections are compile-time non-empty via
`Record<UiBadgeVariant/UiKpiTone, …>`), no mock usage, no smoke-test-only patterns.
Live-verified the test actually fails when the underlying token is wrong (see Tests
section above) — this is the opposite of the SC-209 pattern (asserting on the wrong
surface); here the assertion computes the real composited color and its real ratio.

One structural caveat, not an assertion-quality defect per se: see **C1** below — 5/15
pairs source one input (`textToken: 'bg-secondary'`) from a token that is not actually
wired to the CSS class the component renders (`text-white`). The math executed is real;
the *input* for those 5 pairs is a semantically-mismatched proxy.

**Assertion quality**: 0 CRITICAL (banned-pattern sense), 0 WARNING — but see C1 for a
structural/architectural finding on 5 of the 15 pairs.

---

### Quality Metrics
**Linter**: ➖ Not available (no eslint config/script in `frontend/`)
**Type Checker**: ❌ 2 errors relevant to changed scope when invoked correctly (see C2) — 0 errors reported by the (broken) mandated gate

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Contraste verificado automáticamente | cada par declarado alcanza el umbral | `contrast.regression.spec.ts > T4: ui-badge (8) / T4: ui-kpi-card (7)` | ✅ COMPLIANT (see C1 note: literal wording satisfied — value comes from a token, not a hardcoded literal — but 5/15 pairs use a semantically mismatched token) |
| Contraste verificado automáticamente | una variante sin declarar rompe el test | `Record<UiBadgeVariant/UiKpiTone, ContrastPair>` (compile-time) + `T3: completitud de la tabla de pares` (runtime) | ✅ COMPLIANT — verified live: widened `UiBadgePriority` with a `'blocked'` member, real build (`tsc -b`) failed with `TS2741: Property 'blocked' is missing`; reverted, confirmed clean |
| Contraste verificado automáticamente | el fondo tintado se compone antes de medir | `T4: el fondo tintado se compone antes de medir` (3 tests) + `resolveEffective()` used by all tinted pairs | ✅ COMPLIANT |
| Contraste verificado automáticamente | cambiar un token cambia el resultado del test | (reproduced live, see Tests section) | ✅ COMPLIANT — independently reproduced, not just trusted from apply-progress |
| Contraste verificado automáticamente | la fórmula está validada contra referencias conocidas | `T2: la fórmula está validada...` (5 tests) | ✅ COMPLIANT |
| Cifras no documentadas en comentarios | ningún primitivo cita una razón puntual | grep over `ui-badge/` + `ui-kpi-card/` (0 matches, verified independently) | ✅ COMPLIANT (spec scope is these 2 dirs only — `_variables.css` has stale figures but is out of the scenario's literal scope, see W3) |

**Compliance summary**: 6/6 scenarios compliant by literal spec wording; 1 carries a
structural caveat (C1) that satisfies the letter but undermines the intent of D1.

---

### Correctness (Static — Structural Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Parser reads `_variables.css`, no hardcoded hex | ✅ Implemented | `parseThemeTokens` walks `@theme`, resolves single-level aliases, throws on unresolvable/multi-level — matches D1 |
| Alpha blend composes over `bg-secondary`, not literal white | ✅ Implemented | `blend()` + `resolveEffective()` use `tokens['bg-secondary']`, matches D3 |
| Completeness guard (compile + runtime) | ✅ Implemented | `Record<...>` + T3 tests; live-verified the compile-time half |
| Formula self-validated before real assertions | ✅ Implemented | T2 describe block precedes T3/T4 in file order and Jest execution order |
| Comments stripped of point figures (4 files) | ✅ Implemented | grep-verified 0 matches in the 4 scoped files |
| `text-white` pairs sourced from a real rendered-color proxy | ⚠️ Partial | Uses `bg-secondary` token instead of a dedicated white/foreground token — see C1 |

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — reads from `_variables.css`, no hardcoded hex | ⚠️ Deviated (partial) | True for 10/15 pairs; for 5/15 (`text-white` pairs) the actual rendered color is a Tailwind stock literal that isn't wired to any `_variables.css` token at all — the test measures a coincidentally-equal proxy instead. This is a genuine gap against D1's own stated guarantee ("el test mide lo que el navegador pinta"), not addressed anywhere in `design.md`. Documented by the implementer as a deviation in `apply-progress.md` ("Desviaciones respecto al design.md") but not resolved. |
| D2 — completeness enforced at compile time | ✅ Yes | Live-verified |
| D3 — alpha blend computed over `bg-secondary`, not literal white | ✅ Yes | |
| D4 — cite threshold, not value | ✅ Yes (scoped files) | `_variables.css` comment block still has stale values — out of D4's literal file scope but same defect class, see W3 |
| Tasks T6.2 tooling rule ("npx tsc crudo, sin rtk") | ⚠️ Deviated | The rule correctly avoids `rtk tsc`'s known false negative, but the specific invocation chosen (`-p` without `-b`) is itself a false negative for an unrelated reason (project references). See C2. |

---

### Issues Found (round 1)

**CRITICAL** (must fix before archive):
1. **C1** — 5 of 15 pairs (`ui-badge:critical`, `ui-kpi-card:brand/red/slate/violet`)
   measure `--color-bg-secondary` as a proxy for `text-white`, which is a Tailwind stock
   color not wired to any `_variables.css` token. Violates D1's guarantee that "el test
   mide lo que el navegador pinta." `contrast.regression.spec.ts:242,246,249,250,252`.
2. **C2** — The mandated typecheck gate (`npx tsc --noEmit -p tsconfig.json`,
   `tasks.md:85`) checks 0 files and always exits 0 due to `tsconfig.json`'s
   project-references structure (`"files": []`). Real command is
   `npx tsc -b tsconfig.json --noEmit`, which exits 2 on the current tree (pre-existing,
   repo-wide `@types/node` gap that `contrast.regression.spec.ts` inherits). The gate this
   project adopted specifically to avoid a repeat of F0's false-negative typecheck
   (R3.1) is itself giving a false negative.

**WARNING** (should fix):
1. **W1** — `apply-progress.md` lacks the mandatory "TDD Cycle Evidence" table required
   by Strict TDD Mode (substance is present in prose, format is not).
2. **W2** — `tasks.md` has 0/28 items checked despite the work being complete and
   independently verified.
3. **W3** — `_variables.css:58-63` still documents 6 point contrast figures, all of which
   are now wrong when recalculated with this change's own formula (off by up to ~1.7).
   Out of the literal scope of T5.1/T5.2 and the delta spec's scenario, but the same
   defect class this change exists to eliminate.

**SUGGESTION** (nice to have):
1. **S1** — `T3.3`'s completeness check duplicates the variant list by hand
   (`expected` array) alongside the `Record<...>` type declaration. Not a silent gap
   (mismatch still fails the test), just a second place to maintain.

---

### Verdict (round 1)
**FAIL** — 2 CRITICAL findings block archive.

The core engineering is genuinely strong: real WCAG math from parsed CSS (not
class-name/string assertions), a live-reproduced detection test (T4.4), a live-verified
compile-time completeness guard (D2), and comment cleanup that's actually clean in its
declared scope. But C1 undermines the change's own central promise (D1) for a third of
the pairs it certifies, and C2 means the "typecheck green" evidence in this change's own
DoD is not real evidence — both are exactly the class of "false green with authority"
defect this change was written to prevent elsewhere in the system.
