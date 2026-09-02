# Spec: F0 — Design System Alignment

## Domain: design-system (NEW)

### Requirement: Paleta de marca violeta
El sistema DEBE exponer la paleta del mock como custom properties en el bloque
`@theme` de Tailwind 4, reemplazando la paleta navy/hi-vis.

- Scenario: Token primario resuelto — GIVEN una plantilla que usa `bg-brand-primary`
  WHEN se compila el CSS THEN el color computado es `#7C3AED`
- Scenario: Compatibilidad hacia atrás — GIVEN CSS heredado que usa `var(--primary-color)`
  WHEN se aplican los tokens nuevos THEN `--primary-color` resuelve al violeta primario,
  no al navy, y no se rompe ninguna regla existente
- Scenario: Hi-vis retirado del shell y del design system — GIVEN `frontend/src/app/layout/`
  y los archivos de `frontend/src/styles/` WHEN se busca `#CCFF00` o `--color-brand-hivis`
  THEN no hay coincidencias, salvo el bloque de alias de puente de `_variables.css`
- Scenario: El alias de puente está declarado y tiene fecha — GIVEN los alias
  `--color-brand-navy*` y `--color-brand-hivis*` que sobreviven en `_variables.css`
  WHEN se revisa el change THEN cada uno apunta a un token de la paleta violeta,
  `apply-progress.md` lista todos sus consumidores —incluido `_modals.css`—, y la
  retirada tiene ticket asignado a F6 (sc-323)

### Requirement: Escala de estados
El sistema DEBE definir un color por estado de incidencia y por prioridad, y ese
color DEBE ser el único origen de verdad para badges, tarjetas KPI y marcadores.

- Scenario: Sin color fuera de los tokens — GIVEN cualquier primitivo de F0
  WHEN se inspeccionan sus clases THEN toda clase de color deriva de un token del
  bloque `@theme` (`bg-status-*`, `bg-prio-*`, `bg-brand-*`, `bg-accent-*`,
  `text-on-tint-*`) y NO aparece ninguna clase de escala stock de Tailwind
  (`slate-*`, `emerald-*`, `amber-*`, `red-*`) ni ningún literal hexadecimal
- Scenario: Estados mapeados — GIVEN los estados `pendiente|en_proceso|resuelto|cerrada`
  WHEN se renderiza un badge THEN el fondo es el token del estado en versión tintada
  (`bg-status-pendiente/20`, `bg-brand-primary-soft`, `bg-status-resuelto/15`,
  `bg-status-cerrada/12`) y el texto es su tono profundo (`text-on-tint-slate`,
  `text-on-tint-violet`, `text-on-tint-green`, `text-on-tint-graphite`)
- Scenario: Prioridades mapeadas — GIVEN las prioridades `low|medium|high|critical`
  WHEN se renderiza un badge THEN `low`, `medium` y `high` usan fondo tintado
  (`bg-prio-low/15`, `bg-prio-medium/40`, `bg-prio-high/15`) con su tono profundo
  (`text-on-tint-green`, `text-on-tint-amber`, `text-on-tint-red`), y `critical` es la
  única variante con fondo **sólido** (`bg-prio-critical` + `text-white`)
- Scenario: Crítica distinguible sin color — GIVEN los badges `high` y `critical`
  WHEN se comparan THEN `critical` incorpora un icono además del color **y rompe el
  patrón tintado con fondo sólido**, de modo que siguen siendo distinguibles por alguien
  que no percibe la diferencia entre ambos rojos
- Scenario: Contraste accesible — GIVEN cualquier par texto/fondo de un primitivo de F0
  —badge, tarjeta KPI o marcador— WHEN se mide la razón de contraste THEN es ≥ 4.5:1,
  incluidos los textos pequeños en versalitas
- Scenario: Tonos de KPI legibles — GIVEN los tonos `cyan`, `green` y `red` de
  `ui-kpi-card` WHEN se renderiza la etiqueta y el pie de tendencia THEN `cyan` y
  `green` usan `text-on-tint-graphite`, y `red` usa fondo `bg-prio-critical` con
  `text-white`; ninguno empareja `text-white` con `accent-cyan`, `accent-green` o
  `prio-high`

### Requirement: Tipografía geométrica
El sistema DEBE usar la sans geométrica del mock como familia base y DEBE dejar de
usar `Barlow Condensed`.

- Scenario: Familia base aplicada — GIVEN `body` sin clase de fuente
  WHEN se computa `font-family` THEN el primer nombre es la familia geométrica elegida
- Scenario: Fallback declarado — GIVEN que la webfont no carga
  WHEN se renderiza texto THEN se aplica una pila de respaldo sans-serif del sistema
  y la maquetación no se desborda

### Requirement: Iconografía Lucide única
El sistema DEBE renderizar iconos con Lucide y NO DEBE mezclar familias de iconos
en el shell de aplicación.

- Scenario: Icono del backend renderizado — GIVEN que el backend envía `icon: "alert-triangle"`
  WHEN el sidebar lo renderiza THEN se dibuja el glifo Lucide correspondiente,
  no el texto literal `alert-triangle`
