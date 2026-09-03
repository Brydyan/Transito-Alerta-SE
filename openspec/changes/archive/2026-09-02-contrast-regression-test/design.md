# Diseño: test de regresión de contraste

**Change**: `2026-09-02-contrast-regression-test`

---

## D1 — El test lee los valores desde `_variables.css`; no los hardcodea

**Decisión**: el test parsea el bloque `@theme` de
`frontend/src/styles/_variables.css` y resuelve cada token a su hex.

**Motivo**: es la decisión que define si este change sirve o repite el problema.

Un test con los hex escritos a mano sería **otra tabla más que deriva** — exactamente lo
que falló tres veces en F0. Si alguien ajusta `--color-prio-critical` por accesibilidad y
el test lleva `#B91C1C` embebido, el test sigue verde midiendo un color que ya no existe.

Leyendo del CSS, el test verifica **el sistema**, no una foto del sistema.

`_variables.css` es la fuente de verdad de los tokens: la misma que consume Tailwind para
generar las utilidades. El test mide lo que el navegador pinta.

**Alternativa rechazada — leer los colores computados del DOM en jsdom**: jsdom no carga
Tailwind, así que `getComputedStyle` devuelve vacío para estas clases. Es la misma
limitación que obligó a `sidebar.spec.ts` a leer `_layout.css` como texto. Parsear el CSS
es el sustituto honesto, y hay precedente en el repo.

**Alternativa rechazada — un script fuera de Jest**: quedaría fuera de `rtk jest` y del
job `frontend` del CI, que corre `install → test → build`. Un chequeo que no está en la
suite no corre.

---

## D2 — Los pares se declaran una vez, y la completitud se verifica

**Decisión**: una tabla única `CONTRAST_PAIRS` en el spec nuevo, con
`{ componente, variante, bgToken, alpha, textToken }`. El test:

1. Comprueba que **toda** variante de `ui-badge` (`UiBadgeVariant`) y **todo** tono de
   `ui-kpi-card` (`UiKpiTone`) tiene entrada en la tabla.
2. Calcula el contraste de cada par y afirma **≥ 4.5:1**.

**El punto 1 es la mitad que importa.** Sin él, agregar un tono nuevo y olvidarse de
declararlo deja el tono sin medir y el test verde. Es el mismo modo de fallo que las
entradas muertas de R2.1: una lista que nadie obliga a mantener completa.

Los tipos ya existen y son uniones cerradas — `UiBadgeVariant` y `UiKpiTone` —, así que
la completitud se puede exigir en tiempo de compilación con un `Record<UiBadgeVariant, …>`
y además en runtime recorriendo las claves.

**Alternativa rechazada — derivar los pares leyendo las clases que emite cada componente**:
más automático, pero exige mapear clase → token → hex con la sintaxis de alfa de Tailwind
(`bg-prio-medium/40`) desde dentro del test. Más superficie de error en el propio test, y
un test complicado que falla por su cuenta enseña a ignorarlo. La tabla explícita, con
guarda de completitud, da la misma garantía con menos partes móviles.

---

## D3 — Umbral único de 4.5:1; el blend de alfa se calcula, no se estima

**Decisión**: 4.5:1 para todos los pares, y las variantes tintadas se componen sobre
blanco antes de medir.

**Umbral**: los badges usan `text-xs` (12 px) y las etiquetas de KPI van en versalitas
pequeñas. Ninguno califica como texto grande (18.66 px en negrita / 24 px normal), así
que el umbral de WCAG AA es 4.5, no 3.0. Aplicar 3.0 «porque el número grande del KPI es
grande» dejaría sin cubrir la etiqueta y el pie de tendencia, que es justo donde estaba
el defecto de `cyan` y `green`.

**Blend**: `bg-prio-medium/40` no es `#FCD34D` — es `#FCD34D` al 40 % sobre el lienzo.
Componer mal es exactamente el error que produjo la tabla corrida de D10.

```
canal_efectivo = α · canal_token + (1 − α) · canal_fondo
```

El fondo es `--color-bg-secondary` (`#FFFFFF`), no blanco literal: las píldoras viven
sobre tarjetas, y si mañana el lienzo deja de ser blanco el test lo refleja solo.

**Alternativa rechazada — usar una librería de contraste**: son ~15 líneas
(`sRGB → lineal → luminancia relativa → razón`), la fórmula está congelada en WCAG 2.x, y
una dependencia nueva exige pasar por `design.md` según las reglas del builder. No vale
el trámite.

---

## D4 — Las cifras salen de los comentarios

**Decisión**: retirar los valores de contraste que queden en comentarios de los
primitivos y sus specs, dejando la referencia al test.

**Motivo**: la regla adoptada en F0 fue «citar el umbral, no el valor», y se aplicó a
medias — cuarta aparición del patrón «regla implementada a medias» en aquel change. Con
un test ejecutable, la cifra deja de tener lugar donde vivir: el valor es una medición
con fecha y método, y ahora hay algo que la recalcula en cada corrida.

Lo que queda en el comentario es **dónde se verifica**, no cuánto dio.

---

## Contrato del cálculo

```ts
// WCAG 2.x — sRGB → luminancia relativa → razón de contraste
function relativeLuminance(hex: string): number;      // 0..1
function blend(fg: string, alpha: number, bg: string): string;
function contrastRatio(a: string, b: string): number; // 1..21
```

**Validación del propio cálculo**: antes de medir los pares reales, el spec verifica la
implementación contra tres razones conocidas —`#000`/`#FFF` = 21, `#FFF`/`#FFF` = 1, y un
par publicado por WCAG—. Un test de contraste con la fórmula mal implementada es peor que
ninguno: da falsos verdes con autoridad.

---

## Pares a cubrir

| Componente | Entradas |
|---|---|
| `ui-badge` | 8 — `pendiente`, `en_proceso`, `resuelto`, `cerrada`, `low`, `medium`, `high`, `critical` |
| `ui-kpi-card` | 7 — `brand`, `cyan`, `green`, `red`, `slate`, `amber`, `violet` |

15 pares. Los 15 pasan hoy: el change los blinda, no los corrige.
