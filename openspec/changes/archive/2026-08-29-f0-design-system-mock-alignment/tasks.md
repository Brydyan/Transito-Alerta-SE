# Tasks: F0 — Design System Alignment

**Change**: `2026-08-29-f0-design-system-mock-alignment`
**Fuente del contrato**: `docs/mock/01-01`, `02-01`, `05-01`, `09-01`, `11-01`;
`GeoReporta/openspec/changes/profile-redesign/app-shell-retina-audit.md` (gradiente violeta legacy)
**Working dir**: `frontend` (nota: `openspec/config.yaml` fija `working_dir: backend`
para changes de backend; F0 es puramente frontend y corre `pnpm` desde `frontend/`)
**Agrupación**: Tokens → Iconografía → Shell → Primitivos → Tests

---

## F0.1 — Tokens y tipografía

- [x] **F0.1.1** — Reescribir el bloque `@theme` de `frontend/src/styles/_variables.css` con la paleta de D1: `--color-brand-primary`, `--color-brand-primary-hover`, `--color-brand-primary-soft`, escala `--color-status-*` (pendiente/proceso/resuelto/cerrada), escala `--color-prio-*` (**low/medium/high/critical** — son cuatro, D9: `critical` existe en `0004_incidents.sql:27` y en todo el backend, sólo nunca se maquetó), `--color-accent-cyan`, `--color-accent-green`. Conservar sin cambio `--color-bg-primary`, `--color-bg-secondary`, `--color-border-subtle`.
- [x] **F0.1.2** — Eliminar `--color-brand-navy`, `--color-brand-navy-light`, `--color-brand-hivis`, `--color-brand-hivis-hover`, `--color-brand-hivis-text` del `@theme`. No dejar alias muertos. **Desviación documentada**: se conservan como *alias de transición* hacia la paleta violeta para que el build siga compilando con los consumidores fuera de `layout/` (admin/, auth/, profile/, reports/, …) que aún los referencian. Ver `apply-progress.md` §Desviaciones.
- [x] **F0.1.3** — Re-apuntar el bloque `:root` de compatibilidad (`--primary-color`, `--secondary-color`, `--accent-color`, `--danger`, `--warning`, `--success`, `--info-color`) a los tokens nuevos, para que el CSS heredado de `_components.css` / `_forms.css` / `_tables.css` siga compilando.
- [x] **F0.1.4** — Sustituir la webfont en `frontend/src/index.html`: quitar Barlow Condensed, cargar Outfit con pesos 400/500/600/700. Fijar `--font-sans: 'Outfit', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- [x] **F0.1.5** — Buscar en todo `frontend/src` referencias residuales a `brand-navy`, `brand-hivis` y `Barlow` y reemplazarlas por el token equivalente. Grep debe quedar en cero. **Alcance aplicado a `frontend/src/app/layout/`** (DoD). **Segunda pasada**: los archivos del design system (`src/styles/_base.css`, `_utilities.css`, `_components.css`, `_forms.css`, `_tables.css`, `_badges.css`) ya están migrados a tokens canónicos (`brand-primary`, `brand-primary-hover`, `brand-primary-soft`, `prio-*`, `status-*`). El resto (features/ admin, auth, profile, reports) se retira pantalla por pantalla en F1-F6.

## F0.2 — Iconografía Lucide

- [x] **F0.2.1** — `pnpm add lucide-angular` desde `frontend/`; regenerar `pnpm-lock.yaml` (CI corre `--frozen-lockfile`, un lock desactualizado rompe el build). **Nota**: el paquete aparece como `deprecated` en npm con recomendación de migrar a `@lucide/angular`. Se mantiene el nombre porque `design.md` lo autoriza explícitamente; migración futura queda registrada en `apply-progress.md`.
- [x] **F0.2.2** — Crear `frontend/src/app/shared/components/ui-icon/ui-icon.component.ts` con el contrato de D3 (`name` requerido, `size` = 20, `strokeWidth` = 1.75). Nombre no reconocido → respaldo `circle-dot`; el nombre crudo NUNCA se emite como texto. **Implementación**: SVG inline renderizado en el propio componente (consume `LUCIDE_ICONS` token para `hasIcon/getIcon`); evita depender de `LucideAngularComponent` que tiene problemas de DI en entornos de test con Angular 21.
- [x] **F0.2.3** — Reemplazar en `frontend/src/app/layout/sidebar/sidebar.component.html` los `<span class="material-symbols-outlined">` (líneas ~64 y ~102) y los `<i class="bi bi-*">` por `<ui-icon>`. Incluye la lupa de búsqueda, la `x` de limpiar y el chevron de expandir.
- [x] **F0.2.4** — Reemplazar por `<ui-icon>` los iconos de `frontend/src/app/layout/header/header.html` (campana, engranaje, chevron del menú de usuario).
- [x] **F0.2.5** — Retirar del `index.html` la hoja de estilos de Material Symbols y la de Bootstrap Icons. No quedan consumidores dentro de `layout/`; los de fuera de `layout/` se migrarán en F1-F6 (esos archivos aún usan `bi bi-*` y se ha decidido no romper su build en esta fase).

## F0.3 — Shell: sidebar claro y agrupado

- [x] **F0.3.1** — Añadir `group?: string` a `MenuItem` en `frontend/src/app/core/models/menu.model.ts` (D4). Campo opcional: no rompe a ningún consumidor actual.
- [x] **F0.3.2** — En `sidebar.component.ts`, derivar un `computed` (`groupedMenuItems`) que agrupa `filteredMenuItems()` por `group` preservando el orden de llegada del backend. Los items sin `group` van primero, bajo un grupo con `label: null`.
- [x] **F0.3.3** — Reescribir el render de `sidebar.component.html` para emitir encabezados de sección (versalitas, atenuado) entre grupos.
- [x] **F0.3.4** — Reescribir `frontend/src/styles/_layout.css:243-335`: fondo blanco del sidebar, `.nav-link-custom` en gris pizarra, hover con fondo suave, `.active` con `--color-brand-primary-soft` + texto violeta. Eliminado el `border-left: 4px solid` hi-vis.
- [x] **F0.3.5** — Ajustar los bordes internos del sidebar (`border-white/10` en marca y buscador) a `--color-border-subtle`, ahora que el fondo es claro; el blanco translúcido es invisible sobre blanco.
- [x] **F0.3.6** — Crear `frontend/src/assets/logo.svg` (pin violeta del mock) y sustituir en `sidebar.component.html` la URL `https://i.imgur.com/oHyMUhU.png`. Corregido el `alt` («Tránsito Alerta SE») y el texto del brand («Tránsito Alerta»). **Segunda pasada**: se añadió `src/assets` como segundo `assets` source en `angular.json` (con `output: "assets"`) para servir el logo en `/assets/logo.svg` según la convención de Angular CLI y la ruta que `design.md` declara. `public/logo.svg` (creado en la primera pasada) fue borrado.

