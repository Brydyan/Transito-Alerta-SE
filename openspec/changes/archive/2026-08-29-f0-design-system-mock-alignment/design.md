# Design: F0 — Design System Alignment

## Technical Approach

Tailwind 4 ya está en uso vía `@tailwindcss/postcss` y `frontend/src/styles/_variables.css`
ya declara un bloque `@theme`. Cambiar el **valor** de cada `--color-*` dentro de ese
bloque repinta toda utilidad derivada (`bg-brand-*`, `text-brand-*`) sin tocar una
sola plantilla. Ese es el punto de apalancamiento de toda la fase.

El `:root` de compatibilidad que ya existe (`--primary-color`, `--accent-color`,
`--danger`, …) **se conserva** y se re-apunta a los tokens nuevos. Así el CSS
heredado de `_components.css`, `_forms.css`, `_tables.css` sigue compilando durante
la transición y F6 puede migrarlo pantalla por pantalla sin un big-bang.

Los primitivos se derivan de los PNG del mock, no de las pantallas existentes, para
que F2–F5 los consuman ya correctos.

## Architecture Decisions

**D1 — Paleta violeta como reemplazo total, no como tema alterno.**
Se sustituyen los valores de `--color-brand-*` en sitio. Rechazado: añadir un tema
paralelo con conmutador. Motivo: ningún mock define dos temas, y mantener navy vivo
garantiza que pantallas nuevas hereden el tema equivocado por descuido. El
`app-shell-retina-audit.md` del legacy (`linear-gradient(135deg, #6a5cf3, #a06bf5)`)
confirma que el violeta es la marca histórica, no una preferencia nueva.

Tokens resultantes:

| Token | Valor | Origen |
|---|---|---|
| `--color-brand-primary` | `#7C3AED` | Botón «Exportar»/«Filtrar», item activo, mock 01-01/02-01 |
| `--color-brand-primary-hover` | `#6D28D9` | Un escalón violeta por debajo |
| `--color-brand-primary-soft` | `#F5F3FF` | Fondo del item activo del sidebar |
| `--color-bg-primary` | `#F8F9FA` | **sin cambio** — ya coincide con el lienzo del mock |
| `--color-bg-secondary` | `#FFFFFF` | **sin cambio** — tarjetas y sidebar |
| `--color-border-subtle` | `#E2E8F0` | **sin cambio** |
| `--color-status-pendiente` | `#94A3B8` | Badge «Pendiente», mock 02-01 |
| `--color-status-proceso` | `#7C3AED` | Badge «En proceso» |
| `--color-status-resuelto` | `#10B981` | Badge «Resuelto» |
| `--color-status-cerrada` | `#1F2937` | Badge «Cerrada» |
| `--color-prio-low` | `#10B981` | Badge «Baja» |
| `--color-prio-medium` | `#FCD34D` | Badge «Media» (texto grafito) |
| `--color-prio-high` | `#EF4444` | Badge «Alta» |
| `--color-prio-critical` | `#B91C1C` | Badge «Crítica» — **no está en ningún mock**, ver D9 |
| `--color-accent-cyan` | `#06B6D4` | KPI «En proceso», mock 01-01 |
| `--color-accent-green` | `#22C55E` | KPI «Resueltas», barras del gráfico semanal |

`--color-brand-hivis*` se **elimina**, no se deja huérfano: un token muerto vuelve
a colarse en la próxima pantalla.

**D2 — Tipografía: Outfit, con la decisión encapsulada en un token.**
Los PNG muestran una sans geométrica de terminaciones rectas y `a` de un piso;
Outfit es la coincidencia más cercana disponible en Google Fonts. No hay forma de
confirmar el nombre exacto desde una imagen, así que la elección se aísla en
`--font-sans` y cambiarla luego es una línea. Pesos usados: 400 / 500 / 600 / 700.
Pila de respaldo: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
`Barlow Condensed` se retira de `index.html` y de `--font-sans`.

**D3 — Lucide como familia única, vía `lucide-angular`.**
Es la decisión que además **corrige un defecto real**: `backend/src/modules/menus/menu-map.ts`
ya emite nombres Lucide (`alert-triangle`, `clipboard-list`, `message-circle`,
`users`, `shield`) y `sidebar.component.html:102` los inyecta en un span
`.material-symbols-outlined`. La ligadura no resuelve y el navegador imprime el
nombre crudo — exactamente lo que se observa hoy en pantalla.

Contrato del envoltorio:

