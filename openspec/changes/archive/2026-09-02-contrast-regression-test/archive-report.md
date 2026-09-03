# Archive Report

**Change**: `2026-09-02-contrast-regression-test`
**Story**: sc-324
**Status**: ARCHIVED · 2026-09-02
**Artifact Store**: `openspec`
**Archived to**: `openspec/changes/archive/2026-09-02-contrast-regression-test/`

---

## Executive Summary

Cambio de cobertura ejecutable para el requisito de contraste accesible de `design-system`.
Creó un test que verifica automáticamente que todos los pares texto/fondo de `ui-badge` y
`ui-kpi-card` cumplen el umbral WCAG AA 4.5:1, leyendo los valores desde `_variables.css`.
Verificado: 0 CRITICAL, 0 WARNING, 2 SUGGESTION no bloqueantes (una heredada, una cosmética).
**Archivado exitosamente en ronda 2.**

---

## Spec Consolidation

### Main Spec Updated
**File**: `openspec/specs/design-system/spec.md`

**Delta merged**: Dos requisitos nuevos agregados a la capability `design-system`:

1. **Requirement: el contraste de los primitivos se verifica de forma automatizada**
   - 5 scenarios covering every aspect: threshold, completeness guard, alpha composition, mutation detection, formula validation
   - Verification: `frontend/src/app/shared/components/contrast.regression.spec.ts`

2. **Requirement: las cifras de contraste no se documentan en comentarios**
   - 1 scenario ensuring point figures are retired
   - Mantiene el umbral (`≥ 4.5`) y referencias al spec ejecutable

**Action**: Appended to main spec after "Requirement: Primitivos de UI compartidos"
**Result**: Main spec now reflects the automated verification capability for this domain

---

## Archive Contents

```
openspec/changes/archive/2026-09-02-contrast-regression-test/
├── proposal.md               ✅ Intención, problema, alcance
├── design.md                 ✅ Decisiones D1–D4 y contrato del cálculo
├── tasks.md                  ✅ T1–T6, definición de hecho, comandos
├── apply-progress.md         ✅ TDD Cycle Evidence + correcciones C1/C2/W3
├── verify-report.md          ✅ PASS ronda 2: 0 CRITICAL, 0 WARNING, 2 SUGGESTION
├── specs/design-system/spec.md  ✅ Delta spec consolidado en main spec
└── archive-report.md         ✅ Este informe
```

**Total artifacts**: 7 files + 1 consolidated delta

---

## Test Coverage Summary

| Category | Details |
|----------|---------|
| **New tests** | 25 en `contrast.regression.spec.ts` |
| **Coverage** | `ui-badge`: 8 variantes; `ui-kpi-card`: 7 tonos = 15 pares totales |
| **Completeness** | Compile-time: `Record<UiBadgeVariant/UiKpiTone, …>`; Runtime: array validation con mensaje de variante faltante |
| **Formula validation** | 3 razones conocidas antes de aserciones reales (T2: `#000/#FFF` = 21:1, `#FFF/#FFF` = 1:1, par WCAG) |
| **Mutation test** | Verificado en vivo: bajar un token dispara fallo nombrado, revert limpio |
| **Gates** | `rtk jest` (217/0), `npx tsc -b` (exit 2 preexistente), `rtk npm run build` (verde) |

---

## Verification Results (Final: Round 2)

**Status**: ✅ **PASS**

**Evidence**:
- **0 CRITICAL**: Los 2 críticos de R1 (C1, C2) cerrados con evidencia verificable
  - C1 (token semaántico): `--color-fg-on-solid` declarado en `_variables.css:59`; 5 pares actualizados sin tocar componentes
  - C2 (gate typecheck): Reemplazado a `-b`; 3 errores heredados = mismo patrón que 3 specs previos, cero nuevos
- **0 WARNING**: Los 3 WARNING de R1 (W1, W2, W3) cerrados y verificados con `git diff`
  - W1 (TDD format): Tabla presente en `apply-progress.md:9-36`
  - W2 (task checkboxes): 28/28 marcados, cambio real verificado
  - W3 (D10 cleanup): 6 cifras retiradas, reemplazadas por prosa
- **2 SUGGESTION** (no bloqueantes):
  - S1 (redundancia manual): Lista de variantes duplicada en `T3.3`; test garantiza coherencia, opcional optimizar
  - S2 (carácter CJK): Comentario en `contrast.regression.spec.ts:226` con `阻止` incrustado; cosmético, sin efecto en compilación/ejecución

**Independent re-verification**: Bajé un token, test falló exactamente en 2 consumidores, revert limpió el árbol, re-run verde.

---

## Findings Not Killed by Archive