- Scenario: Nombre desconocido — GIVEN un nombre de icono que Lucide no reconoce
  WHEN se renderiza el item THEN se usa un icono de respaldo neutro y NO se imprime
  el nombre crudo en pantalla
- Scenario: Familias retiradas — GIVEN el shell (`layout/`) compilado
  WHEN se buscan `material-symbols-outlined` o clases `bi bi-*` THEN no hay coincidencias

### Requirement: Sidebar claro con secciones
El sidebar DEBE renderizarse sobre fondo blanco y DEBE agrupar los items bajo
encabezados de sección en versalitas.

- Scenario: Fondo y agrupación — GIVEN un menú con items agrupados
  WHEN se renderiza el sidebar THEN el fondo es `#FFFFFF` y cada grupo muestra su
  encabezado (p. ej. `INCIDENCIAS`) en mayúsculas, tamaño reducido y color atenuado
- Scenario: Item activo — GIVEN la ruta actual coincide con un item
  WHEN se renderiza THEN el item recibe fondo violeta claro y texto violeta,
  sin el borde izquierdo hi-vis anterior
- Scenario: Items sin grupo — GIVEN un item sin grupo asignado (p. ej. `Dashboard`)
  WHEN se renderiza THEN aparece antes del primer encabezado, sin encabezado propio

### Requirement: Primitivos de UI compartidos
El sistema DEBE proveer componentes standalone reutilizables que encapsulen los
patrones repetidos del mock, de modo que las fases F1–F6 no los redefinan.

- Scenario: Badge — GIVEN `<ui-badge variant="en_proceso">` THEN se renderiza una
  píldora con el color de estado especificado arriba
- Scenario: Tarjeta KPI — GIVEN `<ui-kpi-card>` con valor, etiqueta, icono y tendencia
  THEN se renderiza el bloque de color sólido del mock 01-01, con el color de texto que
  fija el escenario «Tonos de KPI legibles» — blanco para los tonos oscuros,
  `text-on-tint-graphite` para `cyan` y `green`. **El fondo sólido es la regla; el texto
  blanco no.**
- Scenario: Encabezado de página — GIVEN `<ui-page-header>` con kicker y título
  THEN se renderiza el kicker en versalitas atenuadas sobre el título grande
  (patrón `GESTIÓN / LISTADO` + `Incidencias` del mock 02-01)
- Scenario: Tabla — GIVEN `<ui-table>` con columnas y filas
  THEN el encabezado usa versalitas espaciadas y atenuadas, y las filas admiten
  celda de título con subtítulo atenuado

## Coverage

Happy paths: cubiertos (tokens, tipografía, iconos, sidebar, primitivos).
Edge cases: cubiertos (webfont caída, nombre de icono desconocido, item sin grupo).
Error states: no aplica — F0 no ejecuta I/O ni consume API.
Contraste: exigido para **todo** par texto/fondo de los primitivos de F0 —badges y
tarjetas KPI incluidas— y verificable de forma automatizada, ya que los pares están
fijados por token en `design.md` D10 y D12. Deja de ser un criterio de review visual.

## Revisión 2026-09-01

Tres escenarios cambiaron tras el FAIL de `sdd-verify`. El detalle —qué decía el
contrato, qué encontró la auditoría, qué se decidió— está en `design.md`, D10–D12.

| Escenario | Antes | Ahora | Por qué |
|---|---|---|---|
| Hi-vis retirado | «el árbol de estilos completo» | `layout/` + `styles/`, con alias de puente declarado y ticketeado | El contrato contradecía al DoD de `tasks.md`, y retirar los alias rompe el build (Tailwind 4 falla duro en `@apply`) — D11 |
| Estados / prioridades mapeados | fondos sólidos con hex exactos | fondos tintados por token + tono de texto; `critical` sólido | «Sólido + blanco» falla AA en 5 de 8 variantes, y `#EF4444` no llega a 4.5:1 con **ningún** texto — D10 |
| Contraste accesible | sólo badges | todo primitivo de F0 | `ui-kpi-card` empareja `text-white` con tres tonos que dan 2.28–3.76 — D12 |

Escenarios nuevos: «Sin color fuera de los tokens», «El alias de puente está declarado
y tiene fecha», «Tonos de KPI legibles».

**Corrección posterior (misma fecha, tras la 2ª auditoría)**: el escenario «Tarjeta KPI»
del requisito «Primitivos de UI compartidos» seguía exigiendo texto blanco sin excepción,
contradiciendo a «Tonos de KPI legibles» dentro del mismo archivo. Al escribir D12 se
actualizó el requisito «Escala de estados» y **no el requisito vecino** — el patrón
«regla implementada a medias» que `openspec/ROADMAP.md` fija como trampa del proyecto,
cometido esta vez en el contrato y no en el código. Lo detectó la auditoría, no el
arquitecto: ver la declaración de independencia parcial de `verify-report.md`.

## Next

Listo para `sdd-design`. F0 no depende de ninguna fase; bloquea F1–F6.