```ts
// frontend/src/app/shared/components/ui-icon/ui-icon.component.ts
@Component({ selector: 'ui-icon', standalone: true, /* … */ })
export class UiIconComponent {
  readonly name = input.required<string>();          // nombre Lucide kebab-case
  readonly size = input<number>(20);
  readonly strokeWidth = input<number>(1.75);
}
```

Nombre desconocido → icono de respaldo `circle-dot`, nunca el texto crudo. Se
rechaza mapear Lucide → Material Symbols: sería adaptar el frontend a la familia
equivocada teniendo el backend ya alineado a Lucide.

**D4 — Agrupación del sidebar dirigida por datos, no hardcodeada.**
El sidebar deja de asumir una lista plana y renderiza `MenuGroup[]`. El modelo
frontend gana un campo opcional `group`; los items sin `group` se pintan arriba,
antes del primer encabezado (así se comporta `Dashboard` en los mocks).

```ts
// frontend/src/app/core/models/menu.model.ts
export interface MenuItem {
  id: number;
  name: string;
  route: string;
  icon?: string;
  group?: string;          // NUEVO — encabezado de sección, p.ej. 'INCIDENCIAS'
  children?: MenuItem[];
}
```

**Quién llena `group` es una decisión de F1**, no de F0. F0 sólo garantiza que el
sidebar sepa renderizarlo y que un `group` ausente degrade limpio. Esto mantiene a
F0 libre de cambios de contrato de API.

**D5 — Primitivos standalone, sin librería de componentes.**
Angular 21 standalone + Tailwind. Rechazado adoptar Angular Material para estos
seis: `@angular/material` ya está instalado y se usa (`matTooltip` en el sidebar),
pero sobrescribir su theming para alcanzar el look del mock cuesta más que escribir
seis componentes de presentación. Material se conserva donde ya aporta comportamiento
(tooltip, datepicker, overlay).

**D9 — Cuatro prioridades, no tres: `critical` es la emergencia.**
Los mocks dibujan tres badges de prioridad (Baja, Media, Alta), pero el dominio tiene
**cuatro** y la cuarta lleva construida desde el principio:

```sql
-- database/migrations/0004_incidents.sql:27
priority varchar(20) NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high', 'critical'))
```

`critical` está en `IncidentPriority` (`entities/incident.entity.ts:9`),
`create-incident.dto.ts:21`, `incident-analytics.service.ts:128` y
`incident-workflow.service.ts:32`. Lo único que falta es exponerla: **nunca se maquetó.**

Ahí es donde encaja el reporte de emergencia. No hace falta un tipo nuevo de incidencia
ni un dominio aparte: la emergencia es una incidencia con `priority = 'critical'`.

Dos consecuencias de diseño:

1. La escala de tokens tiene cuatro entradas, no tres. Si F0 sólo definiera las del
   mock, cada pantalla posterior improvisaría el color de `critical` por su cuenta.
2. **`high` y `critical` no pueden distinguirse sólo por el tono de rojo.** El badge
   `critical` lleva además un icono. Dos rojos contiguos son indistinguibles para buena
   parte de los usuarios, y confundir «alta» con «emergencia» es precisamente el error
   que no se puede permitir.

**D6 — `status-badge` se re-paleta, no se duplica.**
`frontend/src/app/shared/components/status-badge/` ya existe. `ui-badge` es el
primitivo genérico; `status-badge` pasa a ser un envoltorio delgado sobre él que
traduce estado de dominio → variante. Evita dos componentes compitiendo por el
mismo pixel.

---

> **Decisiones D10–D12 — añadidas 2026-09-01 tras el FAIL de `sdd-verify`.**
> Resuelven los dos ítems que `fixes-required.md` dejó bloqueados en arquitectura,
> más un tercero que la auditoría no detectó. Registro de qué cambió y por qué al
> final de cada una.

**D10 — Los badges son tintados; `critical` es la única excepción sólida. La paleta gana tonos de texto.**

*Qué decía el contrato*: `spec.md` exigía fondos sólidos con hex exactos
(`#94A3B8 / #7C3AED / #10B981 / #1F2937` y `#10B981 / #FCD34D / #EF4444 / #B91C1C`)
**y** contraste ≥ 4.5:1.

*Qué encontró la auditoría*: las dos exigencias son incompatibles. Medido sobre los
propios tokens, con el umbral de 4.5 que corresponde al `text-xs` (12 px) del badge:

