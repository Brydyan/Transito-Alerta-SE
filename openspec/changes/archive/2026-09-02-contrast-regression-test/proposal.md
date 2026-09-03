# Propuesta: test de regresión de contraste para los primitivos del design system

**Change**: `2026-09-02-contrast-regression-test`
**Tipo**: cobertura de test (sin cambio de comportamiento)
**Working dir**: `frontend`
**Depende de**: F0 (archivada) — consume sus tokens y sus primitivos

---

## Intención

`openspec/specs/design-system/spec.md` exige contraste **≥ 4.5:1 en cualquier par
texto/fondo de los primitivos de F0**. Es un requisito de la fuente de verdad y **no
tiene ninguna verificación automatizada**.

Este change lo cubre con un test que calcula el contraste real desde los tokens.

---

## Problema

### El requisito existe y nadie lo comprueba

`grep -rn "getContrast\|relativeLuminance\|luminance"` sobre
`frontend/src/app/shared/components/` da **cero**. El único rastro de `4.5` son
comentarios en `ui-kpi-card.component.spec.ts:7,18,41`.

Los tests actuales verifican que las clases **derivan de tokens** —eso lo cubrió
F0/R2.1— pero no que los colores resultantes **se lean**.

### Por qué importa acá y no en abstracto

**En F0, toda cifra de contraste estuvo mal al menos una vez.** No es una hipótesis:

| Par | Cifra documentada | Valor real | Cuándo se detectó |
|---|---|---|---|
| Tabla completa de D10 (8 pares) | estimada | corrida en todas las filas | 2ª auditoría |
| `amber` en `ui-kpi-card` | 8.1:1 | ≈6.29:1 | 3ª auditoría |
| `slate` en `ui-kpi-card` | 12.4:1 | ≈14.68:1 | 4ª auditoría |

Tres correcciones manuales, en tres auditorías distintas. El error se repitió porque el
contraste se **estimaba y se copiaba entre contextos** en vez de calcularse: el `8.1` de
`amber` era el par del badge con fondo **tintado** (`/20`), copiado a un KPI con fondo
**sólido**.

Se adoptó la regla «citar el umbral, no el valor», que evita documentar cifras falsas —
pero **no verifica que el umbral se cumpla**. Hoy la garantía es que alguien lo midió a
mano en septiembre de 2026.

### El riesgo concreto

F1–F6 consumen estos primitivos y **van a agregar tonos y variantes**. Un `tone` nuevo en
`ui-kpi-card`, o una variante de estado cuando 315 habilite `closed` en la UI, entra sin
que nada mida su contraste. El defecto original de F0 —`cyan` y `green` con texto blanco
a 2.28:1— pasó los tests durante todo el desarrollo.

---

## Alcance

### Incluye

- Un spec nuevo que calcula el contraste WCAG real de cada par de `ui-badge` y
  `ui-kpi-card`, **leyendo los valores desde `_variables.css`**
- Manejo del blend de alfa para las variantes tintadas del badge (`/12`, `/15`, `/20`,
  `/40`)
- Una guarda de completitud: agregar una variante o un tono sin declarar su par **rompe
  el test**
- Retirar de los comentarios las cifras de contraste que queden, ahora que hay una
  fuente ejecutable

### Excluye

- **Cambiar cualquier color.** Los pares actuales pasan; este change sólo los verifica
- Ampliar a otros componentes fuera de los primitivos de F0 (`ui-button`, `ui-card`,
  `ui-page-header`, `ui-table` no tienen pares de color propios hoy)
- Contraste de estados `:hover` / `:focus` — no están fijados en el spec
- Reabrir F0, que está archivada

---

## Migraciones de BD

Ninguna.

## Permisos RBAC

Ninguno.

---

## Impacto

Cierra el único requisito de `specs/design-system/` sin cobertura, y lo hace antes de que
F1–F6 empiecen a agregar variantes. El costo es un archivo de test; el beneficio es que
la cuarta corrección manual de contraste no ocurra.

---

## Riesgo

Bajo. Es un test nuevo sobre código que ya pasa. El riesgo real sería que el test
hardcodee los hex y se vuelva otra tabla que deriva — ver `design.md` D1, que es la
decisión central de este change.
