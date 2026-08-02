---
name: Sistema de Incidencias Georreferenciadas
description: Sala de control cívica para incidencias municipales — violeta energético, gradientes de estado, sombras en capas.
colors:
  primary: "#5e3bdb"
  primary-light: "#7858f5"
  primary-dark: "#4e2fc4"
  text-dark: "#23283b"
  text-default: "#5b6172"
  text-muted: "#a3a8b8"
  text-light: "#b3b8c6"
  text-white: "#ffffff"
  bg-page: "#f3f4f9"
  bg-card: "#ffffff"
  bg-hover: "#f5f6fa"
  border-light: "#eef0f5"
  border-medium: "#e2e5ef"
  status-pending-bg: "#fff4d6"
  status-pending-text: "#8a5800"
  status-progress-bg: "#e3e7ff"
  status-progress-text: "#1a0f5c"
  status-resolved-bg: "#d8f6e7"
  status-resolved-text: "#1a7a4a"
  priority-high-bg: "#fde2e7"
  priority-high-text: "#a0183a"
  priority-medium-text: "#8a5800"
  priority-low-text: "#4a4f60"
  stat-blue: "#5a6ff0"
  stat-cyan: "#10bfe0"
  stat-green: "#1fc56e"
  stat-red: "#fa5a7d"
  stat-purple: "#8a5cf0"
  primary-shipped: "#6a5cf3"
  accent-actions-blue: "#4f6bed"
  hover-tint-a: "#f0edff"
  hover-tint-b: "#f3f0ff"
typography:
  display:
    fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.75rem, 1.25rem + 2.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.5rem, 1.125rem + 1.875vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.25rem, 1rem + 1.25vw, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "10px"
  md-alt: "11px"
  lg: "12px"
  xl: "14px"
  "2xl": "16px"
  pill-soft: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "linear-gradient(118deg, #6a5cf3 0%, #a06bf5 100%)"
    textColor: "{colors.text-white}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "linear-gradient(118deg, #5e3bdb 0%, #8a5cf0 100%)"
  button-outline-primary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    height: "38px"
  card:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.xl}"
    padding: "20px"
  status-pill-pending:
    backgroundColor: "{colors.status-pending-bg}"
    textColor: "{colors.status-pending-text}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
  status-pill-progress:
    backgroundColor: "{colors.status-progress-bg}"
    textColor: "{colors.status-progress-text}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
  status-pill-resolved:
    backgroundColor: "{colors.status-resolved-bg}"
    textColor: "{colors.status-resolved-text}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
---

# Design System: Sistema de Incidencias Georreferenciadas

## Overview

**Creative North Star: "Sala de Control Cívica"**

El sistema se lee como una sala de control en vivo para incidencias municipales, no como un formulario de trámite: violeta saturado como señal de actividad, gradientes diagonales en botones y tiles, sombras que se glow-tiñen del color del dato que representan (azul, cian, verde, rojo, violeta). Cada tile de métrica no es una tarjeta plana con un número — es una señal visual de estado, con su propia sombra de color a juego con el gradiente. La densidad es de dashboard operativo: tablas, chips de estado, filtros y mapas conviven en una grilla compacta pero nunca gris ni burocrática.

Rechazo confirmado: nada de estética "trámite gubernamental" — sin grises apagados, sin Bootstrap genérico sin personalizar, sin superficies planas sin jerarquía. La energía violeta y los gradientes existen para contrarrestar esa lectura.

**Estado real: el sistema está dividido en dos, hoy.** El mundo `gr-*` (dashboard, login, listado de incidencias, app-shell) sí cumple el rechazo anterior. Pero mapa, perfil, el chrome de medios del detalle de incidencia y el stepper del formulario de reporte **siguen en Bootstrap-default sin migrar** — literalmente el look que este sistema rechaza. Este DESIGN.md documenta la intención (`gr-*`) como la norma a seguir en UI nueva, y marca la capa vieja como deuda conocida, no como parte del sistema a imitar.

