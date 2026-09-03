# Spec: design-system — verificación automatizada del contraste

**Change**: `2026-09-02-contrast-regression-test`
**Capability**: `design-system` (delta sobre `openspec/specs/design-system/spec.md`)

---

## Requirement: el contraste de los primitivos se verifica de forma automatizada

El requisito «Contraste accesible» de la capability DEBE tener verificación ejecutable.
La razón de contraste DEBE calcularse desde los valores de token vigentes, NO desde
cifras escritas a mano.

### Scenario: cada par declarado alcanza el umbral

- **GIVEN** los 8 pares de `ui-badge` y los 7 de `ui-kpi-card`
- **WHEN** se calcula la razón de contraste WCAG del par texto/fondo
- **THEN** cada una es ≥ 4.5:1
- **AND** el valor se deriva de los tokens leídos de `frontend/src/styles/_variables.css`,
  no de literales embebidos en el test

### Scenario: una variante sin declarar rompe el test

- **GIVEN** una variante nueva en `UiBadgeVariant` o un tono nuevo en `UiKpiTone`
- **WHEN** se corre la suite sin haber declarado su par en la tabla de contraste
- **THEN** el test falla nombrando la variante que falta
- **AND** el fallo ocurre aunque el componente renderice sin error

### Scenario: el fondo tintado se compone antes de medir

- **GIVEN** una variante con alfa (`bg-status-pendiente/20`, `bg-prio-medium/40`, …)
- **WHEN** se calcula su contraste
- **THEN** el color de fondo efectivo es el token compuesto sobre
  `--color-bg-secondary` con esa alfa
- **AND** no se usa el valor plano del token

### Scenario: cambiar un token cambia el resultado del test

- **GIVEN** un token de color modificado en `_variables.css` a un valor que baja el
  contraste de su par por debajo de 4.5:1
- **WHEN** se corre la suite
- **THEN** el test falla
- **AND** el mensaje nombra el par y la razón obtenida

### Scenario: la fórmula está validada contra referencias conocidas

- **GIVEN** la implementación del cálculo de contraste
- **WHEN** se la evalúa sobre pares de razón conocida (`#000`/`#FFF` = 21:1,
  `#FFF`/`#FFF` = 1:1, y un par publicado por WCAG)
- **THEN** los resultados coinciden dentro de una tolerancia de 0.01
- **AND** esta validación corre **antes** que las aserciones sobre los pares reales

---

## Requirement: las cifras de contraste no se documentan en comentarios

Una vez que existe verificación ejecutable, los comentarios de los primitivos y sus specs
NO DEBEN citar valores puntuales de contraste. DEBEN citar el umbral y dónde se verifica.

**Motivo**: en F0 las tres cifras documentadas resultaron incorrectas al recalcularlas
(`amber` 8.1 → 6.29, `slate` 12.4 → 14.68, y toda la tabla de D10 por estimar el blend).
Un valor en un comentario es una medición sin fecha que nadie revalida.

### Scenario: ningún primitivo cita una razón puntual

- **GIVEN** los archivos de `frontend/src/app/shared/components/ui-badge/` y
  `ui-kpi-card/`
- **WHEN** se buscan razones de contraste con formato `N.N:1` o `N.N ✓`
- **THEN** no hay coincidencias, salvo `≥ 4.5`
- **AND** cada tabla de pares remite al spec que lo verifica

---

## Coverage

Happy paths: los 15 pares vigentes.
Edge cases: fondo con alfa; variante nueva sin declarar; token modificado a la baja.
Error states: no aplica — el spec no ejecuta I/O ni consume API.
Autovalidación: la fórmula se contrasta contra tres razones conocidas antes de usarse.
