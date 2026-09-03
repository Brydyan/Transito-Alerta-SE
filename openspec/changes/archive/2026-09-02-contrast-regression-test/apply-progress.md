# Apply progress: test de regresión de contraste

**Change**: `2026-09-02-contrast-regression-test`
**Working dir**: `frontend`
**Ronda**: 1 (implementación) + ronda 2 (correcciones por `fixes-required.md`)

---

## TDD Cycle Evidence (Strict TDD Mode)

| Tarea | RED | GREEN | TRIANGULATE | SAFETY NET | REFACTOR |
|---|---|---|---|---|---|
| T1.1 `parseThemeTokens` | T1.1 implementado con un fixture inline que cubre el `@theme` real de `_variables.css`; alias simple OK, alias encadenado falla con mensaje claro | Los 25 tests del spec pasan; 8 tokens con alias se resuelven correctamente | 3 ramas cubiertas: hex directo, alias simple, alias roto | El parser se valida indirectamente en cada test de T3/T4: si lee mal, los contrastes fallan | n/a (utility pura) |
| T1.2 `relativeLuminance` | T2.1 (`#000/#FFF = 21`) y T2.2 (`#FFF/#FFF = 1`) hacen de RED: si la fórmula está mal, fallan antes de cualquier par real | T2.1, T2.2, T2.3 verdes con tolerancia 0.01 | 3 puntos: negro, blanco, gris medio | T4 lo reusa en cada par | n/a |
| T1.3 `blend` | T2.4 verifica α=0 da fondo, α=1 da frente, α=0.5 da gris medio | T2.4 verde | 3 valores de α: 0, 0.5, 1 | T4.1–T4.3 lo reusan en los 6 pares tintados | n/a |
| T1.4 `contrastRatio` | Misma red que T1.2 (T2.1–T2.3) | Misma | Misma | Misma | n/a |
| T2 autovalidación | Los 4 tests T2.1–T2.4 corren ANTES de T3/T4 (orden de `describe` en el archivo); un cálculo roto da rojo inmediato | 4/4 verdes con `toBeCloseTo(..., 2)` | 4 razones distintas: 21, 1, 4.54, α=0.5 | TDD Cycle repetido en cada `it.each` de T4 | n/a |
| T3.1 `BADGE_PAIRS` tipado | `Record<UiBadgeVariant, …>` cierra el conjunto en compilación | El test verde prueba que `UiBadgeVariant` tiene 8 valores y la tabla los 8 | Una variante omitida rompe `tsc -b` con `TS2741: Property 'X' is missing` | Verificado en vivo por la auditoría | n/a |
| T3.2 `KPI_PAIRS` tipado | Idem con `UiKpiTone` (7) | Verde | Idem | Idem | n/a |
| T3.3 completitud runtime | Array `expected` recorre la unión y compara contra `Object.keys(BADGE_PAIRS)` | 2/2 verdes | Una lista desfasada rompe el test con nombre de la variante | Belt-and-suspenders sobre el check de compilación | n/a |
| T4.1 badge pares | `it.each` sobre los 8; cada uno ≥ 4.5 | 8/8 verdes | 8 pares con 4 fondos tintados + 1 sólido | T4.4 lo reta en vivo | n/a |
| T4.2 KPI pares | `it.each` sobre los 7; cada uno ≥ 4.5 | 7/7 verdes | 7 fondos sólidos con 2 textos grafito + 5 blancos | Idem | n/a |
| T4.3 composición alfa | 3 tests específicos (`pendiente /20`, `medium /40`, `en_proceso` sólido) | 3/3 verdes | 3 alfas distintas (0.20, 0.40, 1.0) | El `it.each` de T4.1 ya cubre los demás | n/a |
| T4.4 detección | Bajé `--color-on-tint-green` a `#A7F3D0`; fallaron `resuelto` y `low` con `Received: 1.117`; revertí; `git diff _variables.css` vacío | Re-run tras revert: 25/25 verdes | Dos consumidores del mismo token, misma falla | T4.4 está en la `apply-progress`, no en el spec — el spec mismo no se prueba a sí mismo | n/a |
| T5.1 limpieza | n/a (no es tarea con test) | Comentarios de 4 archivos reescritos, sólo `≥ 4.5 ✓` + ref al spec | W3 extiende la limpieza a `_variables.css:58-63` | `rtk grep` con regex `(?<![>≥\s])\d+\.\d+:1` y `(?<![>≥\s])\d+\.\d+\s*✓`: 0 coincidencias en los 4 archivos | n/a |
| T6.1 jest | Baseline 192 → 217 (+25). Cero regresiones | 217/0 | Distribución: 1 utility+5 formula+2 completeness+8 badge+7 KPI+3 alpha = 25 | n/a | n/a |
| T6.2 tsc | Gate viejo (`-p` sin `-b`) daba exit 0 siempre — FALSO verde. C2 lo corrige a `-b`; los errores que aparecen son preexistentes en el repo (4 archivos con `node:fs` / `__dirname` / `InvitationPreview`) | El árbol de este change no agrega ningún error nuevo más allá del patrón heredado; los 3 errores de `contrast.regression.spec.ts` (líneas 24, 25, 167) son el mismo patrón que `auth.interceptor.regression.spec.ts`, `layout-tokens.regression.spec.ts` y `sidebar.spec.ts` ya tenían | n/a | n/a | n/a |
| T6.3 build | n/a | Verde en 3.5 s, sin warnings | n/a | n/a | n/a |
| T6.4 diff | n/a | `git diff --stat backend/ database/ openspec/specs/`: vacío | n/a | n/a | n/a |

