# Tasks: test de regresión de contraste

**Change**: `2026-09-02-contrast-regression-test`
**Working dir**: `frontend`
**Archivo nuevo**: `frontend/src/app/shared/components/contrast.regression.spec.ts`
**Agrupación**: Utilidades → Autovalidación → Tabla → Aserciones → Limpieza → Gates

> **Comandos**: prefijá todo con `rtk` (`rtk jest`, `rtk grep`, `rtk git diff`).
> **Excepción**: typecheck va crudo — `npx tsc --noEmit -p tsconfig.json`. `rtk tsc` da
> falso negativo, comprobado en la 3ª auditoría de F0.

---

## T1 — Utilidades de cálculo

- [ ] **T1.1** — `parseThemeTokens(cssText: string): Record<string, string>`: extrae los
      pares `--color-*: #RRGGBB` del bloque `@theme` de
      `frontend/src/styles/_variables.css`. Debe resolver los alias de un nivel
      (`--color-brand-navy: var(--color-brand-primary)`) o **fallar con un mensaje claro**
      si encuentra uno que no puede resolver. No hardcodees ningún hex — D1.
- [ ] **T1.2** — `relativeLuminance(hex): number` según WCAG 2.x: sRGB normalizado →
      linealización (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`) → ponderación
      `0.2126 R + 0.7152 G + 0.0722 B`.
- [ ] **T1.3** — `blend(fg, alpha, bg): string`: composición canal a canal
      `α·fg + (1−α)·bg`. El fondo por defecto es `--color-bg-secondary` leído de los
      tokens, **no** el literal `#FFFFFF` — D3.
- [ ] **T1.4** — `contrastRatio(a, b): number`: `(L_claro + 0.05) / (L_oscuro + 0.05)`.

## T2 — Autovalidación de la fórmula (va ANTES de medir los pares reales)

- [ ] **T2.1** — Test que verifica `contrastRatio('#000000', '#FFFFFF') === 21` con
      tolerancia 0.01.
- [ ] **T2.2** — Test que verifica `contrastRatio('#FFFFFF', '#FFFFFF') === 1`.
- [ ] **T2.3** — Test contra un par publicado por WCAG con razón conocida.
- [ ] **T2.4** — Test de `blend`: `blend('#000000', 0, '#FFFFFF')` da blanco;
      `blend('#000000', 1, '#FFFFFF')` da negro.

  > Estos cuatro son la red del propio test. Un cálculo de contraste mal implementado da
  > falsos verdes con autoridad — peor que no tener test.

## T3 — Tabla de pares con guarda de completitud

- [ ] **T3.1** — Declarar `BADGE_PAIRS: Record<UiBadgeVariant, ContrastPair>` con las 8
      variantes. Tipar con `Record<UiBadgeVariant, …>` para que **falte una sea error de
      compilación**, no sólo de runtime.
- [ ] **T3.2** — Declarar `KPI_PAIRS: Record<UiKpiTone, ContrastPair>` con los 7 tonos,
      mismo tipado.
- [ ] **T3.3** — Test de completitud en runtime: recorrer las claves y afirmar que
      coinciden con las uniones de tipos. Cubre el caso de que alguien ensanche la unión
      con `string`. El mensaje de fallo debe **nombrar la variante que falta** — D2.

## T4 — Aserciones sobre los pares reales

- [ ] **T4.1** — `it.each` sobre los 8 pares de `ui-badge`: contraste **≥ 4.5**. El
      mensaje de fallo incluye variante, tokens, alfa y razón obtenida.
- [ ] **T4.2** — `it.each` sobre los 7 pares de `ui-kpi-card`: mismo umbral, mismo
      formato de mensaje.
- [ ] **T4.3** — Verificá que las variantes tintadas se componen: `pendiente` (`/20`),
      `resuelto` (`/15`), `cerrada` (`/12`), `low` (`/15`), `medium` (`/40`),
      `high` (`/15`). `en_proceso` usa `bg-brand-primary-soft`, que es un token sólido —
      sin alfa.
- [ ] **T4.4** — **Probá que el test detecta.** Bajá temporalmente un token de
      `_variables.css` a un valor que rompa su par (p. ej. `--color-on-tint-green` a
      `#A7F3D0`), corré `rtk jest`, confirmá que falla nombrando ese par, **revertí y
      confirmá con `rtk git diff` que el árbol quedó limpio**. Dejá constancia en
      `apply-progress.md`.

  > Es el paso que faltó en R2.1 de F0 y produjo una red anti-regresión con un hueco.
  > Un test que nunca se vio fallar no está verificado.

## T5 — Limpieza de cifras en comentarios (D4)

- [ ] **T5.1** — Retirar las razones puntuales de contraste de
      `ui-badge.component.ts`, `ui-badge.component.spec.ts`,
      `ui-kpi-card.component.ts` y `ui-kpi-card.component.spec.ts`. Dejar `≥ 4.5 ✓` y una
      referencia a `contrast.regression.spec.ts`.
- [ ] **T5.2** — Grep de verificación: no deben quedar coincidencias de razones con
      formato `N.N:1` ni `N.N ✓` en esos cuatro archivos. El propio
      `contrast.regression.spec.ts` se excluye — ahí los números de T2 son legítimos.

## T6 — Gates

- [ ] **T6.1** — `rtk jest` desde `frontend/`: **todo verde**. Baseline al cerrar F0: 192
      tests. Este change los sube; ninguno debe romperse.
- [ ] **T6.2** — `npx tsc --noEmit -p tsconfig.json` **crudo**: exit 0.
- [ ] **T6.3** — `rtk npm run build`: verde.
- [ ] **T6.4** — `rtk git diff --stat`: cero cambios bajo `backend/`, `database/` y
      `openspec/specs/`.

---

## Definition of Done

- [ ] Los 15 pares verificados con cálculo real, ≥ 4.5:1
- [ ] Ningún hex embebido en el test: todo sale de `_variables.css`
- [ ] Agregar una variante o un tono sin declarar su par **rompe la compilación o el test**
- [ ] La fórmula validada contra 3 razones conocidas, antes de las aserciones reales
- [ ] El test se vio fallar de verdad (T4.4), documentado en `apply-progress.md`
- [ ] Cero razones puntuales de contraste en los comentarios de los cuatro archivos
- [ ] `rtk jest` verde, `npx tsc` exit 0, `rtk npm run build` verde

---

## Fuera de alcance

| Qué | Por qué |
|---|---|
| Cambiar cualquier color o token | Los 15 pares pasan hoy; esto los blinda, no los corrige |
| `ui-button`, `ui-card`, `ui-page-header`, `ui-table` | No tienen pares de color propios |
| Contraste de `:hover` / `:focus` | No están fijados en el spec |
| Los 12 archivos de `features/` con `bi bi-` | F1–F6 |
| Reabrir F0 | Está archivada |