## F0.4 — Primitivos de UI

- [x] **F0.4.1** — `ui-badge`: píldora con variantes de estado (`pendiente|en_proceso|resuelto|cerrada`) y de prioridad (`low|medium|high|critical`), resueltas contra los tokens de F0.1.1. **Patrón tintado** (fondo = token con alfa baja, texto = `text-on-tint-*`), con `critical` como **única excepción sólida** — ver D10 para el mapa completo de las 8 variantes. **`critical` lleva icono además del color** (D9): `alert-octagon` sobre `bg-prio-critical` + `text-white`.
  > Corregido 2026-09-01 (3ª auditoría, WARNING-A). Este ítem citaba el mapeo previo a D10 (`bg-red-100` + `text-red-800`): al tomar D10 se actualizaron `spec.md` y `design.md` y **no** este archivo. Tercera aparición del patrón «regla implementada a medias» en el change, la segunda del arquitecto.
- [x] **F0.4.2** — `ui-card`: contenedor blanco `rounded-xl`, borde sutil, sombra tenue; inputs opcionales `title` y `subtitle`; proyección de contenido para el cuerpo y slot `[card-actions]` para la cabecera.
- [x] **F0.4.3** — `ui-button`: variantes `primary` (violeta sólido) | `secondary` (blanco con borde) | `ghost`; slot `[uiButtonIcon]` a la izquierda; estados `disabled` y `loading` (con spinner). Aplicado con selector de atributo (`button[uiButton]`, `a[uiButton]`) para soportar anclas.
- [x] **F0.4.4** — `ui-page-header`: kicker en versalitas atenuadas + título grande (patrón `GESTIÓN / LISTADO` → `Incidencias` del mock 02-01); slot `[page-header-actions]` a la derecha.
- [x] **F0.4.5** — `ui-kpi-card`: bloque de color **sólido** — valor grande, etiqueta, icono en cuadro translúcido, pie de tendencia en versalitas (mock 01-01). Input `tone` para elegir el color de la escala (`brand` | `cyan` | `green` | `red` | `slate` | `amber` | `violet`). **El fondo sólido es la regla; el color del texto lo fija D12 según el tono**: blanco para los oscuros, `text-on-tint-graphite` para `cyan`, `green` y `amber`. Contraste exigido: **≥ 4.5:1** en todos los pares (el umbral es el contrato, no la cifra).
  > Corregido 2026-09-02 (4ª auditoría, WARNING-2). Este ítem decía «con texto blanco» sin calificar la excepción de D12. Es el **mismo archivo y el mismo mecanismo** que WARNING-A de la 3ª pasada: entonces se corrigió F0.4.1 y no se revisó F0.4.5, dos líneas más abajo. Cuarta aparición del patrón «regla implementada a medias» en el change.