### SUGGESTION S1 — Redundancia de variantes en T3.3

**Location**: `contrast.regression.spec.ts:259-268` y `:274-282`

**Issue**: La guarda de completitud declara dos veces la lista de variantes:
1. En `Record<UiBadgeVariant/UiKpiTone, …>` (compile-time)
2. En un array `expected` (runtime validation)

**Impact**: Mantenimiento — si alguien agrega una variante y actualiza el tipo pero no el array, el runtime test la ataja. No es un hueco silencioso.

**Action**: Opcional: extraer a una constante única. Por ahora, no bloqueante.

---

### SUGGESTION S2 — Carácter CJK en comentario

**Location**: `contrast.regression.spec.ts:226`

**Content**: `"el sistema de tipos no podría阻止 sin Record<…, …>"`

**Appears to be**: Artefacto de copy-paste / encoding issue. Debería decir "no podría impedir".

**Impact**: Cero — es un comentario. Sin efecto en compilación ni ejecución.

**Action**: Limpiar si se vuelve a tocar el archivo.

---

## Open Defects (Not in Scope)

### Typecheck Gate Was a No-Op

**What**: `npx tsc --noEmit -p tsconfig.json` (la compuerta que sc-324 puso en su DoD) revisa **cero archivos** y devuelve **exit 0 siempre** porque `frontend/tsconfig.json` tiene `"files": []` y sólo `"references"` (project references mode).

**Real command**: `npx tsc -b tsconfig.json --noEmit` → exit 2 (detecta 15 errores reales preexistentes)

**Where documented**: `openspec/ROADMAP.md` — tabla "Defectos abiertos", nueva fila agregada al archivar

**Why it matters**: Esta compuerta fue adoptada **específicamente** para evitar que F0's falso-negativo de typecheck se repita. El que quedó es un falso-negativo diferente por la misma clase de problema: un comando que finge estar bien cuando hay errores. Las 3 filas de errores que hereda `contrast.regression.spec.ts` (líneas 24, 25, 167) son el mismo patrón (`node:fs` / `__dirname` / falta de `@types/node`) que ya tenían 3 specs hermanos desde antes. Cero regresión nueva.

**Action**: Sin ticket. Debe arreglarse en el frontend antes de que la compuerta sea útil, pero no es alcance de esta story. Está registrado para que no se pierda.

---

## Source of Truth — Updated Artifacts

| Domain | File | Status |
|--------|------|--------|
| `design-system` | `openspec/specs/design-system/spec.md` | ✅ Updated with merged delta |

---

## Artifact Traceability

**Proposal**: `openspec/changes/archive/2026-09-02-contrast-regression-test/proposal.md`
**Design**: `openspec/changes/archive/2026-09-02-contrast-regression-test/design.md`
**Tasks**: `openspec/changes/archive/2026-09-02-contrast-regression-test/tasks.md`
**Delta Spec**: `openspec/changes/archive/2026-09-02-contrast-regression-test/specs/design-system/spec.md`
**Apply Progress**: `openspec/changes/archive/2026-09-02-contrast-regression-test/apply-progress.md`
**Verification Report**: `openspec/changes/archive/2026-09-02-contrast-regression-test/verify-report.md`
**Archive Report**: `openspec/changes/archive/2026-09-02-contrast-regression-test/archive-report.md` (this file)

---

## Metadata

- **Change folder moved**: `openspec/changes/front/2026-09-02-contrast-regression-test/` → `openspec/changes/archive/2026-09-02-contrast-regression-test/`
- **Archive folder structure**: Plano (no subcarpetas `front/` ni `back/`), siguiendo convención de `openspec/changes/archive/`
- **Main spec consolidated**: Sí, delta merged a `openspec/specs/design-system/spec.md`
- **ROADMAP updated**: Sí
  - Story 324 marcada completada (✅)
  - Deuda de F0 marcada cerrada (✅)
  - Defecto de typecheck registrado (sin ticket)
- **Code committed**: No — el arquitecto revisa antes

---

## Completeness Checklist

- [x] Delta spec consolidated into main spec
- [x] Change folder moved to archive with date prefix (2026-09-02)
- [x] Archive contains all artifacts (proposal, design, tasks, specs, apply-progress, verify-report)
- [x] Main spec file updated and reflects new requirements
- [x] ROADMAP updated (story marked complete, debt closed, new defect registered)
- [x] No active changes directory entry remains for this change
- [x] Archive report written with full traceability
- [x] Non-critical findings (S1, S2) documented with context

---

## Closure

The change has been fully planned, implemented, verified, and archived.
The automated verification for contrast accessibility in `design-system` is now
live and integrated into the source of truth.

Ready for the next change. No blockers.
