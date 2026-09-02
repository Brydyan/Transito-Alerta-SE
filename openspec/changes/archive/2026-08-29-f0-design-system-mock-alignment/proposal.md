# Proposal: F0 — Design System Alignment con `docs/mock`

## Intent

`docs/mock/` (18 PNG, 11 vistas) es ahora la **única fuente de verdad visual** del
proyecto: el frontend legacy `/GeoReporta` fue borrado del disco y sólo sobrevive
su índice `GeoReporta/.codegraph/codegraph.db` (35 MB, 686 archivos, metadatos de
símbolos sin cuerpo) más `GeoReporta/openspec/changes/profile-redesign/app-shell-retina-audit.md`.

Ese audit conserva un dato que cierra la discusión de marca: el avatar del
app-shell legacy usaba `linear-gradient(135deg, #6a5cf3, #a06bf5)` — **violeta**,
igual que los mocks. El tema implementado hoy en `frontend/src/styles/_variables.css`
es *"Corporate Water Theme"*: navy `#1E1E54` + hi-vis `#CCFF00`. No corresponde a
ningún mock ni al legacy.

Deriva verificada (mock ↔ implementación):

| Token | Mock (`docs/mock/*.png`) | `_variables.css` hoy |
|---|---|---|
| Fondo sidebar | Blanco `#FFFFFF` | Navy `#1E1E54` |
| Primario | Violeta `#7C3AED` | Navy `#1E1E54` |
| Acento / activo | Fondo violeta claro + texto violeta | Navy-light + borde izq. hi-vis `#CCFF00` |
| Tipografía | Sans geométrica (Poppins/Outfit) | `Barlow Condensed` |
| Agrupación sidebar | Sí — INCIDENCIAS / GESTIÓN / CATÁLOGOS | No, lista plana |
| Iconografía | Lucide (outline) | Material Symbols + Bootstrap Icons mezclados |
| Logo | Pin violeta inline | `https://i.imgur.com/oHyMUhU.png` (URL externa) |

F0 es **bloqueante**: F1–F6 escriben pantallas nuevas y no deben escribirlas dos
veces. Sin tokens y primitivos estables, cada fase inventa su propio botón.

## Scope

### In Scope
- Reescribir `frontend/src/styles/_variables.css` con la paleta violeta del mock
- Sustituir `Barlow Condensed` por la sans geométrica del mock (ver D2)
- Instalar `lucide-angular` y retirar Material Symbols / Bootstrap Icons del shell
- Reescribir el sidebar a fondo blanco con encabezados de sección
  (`frontend/src/styles/_layout.css:243-335`)
- Logo inline SVG — eliminar la dependencia de imgur
- Primitivos compartidos nuevos en `frontend/src/app/shared/components/`:
  `ui-badge`, `ui-card`, `ui-button`, `ui-table`, `ui-page-header`, `ui-kpi-card`
- Alinear `status-badge` (ya existe) a la paleta de estados del mock

### Out of Scope
- Cualquier pantalla nueva (F2–F5)
- Rediseño de Dashboard / Usuarios / Roles / Perfil existentes → **F6**
- Corregir el enrutado del menú → **F1**
- Modo oscuro (ningún mock lo define)

## Capabilities

### New Capabilities
- `design-system`: tokens, tipografía, iconografía y primitivos de UI derivados de `docs/mock`

### Modified Capabilities
- ninguna (F0 no toca contratos de API)

## DB Schema Changes

Ninguna. F0 es exclusivamente de presentación.

## Permission Requirements (RBAC)

Ninguna. F0 no introduce rutas ni endpoints.

## Domain Module Dependencies

Ninguna del lado backend. Consume `frontend/src/app/shared/components/` existente
(breadcrumb, confirm-dialog, date-picker, empty-state, pagination, pdf-previewer,
spinner, status-badge, table-skeleton, toast) — `status-badge` se re-paleta, el
resto queda intacto.

## Approach

Los tokens viven en `@theme` de Tailwind 4 (`_variables.css` ya usa ese bloque),
así que cambiar el valor de `--color-*` repinta toda utilidad `bg-brand-*` sin
tocar plantillas. El `:root` de compatibilidad que ya existe (`--primary-color`,
`--accent-color`, …) se conserva y se re-apunta, de modo que el CSS heredado no
se rompe durante la transición.

Los primitivos se extraen **de los mocks, no de las pantallas actuales**, para que
F2–F5 los consuman ya correctos y F6 sólo tenga que migrar las cuatro pantallas
viejas.

## Dependencies

- Ninguna. F0 es la raíz del grafo de fases.
- **Bloquea**: F1, F2, F3, F4, F5, F6.

## Risks

- **R1 — Regresión visual en las 4 pantallas existentes.** Dashboard, Usuarios,
  Roles y Perfil quedan con paleta nueva y maquetación vieja hasta F6. Aceptado y
  acotado: son pantallas internas, y F6 las cierra.
- **R2 — La tipografía del mock no está confirmada por nombre.** Se infiere de los
  PNG. Ver D2: se elige Outfit y se deja la decisión reversible en un solo token.