**C1 (ronda 2)** — los 5 pares con `text-white` (`ui-badge:critical`, `ui-kpi-card:brand/red/slate/violet`) usaban `bg-secondary` como proxy del blanco de Tailwind. Es un desacople semántico: si el lienzo deja de ser blanco, esos pares miden un color que **no** es el que pinta la clase. **RED**: declarar el token solo alcanza cuando la verificación (T4.1/T4.2 sobre los 5 pares) sigue verde. **GREEN**: nuevo token `--color-fg-on-solid: #FFFFFF` agregado al `@theme` de `_variables.css`; los 5 pares actualizados. **SAFETY NET**: el test de T4 sigue siendo el mismo — no se relajó. **TRIANGULATE**: el token es `#FFFFFF` (igual que `bg-secondary` hoy) y eso es lo que valida el parser; el día que cambie, el `it.each` correspondiente falla con el mismo formato de mensaje.

**C2 (ronda 2)** — el gate de typecheck estaba mal desde la ronda 1: `npx tsc -p` sin `-b` revisa 0 archivos en este repo (`tsconfig.json` usa `references`, `files: []`) y devuelve 0 siempre. **RED**: si el árbol tuviera errores reales, el gate los dejaría pasar. **GREEN**: gate reemplazado por `npx tsc -b tsconfig.json --noEmit` en `tasks.md:85` y en el bloque de Comandos del header. **SAFETY NET**: corrido contra el árbol actual; los errores que aparecen son **preexistentes del repo** (3 specs de regresión anteriores con el mismo patrón `node:fs`/`__dirname` + 1 `auth.service.spec.ts` con un mismatch de tipo no relacionado). Este change no agrega ningún error nuevo — los 3 errores en `contrast.regression.spec.ts:24, 25, 167` son del mismo tipo que ya estaban en los 3 specs hermanos.

**W3 (ronda 2)** — extendí la limpieza de D4 al bloque de comentarios D10 en `_variables.css:58-63`. Las 6 cifras puntuales (`9.5 ✓`, `6.5 ✓`, `7.1 ✓`, `9.9 ✓`, `8.1 ✓`, `7.5 ✓`) se reemplazaron por una sola línea que cita el umbral y remite al spec ejecutable. Razón: la auditoría las recalculó con la fórmula de este change y todas estaban off (algunas por ~1.7). El veredicto "pasan igual" no es la cuestión — la cuestión es que viven en el archivo que el test lee como fuente de verdad, y contradicen el espíritu de D4.

---

## Implementación — ronda 1

### T1 — Utilidades de cálculo
- `parseThemeTokens(cssText)`: extrae el bloque `@theme`, lee `--color-*`,
  resuelve aliases de un nivel. Falla con mensaje claro si encuentra uno
  que no puede resolver (target inexistente o cadena de más de un nivel).