| Variante | Token | Sólido + blanco | Sólido + casi negro |
|---|---|---|---|
| `pendiente` | `#94A3B8` | 2.56 ✗ | 8.19 ✓ |
| `en_proceso` | `#7C3AED` | 5.70 ✓ | 3.70 ✗ |
| `resuelto` / `low` | `#10B981` | 2.56 ✗ | 8.19 ✓ |
| `cerrada` | `#1F2937` | 13.5 ✓ | ✗ |
| `medium` | `#FCD34D` | 1.70 ✗ | 12.1 ✓ |
| `high` | `#EF4444` | 3.76 ✗ | **4.34 ✗** |
| `critical` | `#B91C1C` | 6.54 ✓ | ✗ |

«Sólido + texto blanco» uniforme —el patrón que dibuja el mock 02-01— falla AA en
cinco de ocho variantes. Y `#EF4444` **no alcanza 4.5:1 con ningún color de texto**:
como fondo sólido es inviable sin cambiar el valor del token.

*Qué se decide*: **patrón tintado** — fondo = token con alfa baja sobre blanco, texto =
tono profundo de la misma familia cromática. Única excepción: **`critical` va sólido con
texto blanco** (6.54 ✓).

Motivos, en orden de peso:

1. Es el único esquema donde las ocho variantes pasan AA **sin alterar el valor de
   ningún token**. Cambiar los hex rompería `ui-kpi-card`, que ya los consume.
2. Los badges aparecen repetidos en filas densas de tabla (mock 02-01). Una columna de
   píldoras saturadas compite con el contenido; el tintado sostiene mejor la densidad.
3. `critical` sólido **gana significado**: es la única variante que rompe el patrón, y
   eso la hace saltar antes de que el ojo lea el texto. Sumado al icono de D9, queda
   distinguible por forma, por peso visual y por color.
4. Conserva la implementación que Minimax ya entregó. La desviación tenía fundamento;
   se absorbe en el contrato en vez de revertirse.

*El sólido no desaparece*: se reserva para `ui-kpi-card` (mock 01-01), donde bloques de
color plano con texto blanco son el patrón correcto. Badge tintado y KPI sólido no es
una inconsistencia — son dos roles distintos, y la regla queda escrita.

*Tokens nuevos*. La paleta actual define **rellenos pero no tonos de texto**, que es la
causa de fondo del defecto: `ui-badge` tuvo que improvisar `text-emerald-700` porque no
existía un verde profundo. Se añaden seis:

| Token | Valor | Uso |
|---|---|---|
| `--color-on-tint-slate` | `#334155` | texto sobre tinte de `pendiente` |
| `--color-on-tint-violet` | `#6D28D9` | texto sobre tinte de `en_proceso` (= `brand-primary-hover`) |
| `--color-on-tint-green` | `#065F46` | texto sobre tinte de `resuelto` y `low` |
| `--color-on-tint-amber` | `#78350F` | texto sobre tinte de `medium` |
| `--color-on-tint-red` | `#991B1B` | texto sobre tinte de `high` |
| `--color-on-tint-graphite` | `#1F2937` | texto sobre tinte de `cerrada` (= `status-cerrada`) |

Los dos que duplican un valor existente se declaran igual, con nombre propio: el token
de relleno y el de texto tienen ciclos de vida distintos y aliasarlos ata dos decisiones
que deben poder moverse por separado.

*Mapa final de `ui-badge`* — el contrato que debe implementarse:

| Variante | Fondo | Texto | Contraste |
|---|---|---|---|
| `pendiente` | `bg-status-pendiente/20` | `text-on-tint-slate` | 9.5 ✓ |
| `en_proceso` | `bg-brand-primary-soft` | `text-on-tint-violet` | 6.5 ✓ |
| `resuelto` | `bg-status-resuelto/15` | `text-on-tint-green` | 7.1 ✓ |
| `cerrada` | `bg-status-cerrada/12` | `text-on-tint-graphite` | 9.9 ✓ |
| `low` | `bg-prio-low/15` | `text-on-tint-green` | 7.1 ✓ |
| `medium` | `bg-prio-medium/40` | `text-on-tint-amber` | 8.1 ✓ |
| `high` | `bg-prio-high/15` | `text-on-tint-red` | 7.5 ✓ |
| `critical` | `bg-prio-critical` (sólido) | `text-white` + icono `alert-octagon` | 6.5 ✓ |

Ninguna clase de escala stock de Tailwind (`slate-*`, `emerald-*`, `amber-*`, `red-*`)
debe sobrevivir en el componente. Los porcentajes de alfa son el punto de partida
verificado; ajustarlos ±5 no rompe el contraste, cambiar el token de texto sí.

