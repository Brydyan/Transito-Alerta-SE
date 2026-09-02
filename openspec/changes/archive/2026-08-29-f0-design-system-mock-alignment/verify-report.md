# Verify Report — F0 Design System Alignment (4ª pasada, final)

**Change**: `2026-08-29-f0-design-system-mock-alignment`
**Verificado por**: `sdd-verify` en sub-agente de contexto limpio, 2026-09-02
**Working dir**: `frontend/`
**Sustituye a**: el reporte de la 3ª pasada

> **Persistencia**: el sub-agente auditor no puede escribir archivos `.md`. Entregó el
> reporte como texto y lo guardó en engram; esta es la transcripción escrita por el
> orquestador.

---

## ⚠ Declaración de independencia parcial

**D10–D12 de `design.md`, los escenarios de «Revisión 2026-09-01» de `spec.md`,
`tasks.md:39` y `fixes-required.md` los escribió el mismo agente que lanzó esta
auditoría** (Claude, rol doble arquitecto + QA). No hay arquitecto independiente desde
2026-09-01.

Nada de eso se tomó como verdad revelada: se re-derivó de forma independiente donde fue
posible — recálculo WCAG desde cero (método validado contra tres referencias conocidas),
ejecución real de tests, e inyección de regresiones con reversión verificada.

**La mitigación volvió a producir**: de los dos WARNING, **uno es del arquitecto**.

---

## Veredicto

# PASS WITH WARNINGS

**0 CRITICAL · 2 WARNING · 2 SUGGESTION**

**Se archiva.** Nada de lo encontrado bloquea: son imprecisiones de documentación, no
defectos de código ni huecos de test explotables.

---

## Ejecución real

```
rtk jest                            → PASS (192) · FAIL (0)
rtk npm run build                   → verde · 472.71 kB · 3.345s
npx tsc --noEmit -p tsconfig.json   → sin output · EXIT_CODE=0
rtk pnpm install --frozen-lockfile  → ok
rtk git diff --stat -- backend/ app.routes.ts → sin output
rtk git status                      → sin archivos nuevos respecto a la pasada anterior
```

Baseline de la 3ª pasada sostenido (192/192, 472.62 kB / 3.44s). Sin regresión, sin
scope creep.

`npx tsc` se corrió **crudo a propósito**: en la 3ª pasada se comprobó que `rtk tsc` da
falso negativo.

---

## Ronda 3 — estado

| Ítem | Estado | Evidencia |
|---|---|---|
| **R3.1** | ✅ Corregido | `apply-progress.md:17-26` documenta el `TS2322` real. Confirmado que `menu.service.ts` **no** popula `group` — W-4 sigue diferido a F1 |
| **R3.2** | ✅ Corregido, **verificado con ejecución real** | El auditor inyectó `text-purple-500` en `pendiente`, corrió `rtk jest --testPathPatterns='ui-badge'`, **2 tests rompieron** (contrato exacto **y** estructural), revirtió, `rtk git diff` limpio. Regex idéntico byte a byte en ambos specs |
| **R3.3** | ✅ Corregido, **recalculado independientemente** | `#FCD34D` + `#78350F` → **6.291:1** por cálculo propio, coincide con el `≈6.29` citado |

R3.2 era el ítem que importaba, y esta vez el test estructural **sí** atrapó la clase
prohibida — antes sólo la agarraba el de contrato exacto.

---

## Hallazgos

### WARNING-1 — la regla «citá el umbral, no el valor» se aplicó a una sola fila

`frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts:40-48`

R3.3 pidió adoptar la regla de citar el umbral (`≥ 4.5 ✓`) en vez del valor puntual,
porque dos cifras de contraste ya habían muerto al recalcularlas. **Se aplicó a la fila
`amber` y a ninguna de las otras seis.**

El auditor recalculó `slate` (`#1F2937` + blanco) de forma independiente: **≈14.68:1**,
no el `12.4` citado — y tampoco el `13.5` que figuraba en otro contexto. Supera el
umbral por margen enorme, así que no hay defecto funcional.

**Cuarta aparición del patrón «regla implementada a medias» en este change.** Y la más
elocuente: la regla creada específicamente para evitar que las cifras envejezcan mal fue
ella misma aplicada a medias, en la fila de al lado.

### WARNING-2 — `tasks.md:44` no califica la excepción de D12

`openspec/changes/front/2026-08-29-f0-design-system-mock-alignment/tasks.md:44` (F0.4.5)
sigue describiendo `ui-kpi-card` como «texto blanco», sin la excepción de D12 (`cyan` y
`green` usan grafito).

`spec.md` —el contrato real— está correcto. Sólo `tasks.md` quedó desfasado.

Es el **mismo archivo y el mismo mecanismo** que WARNING-A de la 3ª pasada: entonces se
corrigió F0.4.1 y **no se revisó F0.4.5, dos líneas más abajo.** Del arquitecto.

### SUGGESTION-1 — `STRUCTURAL_PREFIX` sin anclar

El regex no lleva `$` en ninguno de los dos specs. Laxo, no explotable hoy.

### SUGGESTION-2 — entradas muertas en `ALLOWED_CLASS_PREFIXES`