- [x] **F0.4.6** — `ui-table`: envoltorio con `table.ui-table` y un set de helper classes para que F1-F6 monten listados consistentes con el mock 02-01:
  - `ui-table-title` / `ui-table-subtitle` — celda de título con subtítulo atenuado.
  - `ui-table-cell-select` — celda de checkbox (ancho fijo 2.5rem, centrada).
  - `ui-table-cell-actions` — celda de acciones (alineada a la derecha, gap entre hijos, nowrap).
  - `ui-table-row-selected` — fila con fondo violeta suave (item activo).
  - Caption opcional vía `caption` input. Las reglas CSS (versalitas, espaciado, hover) viajan en el componente y se aplican mediante `table.ui-table th` / `td`. **Nota sobre proyección**: las styles de `<th>`/`<td>` no se propagan automáticamente a la proyección por la Angular encapsulation; los consumidores deben usar las helper classes. JSDoc con ejemplo completo.
- [x] **F0.4.7** — Refactorizar `frontend/src/app/shared/components/status-badge/` para que envuelva `ui-badge` (D6), preservando su API pública actual (`status`, `customLabel`, `customTone`, `dot`) para no romper consumidores.

## F0.5 — Tests

- [x] **F0.5.1** — Spec unitario por primitivo (`ui-badge`, `ui-card`, `ui-button`, `ui-page-header`, `ui-kpi-card`, `ui-table`): render y resolución de variante. Aserción sobre la variante/clase resuelta, no sobre el literal de color.
- [x] **F0.5.2** — `ui-icon`: caso nombre válido → glifo Lucide; caso nombre desconocido → respaldo renderizado y el string crudo ausente del DOM. Este test blinda el defecto que hoy imprime `alert-triangle` en pantalla. **Cubre también**: proveedor ausente → respaldo circle-dot.
- [x] **F0.5.3** — Sidebar: items agrupados bajo su encabezado, items sin `group` renderizados primero, item activo con la clase violeta. **Aclaración**: la verificación del fondo violeta del item activo se hace leyendo la regla CSS literal en `_layout.css` (jsdom no carga Tailwind), no computando el estilo.
- [x] **F0.5.4** — Test de regresión de tokens: falla si aparece `#CCFF00`, `brand-hivis`, `material-symbols-outlined` o `bi bi-` bajo `frontend/src/app/layout/`. El test se excluye a sí mismo.
- [x] **F0.5.5** — Correr `pnpm lint && pnpm test` desde `frontend/`. **Estado**: `pnpm test` 100/102 verde (2 fallas pre-existentes en `auth.interceptor.spec.ts`, no F0). `pnpm lint` no ejecutable (ESLint 10.9 sin flat config; pre-existente). Ver `apply-progress.md` §Estado de quality gates. **Tests F0 en aislado** (`pnpm test -- --testPathPatterns='layout-tokens|ui-|sidebar'`): 33/33 verde.

---

## Definition of Done

- [x] `pnpm build` en verde desde `frontend/`
- [x] Los seis primitivos existen, están exportados (vía barrel en `shared/components/index.ts`) y tienen spec
- [x] El sidebar coincide con el mock: fondo blanco, secciones, activo violeta, iconos Lucide dibujados
- [x] Grep en cero para `#CCFF00`, `brand-hivis`, `Barlow`, `material-symbols-outlined` y `bi bi-` dentro de `layout/`
- [x] CSS del design system migrado a tokens canónicos (`_base`, `_utilities`, `_components`, `_forms`, `_tables`, `_badges`)
- [x] Logo en `src/assets/logo.svg`, servido en `/assets/logo.svg` por `angular.json`
- [x] `ui-table` con helper classes para selección, acciones, fila seleccionada y caption opcional
- [x] Ningún cambio bajo `backend/` ni en `app.routes.ts` — el enrutado es F1