*Alternativa rechazada — sólido con texto por variante*: se acerca más al mock, pero
obliga a cambiar el valor de `--color-prio-high`, que `ui-kpi-card` ya consume. Un
cambio de paleta arrastrado por un problema de contraste de otro componente es
precisamente el acoplamiento que los tokens existen para evitar.

**D11 — El escenario «Hi-vis retirado» se acota a `layout/` y al design system; los alias se retiran en F6.**

*Qué decía el contrato*: `spec.md` — *«GIVEN el árbol de estilos completo WHEN se busca
`#CCFF00` o `--color-brand-hivis` THEN no hay coincidencias»*. Sin limitador de alcance.

*Qué encontró la auditoría*: `tasks.md` había acotado el DoD a `layout/`, pero el spec
nunca se actualizó — dos artefactos del mismo change afirmando alcances distintos.
Y se comprobó empíricamente que retirar los alias **rompe el build**:
`Cannot apply unknown utility class 'bg-brand-navy/60'` en `role-editor.component.css`,
`system-config.component.css`, `user-form.component.css`, `profile.component.css`,
`clients-list.css` y `_modals.css`. Tailwind 4 falla duro en `@apply` sobre utilidades
desconocidas — a diferencia de referenciarlas como `class="…"` plano, que sólo queda sin
estilo.

*Qué se decide*: el escenario se acota. F0 garantiza la retirada en `layout/` y en los
archivos del design system; los alias sobreviven como puente declarado hasta F6.