`ui-badge.component.spec.ts` retiene `text-status-`, `text-prio-`, `text-brand-`, que
ninguna variante usa. Es la misma clase de basura que produjo el hueco de R2.1
(`bg-slate-`/`text-slate-` eran entradas muertas), aunque estas no abren ningún agujero:
son prefijos de token, no de escala stock.

---

## DoD — verificado

| Ítem | Estado |
|---|---|
| `build` en verde | ✅ ejecutado |
| `tsc` limpio | ✅ `npx tsc` crudo, exit 0 |
| Seis primitivos exportados vía barrel, cada uno con spec | ✅ |
| Sidebar coincide con el mock | ✅ (agrupación sin datos reales → F1, W-4) |
| Grep en cero para los 5 patrones en `layout/` | ✅ |
| CSS del design system migrado a tokens | ✅ `_modals.css` incluido |
| Logo en `src/assets/logo.svg` | ✅ |
| `ui-table` con helper classes | ✅ |
| Cero cambios bajo `backend/` ni en `app.routes.ts` | ✅ |

---

## Recomendación

**`sdd-archive`.**

Cuatro pasadas, 0 CRITICAL, 192/192 tests, build y typecheck limpios, cero scope creep.
Los tres ítems de la ronda 3 se verificaron con ejecución real, no con lectura.

Lo que queda son imprecisiones en comentarios. **No justifican una quinta ronda**: el
valor marginal de otra pasada por exactitud de comentarios es negativo, y las dos cifras
en cuestión superan el umbral por márgenes de 3× y más.

### Pendiente post-archive — **todo cerrado antes de archivar**

| # | Qué | Quién lo hizo |
|---|---|---|
| 1 | Regla de umbral en toda la tabla D12 de `ui-kpi-card.component.ts` | **Claude (implementación directa)** |
| 2 | `tasks.md:44` — calificar «texto blanco» con la excepción D12 | Claude (arquitecto) |
| 3 | Anclar `STRUCTURAL_PREFIX` con `$` y limpiar entradas muertas | **Claude (implementación directa)** |

---

## ⚠ Segunda pérdida de independencia — ítems 1 y 3

**Andy pidió explícitamente que Claude aplicara la limpieza en vez de mandarla a
Minimax.** Es su llamada y está prevista en `docs/agents/claude-qa.md` («Rol doble»,
salvaguarda 4), que exige declararla acá.

**Consecuencia**: sobre `ui-kpi-card.component.ts` y los dos `*.spec.ts` de los
primitivos, el mismo agente escribió el contrato, auditó contra él **y ahora implementó
la corrección**. No queda ningún lector independiente sobre esos tres archivos. Los
hallazgos 1 y 3 de esta tabla **no fueron re-auditados por nadie**.

### Qué se hizo, para que sea revisable

1. **Tabla D12 (`ui-kpi-card.component.ts:40-48`)** — las siete filas pasan a citar
   `≥ 4.5 ✓` en vez de valores puntuales, con la justificación de por qué: tres cifras
   distintas murieron al recalcularse en este mismo change (`amber` 8.1 → 6.29, `slate`
   12.4 → 14.68, y toda la columna original de D10 por estimar el blend de alfa en vez de
   calcularlo). El umbral es el contrato; el valor puntual es un dato de medición y vive
   en el reporte que lo midió, con fecha y método.

2. **`ALLOWED_CLASS_PREFIXES` de `ui-badge.component.spec.ts`** — retiradas
   `text-status-`, `text-prio-` y `text-brand-`, muertas. Queda comentado por qué: las
   entradas muertas fueron exactamente el mecanismo del hueco de R2.1.

3. **`STRUCTURAL_PREFIX`, ambos specs** — `$` **dentro** del grupo `text-(…)`, no al
   final del regex: esas son clases completas, mientras que `rounded` e `items-` son
   prefijos a propósito y un ancla global los rompería.

### Verificación tras el cambio

```
rtk jest                            → PASS (192) · FAIL (0)
npx tsc --noEmit -p tsconfig.json   → sin output · EXIT_CODE=0
```

Y el ancla se comprobó comparando ambos regex sobre casos concretos, para no confiar en
que los tests siguieran verdes por casualidad:

| clase | regex viejo | regex nuevo |
|---|---|---|
| `text-xs` | ✅ | ✅ |
| `text-white` | ✅ | ✅ |
| `text-on-tint-graphite` | ✅ | ✅ |
| `rounded-full` | ✅ | ✅ |
| `items-center` | ✅ | ✅ |
| `text-xs-purple` | ✅ **fuga** | ❌ |
| `text-white-ish` | ✅ **fuga** | ❌ |
| `text-currently-red` | ✅ **fuga** | ❌ |

Las legítimas siguen pasando, las tres fugas fabricadas ahora fallan, y los prefijos no
se rompieron.

**Aun así, esto es autoverificación.** Si algo de estos tres archivos importa más
adelante, conviene que lo mire alguien que no los haya escrito.

---

## Nota de proceso

`skill_resolution: none` — no se inyectó bloque «Project Standards» desde un registro de
skills; las reglas del proyecto llegaron por el mensaje de tarea. Este proyecto no tiene
`.atl/skill-registry.md`; las reglas viven en `docs/agents/*.md` y el orquestador las
transcribe a mano en cada lanzamiento. Funciona, pero es transcripción manual: si una
regla cambia en `docs/agents/`, hay que acordarse de propagarla al prompt.