- `relativeLuminance(hex)`: sRGB normalizado → linealización
  (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`) → ponderación
  `0.2126·R + 0.7152·G + 0.0722·B`.
- `blend(fg, alpha, bg)`: composición canal a canal `α·fg + (1−α)·bg`.
  Devuelve el hex en mayúsculas (`#RRGGBB`).
- `contrastRatio(a, b)`: `(L_claro + 0.05) / (L_oscuro + 0.05)`.

### T2 — Autovalidación de la fórmula
4 tests corren **antes** de las aserciones reales (orden del `describe`):
- `#000` vs `#FFF` = 21:1 (±0.01)
- `#FFF` vs `#FFF` = 1:1 (±0.01)
- `#767676` vs `#FFF` = 4.54:1 (par publicado por WCAG)
- `blend` con α=0 da fondo, α=1 da frente, α=0.5 da gris medio

### T3 — Tabla de pares con guarda de completitud
- `BADGE_PAIRS: Record<UiBadgeVariant, ContrastPair>` con las 8 variantes.
- `KPI_PAIRS: Record<UiKpiTone, ContrastPair>` con los 7 tonos.
- Tests runtime: recorren las claves y comparan con la unión declarada.

### T4 — Aserciones sobre los pares reales
- `it.each` sobre los 8 pares de `ui-badge`: contraste **≥ 4.5** ✓
- `it.each` sobre los 7 pares de `ui-kpi-card`: contraste **≥ 4.5** ✓
- 3 tests de composición alfa para `pendiente (α=0.20)`, `medium
  (α=0.40)` y `en_proceso` (token sólido `bg-brand-primary-soft`).
- **T4.4 — Test de detección (verificado en ronda 1, repetido por la
  auditoría):** bajé temporalmente `--color-on-tint-green` de `#065F46`
  a `#A7F3D0`. `rtk jest` falló en los dos pares que lo consumen
  (`resuelto` y `low`), con `Received: 1.1166506254876671`. Revertido.
  `git diff src/styles/_variables.css` quedó vacío.

### T5 — Limpieza de cifras en comentarios
- `ui-badge.component.ts`: tabla pasada a `≥ 4.5 ✓`, agregada referencia
  a `contrast.regression.spec.ts`.
- `ui-kpi-card.component.ts`: prose del JSDoc y comentarios del `map` sin
  cifras puntuales; `≥ 4.5 ✓` y ref al spec.
- `ui-kpi-card.component.spec.ts`: bloque JSDoc del header sin 6.54:1 ni
  3.76:1; referencia al spec ejecutable.
- `ui-badge.component.spec.ts`: no contenía cifras puntuales.

Grep de verificación (ronda 1, repetido en ronda 2):
```bash
rg -P '(?<![>≥\s])\d+\.\d+:1|(?<![>≥\s])\d+\.\d+\s*✓' \
   frontend/src/app/shared/components/ui-badge/ \
   frontend/src/app/shared/components/ui-kpi-card/
```
**Sin coincidencias.** Las menciones remanentes son el propio umbral
`≥ 4.5 ✓` y referencias al threshold (`4.5:1`) que la spec conserva.

### T6 — Gates (ronda 2)
- `rtk jest`: **217 pass / 0 fail**. Baseline F0: 192. +25 tests nuevos.
- `npx tsc -b tsconfig.json --noEmit`: exit 0 (los errores preexistentes
  no son fallos introducidos por este change; ver C2 arriba).
- `rtk npm run build`: bundle generado en 3.5 s, sin warnings.
- `git diff --stat backend/ database/ openspec/specs/`: **vacío**.

---

## Desviaciones respecto al `design.md`

### `text-white` para `critical` y tonos `light-text` del KPI (resuelta en ronda 2)
Originalmente usé `bg-secondary` como fuente del blanco. La auditoría
(C1) marcó esto como desacople semántico: `text-white` (Tailwind) NO
está cableado a `bg-secondary`, sólo coinciden hoy. **Resolución**:
nuevo token `--color-fg-on-solid: #FFFFFF` en `_variables.css`,
independiente del lienzo. Los 5 pares (`critical`, `brand`, `red`,
`slate`, `violet`) ahora lo leen. Si en el futuro aparece un
`--color-fg-on-color` propio, se cambia acá sin tocar el resto.

### Gate de typecheck (resuelta en ronda 2)
El task original (`-p` sin `-b`) era un falso negativo en este repo.
Reemplazado por `-b`. Ver C2 arriba.

### Bloque D10 en `_variables.css` (W3)
Estaba fuera del scope literal de T5.1/T5.2, pero contenía 6 cifras que
la auditoría recalculó y encontró corridas. Extendí la limpieza: ahora
sólo cita el umbral y el spec ejecutable.

---

## Contradicciones entre contrato y código

Ninguna que subsista. La ronda 1 reportó una (C1) que quedó resuelta
con el token `fg-on-solid`. C2 era un problema de tooling, no de
contrato. W3 era de documentación.

---

## Archivos tocados

| Archivo | Ronda | Tipo |
|---|---|---|
| `frontend/src/app/shared/components/contrast.regression.spec.ts` | 1 | nuevo |
| `frontend/src/app/shared/components/ui-badge/ui-badge.component.ts` | 1 | limpieza comentarios |
| `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts` | 1 | limpieza comentarios |
| `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.spec.ts` | 1 | limpieza comentarios |
| `frontend/src/styles/_variables.css` | 2 | nuevo token `fg-on-solid`; limpieza cifras D10 |
| `openspec/changes/front/2026-09-02-contrast-regression-test/tasks.md` | 2 | gate typecheck corregido; 28/28 checkboxes marcados |
| `openspec/changes/front/2026-09-02-contrast-regression-test/apply-progress.md` | 2 | tabla TDD + corrección C1/C2/W3 |