*Se corrige de paso una afirmación de D1*: «`--color-brand-hivis*` se **elimina**, no se
deja huérfano». Sigue siendo el destino, pero no en F0. El token **no queda huérfano**
—apunta a la paleta violeta, verificado— y su retirada tiene ticket y fase asignada:
[sc-323](https://app.shortcut.com/upse/story/323), estimación 3, epic 192. Un alias con
dueño y fecha no es el token muerto contra el que D1 prevenía.

El ticket cubre también el **segundo** bloque de puente que la auditoría no señaló
(`--color-status-critical/pending/info/success`, consumido por `_badges.css`), donde vive
una trampa activa: `--color-status-pending` (`#FFC600`) y `--color-status-pendiente`
(`#94A3B8`) se diferencian en un carácter y son colores distintos. `bg-status-pending`
compila sin error y pinta el color equivocado.

*Alternativa rechazada — migrar los 17 consumidores dentro de F0*: son pantallas que
F1–F6 rediseñan igual. Migrarlas ahora es trabajo que se tira dos veces.

*Excepción*: los **seis** consumidores que viven en `shared/components/` sí entran en F0
—`breadcrumb`, `date-picker`, `toast`, `pagination`, `confirm-dialog`, `empty-state`—.
Son primitivos compartidos, que es lo que F0 entrega, y F1 los consume apenas arranque.

**D12 — El requisito de contraste alcanza a `ui-kpi-card`, no sólo a los badges.**

*Qué no vio la auditoría*: revisando la paleta para D10 apareció que
`ui-kpi-card.component.ts:82-107` empareja tres tonos con `text-white`:

| Tono | Token | Contraste con blanco |
|---|---|---|
| `cyan` | `--color-accent-cyan` `#06B6D4` | **2.44 ✗** |
| `green` | `--color-accent-green` `#22C55E` | **2.28 ✗** |
| `red` | `--color-prio-high` `#EF4444` | **3.76 ✗** |
| `brand` | `#7C3AED` | 5.70 ✓ |
| `violet` | `#6D28D9` | 7.10 ✓ |
| `slate` | `#334155` | 10.4 ✓ |

La etiqueta y el pie de tendencia van en versalitas pequeñas, así que les aplica el
umbral de 4.5. `cyan` y `green` no alcanzan **ni siquiera el 3:1** de texto grande, así
que el valor grande tampoco se salva.

La auditoría no lo detectó porque miró `ui-badge` y dio `ui-kpi-card` por bueno —
justamente por usar los tokens correctamente. Usarlos bien y emparejarlos mal son cosas
distintas.

*Qué se decide*: el escenario «Contraste accesible» del spec deja de limitarse a badges y
pasa a cubrir todo par texto/fondo de los primitivos de F0. Los tres tonos afectados
llevan **texto grafito** (`--color-on-tint-graphite`) en vez de blanco:

| Tono | Fondo | Texto | Contraste |
|---|---|---|---|
| `cyan` | `bg-accent-cyan` | `text-on-tint-graphite` | 6.4 ✓ |
| `green` | `bg-accent-green` | `text-on-tint-graphite` | 6.9 ✓ |
| `red` | `bg-prio-high` | `text-white` → `bg-prio-critical` + `text-white` | 6.5 ✓ |

Para `red` se cambia el **fondo**, no el texto: `#EF4444` con grafito da 4.34, sigue por
debajo. `--color-prio-critical` (`#B91C1C`) con blanco da 6.54 y además alinea el KPI de
críticas con el badge `critical`, que ya es sólido en ese mismo rojo por D10.

*Por qué entra ahora y no en un change aparte*: es el mismo defecto de raíz que D10 —una
paleta de rellenos emparejada con blanco por defecto— en el componente de al lado.
Arreglar `ui-badge` y dejar `ui-kpi-card` roto reproduce exactamente el patrón «regla
implementada a medias» que `openspec/ROADMAP.md` fija como trampa conocida del proyecto:
aplicada donde entró la funcionalidad, ausente en el vecino.

## Data Flow

F0 no introduce flujo de datos. La única cadena afectada es de render:

`MenuService.menuItems()` → `MenuItem[]` (con `group?`) → `sidebar.component.html`
agrupa por `group` preservando el orden de llegada → `<ui-icon [name]="item.icon">`
→ glifo Lucide.

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/styles/_variables.css` | Modificar (D1/D2) | Paleta violeta + escala de estados; elimina `--color-brand-hivis*`; `--font-sans` → Outfit |
| `frontend/src/index.html` | Modificar (D2) | Sustituye la webfont Barlow Condensed por Outfit |
| `frontend/src/styles/_layout.css` (243-335) | Modificar (D4) | Sidebar blanco, item activo violeta, estilos de encabezado de sección; retira el borde izq. hi-vis |
| `frontend/src/app/layout/sidebar/sidebar.component.html` | Modificar (D3/D4) | Render agrupado; `<ui-icon>` en lugar de `.material-symbols-outlined` y `bi bi-*` |
| `frontend/src/app/layout/sidebar/sidebar.component.ts` | Modificar (D4) | `computed` que agrupa `filteredMenuItems()` por `group` |
| `frontend/src/app/layout/header/header.html` | Modificar (D3) | Iconos de campana/engranaje/chevron a Lucide |
| `frontend/src/app/core/models/menu.model.ts` | Modificar (D4) | Campo opcional `group` |
| `frontend/src/app/shared/components/ui-icon/` | Nuevo (D3) | Envoltorio Lucide con respaldo |
| `frontend/src/app/shared/components/ui-badge/` | Nuevo (D5) | Píldora de estado/prioridad |
| `frontend/src/app/shared/components/ui-card/` | Nuevo (D5) | Contenedor blanco `rounded-xl` con borde y título/subtítulo opcionales |
| `frontend/src/app/shared/components/ui-button/` | Nuevo (D5) | Variantes `primary` \| `secondary` \| `ghost`, con slot de icono |
| `frontend/src/app/shared/components/ui-page-header/` | Nuevo (D5) | Kicker en versalitas + título grande |
| `frontend/src/app/shared/components/ui-kpi-card/` | Nuevo (D5) | Tarjeta sólida de color con valor, icono y tendencia |
| `frontend/src/app/shared/components/ui-table/` | Nuevo (D5) | Envoltorio de tabla con encabezado en versalitas |
| `frontend/src/app/shared/components/status-badge/` | Modificar (D6) | Pasa a envolver `ui-badge` |
| `frontend/src/assets/logo.svg` | Nuevo (D1) | Pin violeta inline; retira `https://i.imgur.com/oHyMUhU.png` |
| `frontend/package.json` | Modificar (D3) | `+ lucide-angular`; regenerar `pnpm-lock.yaml` (CI usa `--frozen-lockfile`) |

## Redis Caching Strategy

No aplica — F0 no toca backend.

## Testing Strategy

- Unit (Jest + `@testing-library/angular`): un spec por primitivo. Para `ui-badge`,
  aserción sobre la clase/variante resuelta por estado, no sobre el string de color.
- `ui-icon`: caso de nombre desconocido → se renderiza el respaldo y el nombre crudo
  **no** aparece en el DOM de texto. Este test es la regresión que blinda el defecto D3.
- Sidebar: agrupación correcta e items sin `group` colocados primero.
- Regresión de tokens: un test que falla si `#CCFF00` o `material-symbols-outlined`
  reaparecen bajo `frontend/src/app/layout/`.
- Sin e2e nuevos en F0 — Playwright entra en las fases con pantallas.
