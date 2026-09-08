# Verify Report — Ronda 8: F3 · Módulo de Incidencias (sc-303)

**Fecha**: 2026-09-07
**Alcance**: cierre del único WARNING abierto en la ronda 7 — el `spec.md` delta
faltante del change follow-up `front/2026-09-07-fix-incident-claim-wiring`.
**Veredicto**: **PASS** — 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

---

## Por qué esta ronda es acotada

El código de producción no cambió desde la ronda 7. El diff del working tree es
byte-idéntico al que la ronda 7 verificó de forma adversarial:

```
frontend/src/app/core/services/incident.service.spec.ts        | 59 ++++++
frontend/src/app/core/services/incident.service.ts             | 30 ++++
.../incident-detail/incident-detail.component.spec.ts          | 62 +++++--
.../incident-detail/incident-detail.component.ts               | 29 +++-
4 files changed, 165 insertions(+), 15 deletions(-)
```

El único cambio nuevo es la aparición de
`openspec/changes/front/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/spec.md`
(79 líneas). Por lo tanto esta ronda verifica **ese archivo** y vuelve a correr los
gates para confirmar ausencia de regresión. No se re-litiga lo ya verificado en la
ronda 7.

---

## Verificación del `spec.md` delta

El documento se declara **«NO DELTA»**: sostiene que el escenario «Reclamar» ya
existía en el spec del proyecto y que este change no cambia la capacidad, sólo hace
que la implementación por fin la cumpla.

Esa afirmación se comprobó contra los archivos citados, no contra su prosa:

| Afirmación del spec | Comprobación | Resultado |
|---|---|---|
| El escenario «Reclamar» ya está en `openspec/specs/frontend-incidents/spec.md` | Leído el archivo: el escenario existe en la sección «Acciones de flujo de trabajo», con el texto «GIVEN una incidencia disponible y permiso `CLAIM incidents` WHEN se reclama THEN queda asignada al usuario actual y el estado se refleja sin recargar» | **Correcto** (cita `:67-68`; la posición real es `:66-67`, desfase de una línea, irrelevante) |
| `incident-detail.component.spec.ts` afirma `claimed_by === 'user-1'` tras el claim | `incident-detail.component.spec.ts:188` — `expect(component.incident()?.claimed_by).toBe('user-1');` | **Correcto** |
| El backend escribe `claimed_by` en la ruta dedicada | `incident-workflow.service.ts:114` — `SET claimed_by = $1, claimed_at = NOW()` | **Correcto** |
| `workflow.util.ts` no se modifica y su gate ya era correcto | El archivo no aparece en el diff; `hasClaim = permissions.includes('CLAIM incidents')` coincide con `@RequirePermission('CLAIM','incidents')` en `incident-workflow.controller.ts:34-36` | **Correcto** |
| `resolve`/`close` siguen usando `PATCH /:id/status` legítimamente | Sin cambios en el diff; el backend no expone endpoint dedicado para esas dos acciones | **Correcto** |

El segundo escenario del delta («Reclamar falla con código del backend», con 409
`INCIDENT_ALREADY_CLAIMED` / 429 `CLAIM_LIMIT_REACHED` / 403 `WRONG_ORGANIZATION`)
se declara honestamente como nuevo respecto al spec del proyecto, y se justifica
como aplicación concreta del patrón D4 ya descrito, no como capacidad nueva. La
declaración es correcta: los tres códigos fueron confirmados en el backend durante
la ronda 7.

**Conclusión**: el `spec.md` es honesto. No infla el alcance ni reclama trabajo que
no se hizo, y declara explícitamente lo que NO se tocó. El WARNING de la ronda 7
queda cerrado.

---

## Gates (ejecución real, desde `frontend/`)

| Comando | Resultado | vs. ronda 7 |
|---|---|---|
| `pnpm test` | **60/60 suites, 419/419 tests PASS**, 5.47s | idéntico |
| `pnpm run build` | **exit 0**, 4.20s, bundle generado en `frontend/dist` | idéntico |
| `npx tsc -b --noEmit --force` | **9 errores en 3 archivos**, **0 en archivos de incidencias** | idéntico |

Los 9 errores de typecheck son deuda preexistente ajena a F3, en
`auth.service.spec.ts` (1), `placeholder.component.spec.ts` (4, directivas
`@ts-expect-error` sin usar) y `layout-tokens.regression.spec.ts` (5, firma de
`fs.readdirSync`). Ninguno toca incidencias.

**Nota de método**: `npx tsc -b --noEmit` sin `--force` devolvió «sin errores» por
caché incremental de build mode. Los 9 errores sólo aparecen con `--force`. Quien
use este comando como gate en CI debe pasar `--force` o limpiar `.tsbuildinfo`, o el
gate pasa en falso.

`pnpm lint` no existe en este repo (gap preexistente, propiedad de
`front/2026-09-03-tool-ci-gates`).

---

## Estado final

- **`2026-08-29-f3-incidents-module`** (archivada): sin acciones pendientes. El
  CRITICAL de la ronda 6 está cerrado y verificado en las rondas 7 y 8.
- **`front/2026-09-07-fix-incident-claim-wiring`**: artefactos completos
  (`proposal.md`, `tasks.md`, `apply-progress.md`, `specs/frontend-incidents/spec.md`).
  **Listo para `sdd-archive`.**

Nada fue commiteado por esta ronda. El working tree queda como estaba, más este
archivo.

---

## Historial de rondas

| Ronda | Veredicto | Hallazgo clave |
|---|---|---|
| 3 | FAIL | 3 CRITICAL, 4 WARNING |
| 4 | FAIL | El fix de C2 de la ronda 3 era falso: tipo de respuesta incorrecto corrompía el detalle |
| 5 | PASS (reclamado) | C2/W1/W2 cerrados; se archivó F3 sobre esta base |
| 6 | FAIL | CRITICAL nuevo: `claim` llamaba `PATCH /status`, que nunca escribe `claimed_by`. El fix W2 de la ronda 5 era cosmético y añadió un 403 para `operador_sistema` |
| 7 | PASS con WARNING | CRITICAL cerrado de verdad, probado con mutation testing. Faltaba el `spec.md` delta |
| 8 | **PASS** | `spec.md` delta presente y honesto. Sin regresión |