**Key Characteristics:**
- Violeta saturado (#5e3bdb) como firma de marca, expresado casi siempre en gradiente, no plano.
- Tiles de métrica con "glow" de color a juego (sombra coloreada bajo cada gradiente).
- Tipografía fluida (clamp) en toda la jerarquía — sin saltos bruscos por breakpoint.
- Sombras en capas (sm → dropdown → selected) que comunican elevación real, no decoración plana.
- Chips de estado/prioridad con contraste corregido a mano donde el token original no pasaba WCAG.

## Colors

Paleta de un solo acento (violeta) expresado mayormente en gradiente, sobre neutros fríos de fondo/página.

### Primary
- **Violeta Cívico** (`#5e3bdb`): token canónico en `variables.css`. Acento de marca declarado.
- **Violeta Cívico Claro** (`#7858f5`) / **Violeta Cívico Oscuro** (`#4e2fc4`): variantes de hover/active y profundidad de gradiente.
- **Violeta Cívico (enviado)** (`#6a5cf3`): ⚠️ en la práctica, este es el violeta que más aparece hardcodeado en botones, hover de iconos, nav activo, focus rings y el hero de login — no el `#5e3bdb` del token. Documentado porque es lo que realmente se ve en pantalla; ver Do's and Don'ts.
- **Actions Blue** (`#4f6bed`): cuarto acento real, desconectado del violeta — usado consistentemente en el dropzone de subida de imágenes y en acciones/quote del hilo de comentarios (`image-uploader.css`, `comment-item.css`).

### Neutral
- **Tinta Profunda** (`#23283b`): texto principal (`--text-dark`).
- **Grafito Medio** (`#5b6172`): texto de cuerpo por defecto (`--text-default`).
- **Niebla** (`#a3a8b8` / `#b3b8c6`): texto secundario/muted, placeholders.
- **Papel Frío** (`#f3f4f9`): fondo de página (`--bg-page`).
- **Blanco Tarjeta** (`#ffffff`): fondo de cards (`--bg-card`).
- **Línea Suave** (`#eef0f5`) / **Línea Media** (`#e2e5ef`): bordes y divisores.
- **Tinte Violeta Suave** (`#f0edff` y `#f3f0ff`): dos valores casi idénticos usados para hover/seleccionado (nav activo, badge de no-leídos, select custom, filtros) — patrón real y repetido, pero sin un solo token que lo respalde. Además, `--bg-hover` (`#f5f6fa`) aparece escrito a mano como `#f5f6fb` en `app-shell.component.css` (bell-panel) — un dígito distinto, parece typo, no variante intencional.

### Named Rules
**The Gradient-Not-Flat Rule.** El violeta primario casi nunca aparece como fill plano en superficies grandes (botones, sidebar activo, tiles): siempre en gradiente diagonal, reforzado con una sombra glow del mismo tono. El ángulo varía por contexto (118° en botones/nav inferior, 135° en tiles y texto de marca, 150° en el hero de login) — la variación es parte del sistema, no un error, salvo cuando el resultado es plano. Un botón primario plano sin gradiente ni glow se siente fuera de sistema.

**The Colored Glow Rule.** Cada tile de estadística lleva una sombra `box-shadow` teñida con el mismo hue de su gradiente (ej. tile azul → glow `rgba(90,111,240,.65)`). El glow es la señal de "esto es un número vivo", no decoración gratuita.

### Known inconsistency (flag, not fixed here)
`--gradient-primary` (`#6a5cf3 → #a06bf5`) usa tonos que ya no coinciden con el `--color-primary` actual (`#5e3bdb`) — parecen resabio de una iteración anterior de paleta. Documentado tal cual está implementado hoy; normalizar es una decisión de implementación futura, no de este registro.

## Typography

**Display/Body Font:** Be Vietnam Pro (con fallback `-apple-system, BlinkMacSystemFont, sans-serif`) — única familia en todo el sistema, sin fuente mono/label separada.

**Character:** Geométrica, moderna, con peso suficiente en 600–800 para leer como dashboard serio sin caer en corporativo frío.

### Hierarchy
- **Display / H1** (700, `clamp(1.75rem, 1.25rem + 2.5vw, 3rem)`, line-height 1.2): títulos de página principales.
- **Headline / H2** (700, `clamp(1.5rem, 1.125rem + 1.875vw, 2.25rem)`, line-height 1.2): secciones mayores.
- **Title / H3–H4** (600, `clamp(1.25rem, 1rem + 1.25vw, 1.75rem)` a `clamp(1.125rem, 1rem + .625vw, 1.5rem)`, line-height 1.2): títulos de tarjeta/bloque.
- **Body** (400, `1rem`, line-height 1.5): texto de contenido general.
- **Label** (600, `0.875rem`, letter-spacing `0.05em`, uppercase en chips): estados, prioridades, headers de tabla.

### Named Rules
**The Fluid-Only Rule.** Toda la escala tipográfica usa `clamp()`, no saltos fijos por media query. Un tamaño de fuente fijo (`font-size: 24px` sin clamp) para un heading rompe el sistema.

## Layout

Grid de dashboard operativo: `.page-wrapper > .container-*` con `padding: 35px`, `max-width: 1300px`, `min-height: calc(100dvh - 210px)`. Responsive fuertemente mobile-first, con quiebres frecuentes en `480px` (el más usado, con diferencia), y adicionales en `576px`, `768px`, `900px`, `992px`.

No hay una escala formal de spacing tokenizada (`--spacing-*`); el ritmo real observado en el código es de facto múltiplos de 4px (4, 8, 12, 16, 20, 24, 32px). Tratar esos valores como la escala implícita al agregar UI nueva.

## Elevation & Depth

Sistema en capas, tokenizado explícitamente — no plano. Escala: `--shadow-sm` (reposo, `0 1px 3px rgba(20,20,50,.06)`) → `--shadow-md` → `--shadow-dropdown` (`0 8px 24px rgba(20,20,50,.12)`, menús/modales/toasts) → `--shadow-selected` / `--shadow-custom` (glow violeta en elementos activos/primarios, `rgba(106,92,243,.55)`). Además, un vocabulario de **glow de color** propio de los tiles de métrica (ver Colors → Named Rules), donde la sombra no es gris sino teñida del color del dato.

### Shadow Vocabulary
- **sm** (`0 1px 3px rgba(20,20,50,.06)`): reposo, cards por defecto.
- **md** (`0 4px 12px rgba(20,20,50,.08)`): hover leve.
- **dropdown** (`0 8px 24px rgba(20,20,50,.12)`): menús, modal, toast.
- **selected / custom** (`0 12px 22px -8px` / `0 14px 26px -10px rgba(106,92,243,.55)`): estado activo/seleccionado, botón primario.
- **stat glow** (variable por color, ej. `0 14px 26px -14px rgba(90,111,240,.65)`): tiles de métrica, coloreado a juego con su gradiente.

### Named Rules
**The Elevation-Means-Something Rule.** La sombra escala con la intención (reposo → hover → flotante → seleccionado); no se usa una sombra genérica única para todo. Un modal con `--shadow-sm` en vez de `--shadow-dropdown` se siente "plano" fuera de sistema.

## Shapes

Radios generosos y consistentes por categoría de componente — nunca esquinas vivas (0px) en superficies de contenido dentro del mundo `gr-*`. Escala real, más suelta de lo ideal: `6px` (badges/chips pequeños) → `10px` (botones/inputs por defecto — el más usado) → `11px` (filtros y selects de dashboard/usuarios/incidencias — paso de escala real, no accidental) → `12px` (inputs/botones de login, thumbnails, borde punteado del mapa en detalle) → `14px` (`.card`) → `16px` (`.gr-card`, modal) → `22px` (botón de login, trigger de user-menu — un segundo radio "casi pill", distinto de `999px`) → `999px`/`50%` (pills, avatares, dots de estado).

La capa Bootstrap-default sin migrar (mapa, perfil, stepper) usa su propia escala más chica (`4/6/8px`) — no la mezcles con la de arriba al construir UI nueva; si tocás esas pantallas, migralas a la escala `gr-*`.

### Known inconsistency (flag, not fixed here)
Los chips de estado tienen dos implementaciones con radios distintos: `.gr-status` usa `20px` (pill parcial) y `.feed-status-chip` usa `6px` (badge cuadrado-suave). Documentado tal cual; unificar a un solo radio de chip de estado es trabajo de implementación futura, no de este registro.

## Components

### Buttons
- **Shape:** radio `10px` por defecto (`9px` en `.btn-sm`); variante `.gr-btn-primary` usa `12px`.
- **Primary:** gradiente diagonal (118°) `#6a5cf3 → #a06bf5` + `--shadow-custom` glow violeta, texto blanco, altura `42px` (`.gr-btn-primary`) o `38px` (`.btn`).
- **Hover / Focus:** el gradiente se profundiza; el glow se mantiene o intensifica.
- **Outline/Secondary:** fondo transparente, borde y texto en violeta primario, sin gradiente ni glow.

### Status & Priority Pills
- **Style:** relleno suave (bg tenue del color de estado) + texto saturado del mismo hue, uppercase, letter-spacing `0.05em`, dot de 6px opcional (`.gr-status__dot`).
- **State:** pending (ámbar), progress (violeta-azulado), resolved (verde); prioridad alta (rojo), media (ámbar), baja (verde apagado).
- **Contraste:** donde el token de base no pasa WCAG AA, `feed.component.css` define un override verbatim con contraste corregido (ej. progress: 13:1 en vez de 3.18:1) — tratar ese override, no el token crudo, como el par de color correcto a reusar en UI nueva.

### Cards / Containers
- **Corner Style:** `14px` (`.card`), `16px` (`.gr-card`, contenedores destacados), `clamp(8px, 2vw, 12px)` en feed cards responsive.
- **Background:** blanco (`--bg-card`) sobre fondo de página gris frío (`--bg-page`).
- **Shadow Strategy:** `--shadow-sm` en reposo; transición a sombra mayor + `transform` leve en hover (feed cards).
- **Border:** `1px solid` `--border-light` en la mayoría de cards.

### Inputs / Fields
- **Style:** altura mínima `42px`, radio `10–11px`, borde `--border-medium`.
- **Focus:** anillo teñido de primario (`box-shadow: 0 0 0 .2rem rgba(94,59,219,.12)`) + cambio de color de borde.
- **Mobile guard:** `font-size` forzado a `max(16px, 1rem)` en inputs para evitar auto-zoom de iOS.

### Stat Tiles (signature component)
Tile de métrica de dashboard: fondo en gradiente diagonal de color propio (azul/cian/verde/rojo/violeta) + sombra glow del mismo hue. Es el componente más distintivo del sistema — la firma visual de "sala de control" se concentra acá.

### Tables
- **Style:** header uppercase, fondo `#f8fafc`, texto de cuerpo `13px`/`.85rem`; filas con hover/stripe tintado (`#fafbfd`/`#f5f7ff` en el listado de incidencias); contenedor con radio `14px` y borde suave.
- **Estado en filas:** usa el mismo `.gr-status` pill (`20px` radio — ver inconsistencia ya flaggeada).

### Navigation
- **Sidebar:** ítem activo con radio asimétrico "pill-cut" (`0 60px 60px 0`), fondo en gradiente + `--shadow-selected` glow. Activo también marcado con tinte violeta suave (`#f0edff`) en variantes de menú secundario.
- **Off-canvas mobile:** panel fijo deslizante + backdrop; visibilidad de regiones enteras del chrome controlada por `body[data-role]` — es una decisión arquitectónica (quién ve qué menú), no solo visual.
- **Bell / Notification panel:** lista de no-leídos con tinte `#f0edff`, botón "marcar todo leído", badge contador.
- **Custom select dropdown** (`usuarios.index`, filtros de incidencias): trigger + menú flotante propio en vez de `<select>` nativo; hover/seleccionado en tinte violeta suave (`#f3f0ff`).

### Comment Thread
- Avatar circular 40px con iniciales (34px en respuestas anidadas); burbuja de comentario radio `12px`, fondo `#f4f5f9`; respuestas anidadas con indent y borde punteado izquierdo; badge de autor institucional (pill violeta claro sobre `#ede9ff`).
- Acciones/quote del hilo (responder, citar) usan **Actions Blue** (`#4f6bed`), no el violeta primario — acento real pero separado del resto del sistema.

### Auth Split-Hero (signature component)
Pantalla de login: panel hero de 520px en gradiente violeta (150°, el único uso de ese ángulo) con anillos decorativos y stats, junto a panel blanco de formulario. Layout de página completa distintivo — on-brand, pero no derivado de ningún primitivo ya documentado.

### Image Lightbox
Overlay fullscreen `rgba(0,0,0,.9)` sobre grilla de miniaturas, con overlay de gradiente oscuro + caption en hover (`incidencias.detail`). Usa colores Bootstrap crudos en su chrome (ver Do's and Don'ts), no tokens.

### Drag-and-drop Uploader
Dropzone con borde punteado, estado drag-activo, botones de cámara/galería en mobile (`image-uploader.css`). Acento propio: **Actions Blue** (`#4f6bed`), no violeta.

### Multi-step Wizard (off-brand — flag, not a pattern to copy)
Stepper de 4 pasos del formulario de reporte (`.ici-stepper`, `incidencias.form.component.css`): dots numerados activo/completado en **colores Bootstrap crudos** (`#0d6efd`/`#198754`) más una familia gris tipo Tailwind-slate que no existe en `variables.css`. El comentario del propio archivo afirma seguir los tokens del repo — no es cierto. Es el componente más alejado del sistema documentado; no replicar su paleta en trabajo nuevo.

## Do's and Don'ts

### Do:
- **Do** usar gradiente diagonal (118°–135°) + glow de color a juego para cualquier superficie primaria/de métrica nueva — es la firma del sistema, no un detalle opcional.
- **Do** reusar el par de color WCAG-corregido de `feed.component.css` para chips de estado/prioridad, no el token crudo cuando difieran.
- **Do** usar `clamp()` para cualquier tamaño de fuente nuevo en la jerarquía de headings — nunca un tamaño fijo.
- **Do** escalar la sombra con la intención (reposo → hover → dropdown → seleccionado); nunca una sombra plana única.

### Don't:
- **Don't** introducir violeta plano sin gradiente en botones primarios o tiles nuevos — rompe la firma "Sala de Control Cívica".
- **Don't** usar `frontend/css/variables.css` (duplicado muerto, no enlazado) como fuente — el canónico es `frontend/public/css/variables.css`.
- **Don't** dejar superficies grises apagadas sin jerarquía — es exactamente el look "trámite gubernamental" que el sistema rechaza explícitamente.
- **Don't** copiar el radio de `.gr-status` (`20px`) o `.feed-status-chip` (`6px`) sin decidir cuál es el canónico — la inconsistencia es conocida, no un patrón a extender.
- **Don't** copiar la paleta de `mapa.component.css`, `perfil.component.css`, `incidencias.detail` (chrome de medios) o `.ici-stepper` — son colores Bootstrap-default/Tailwind-slate crudos, la capa vieja sin migrar, exactamente lo que este sistema rechaza. Si tocás esas pantallas, migralas al sistema `gr-*`, no extiendas su paleta.
- **Don't** hardcodear `#5e3bdb` esperando que coincida con lo que se ve en pantalla — la mayoría de la UI interactiva usa `#6a5cf3` en la práctica. Si vas a fijar esta ambigüedad, hacelo explícito (elegir uno y actualizar el token o el CSS), no agregues un tercer valor.
- **Don't** inventar un nuevo tinte violeta de hover — reusá `#f0edff` o `#f3f0ff` (ya hay dos, no hace falta un tercero) y revisá que no sea el typo `#f5f6fb`.
