# Mockup Spec — Feed de Incidencias

Source design: `Flujo.dc.html` (Claude Design project `c267f032-933e-4b0c-9712-51901affe65d`)

Two screens to implement:
- **Screen 10** → `screen-10-feed-incidencias.design.html` (desktop, admin-facing)
- **Screen 11** → `screen-11-feed-mobile.design.html` (mobile iOS, citizen-facing)

Both screens show the same incident feed data but differ in layout, target user, and interactions.

---

## Design tokens (shared)

| Token | Value |
|---|---|
| Brand primary | `#6a5cf3` → `#a06bf5` (gradient) |
| Font | `'Be Vietnam Pro', sans-serif` |
| Background | `#f3f4f9` |
| Card bg | `#ffffff` |
| Card radius | `18px` |
| Card shadow | `0 1px 3px rgba(20,20,50,.04)` |
| Status: en proceso | bg `#e4e8ff`, text `#5a6ff0` |
| Status: pendiente | bg `#fff4d6`, text `#d99a00` |
| Status: resuelto | bg `#d8f6e7`, text `#16a96b` |
| Priority: alta | bg `#ffe9ee`, text `#fa5a7d` |
| Priority: media | color `#f0a020` |
| Priority: baja | color `#16a96b` |
| Tag pill | bg `#f0edff`, text `#6a5cf3` |

---

## Screen 10 — Feed de Incidencias (Desktop)

**File:** `frontend/app/feed/` (existing) — needs redesign to match this spec  
**Layout:** Sidebar (256px) + Topbar (72px) + 3-column content area  
**Renders inside:** the admin dashboard shell (same Sidebar/Topbar as other admin screens)

### Layout structure

```
┌─ Sidebar 256px ─┬────────────────────────────────────────────────┐
│                 │ Topbar 72px                                     │
│  (existing)     ├──────────────────────┬────────────────────────┤
│                 │  Feed center (flex:1) │  Right panel (~320px)  │
│                 │                      │                        │
│                 │  [Composer bar]       │  [Map overview]        │
│                 │  [Incident card 1]    │  [Trending tags]       │
│                 │  [Incident card 2]    │  [By category]         │
└─────────────────┴──────────────────────┴────────────────────────┘
```

### Composer bar

- Full-width card with `border-radius: 18px`
- User avatar (40px circle, gradient, initials)
- Placeholder input styled as pill: `background: #f3f4f9`, text `¿Qué incidencia deseas reportar hoy?`
- "Reportar" button: gradient `#6a5cf3→#a06bf5`, icon `fa-location-dot`, links to create form

### Incident card

Each card has:

1. **Header row**: avatar (42px circle, gradient color per user), name (700 weight), location+time (12px, `#b3b8c6`, icon `fa-location-dot` purple), status badge, priority badge
2. **Title row**: `font-size: 15px; font-weight: 700; color: #23283b` + INC-XXXX id in muted gray
3. **Description**: 13.5px, `color: #5b6172`, max 2–3 lines
4. **Tags row**: `#` prefixed pills with `background: #f0edff; color: #6a5cf3; border-radius: 10px`
5. **Map preview** (180px height): styled div simulating map with grid pattern, colored map pin, coordinates badge bottom-left
6. **Actions bar**: left group = ghost buttons (comments count, follow, "Yo también reporto") | right = filled "Ver detalle" button

Action buttons:
- Ghost: `height: 36px; border-radius: 22px; border: 1px solid #eef0f5; background: #fff`
- Primary: `border-radius: 22px; background: gradient; color: #fff; box-shadow: 0 6px 14px -6px rgba(106,92,243,.55)`

### Right panel

**Map overview** (same map-placeholder styling, taller, ~300px):
- Full-width within panel
- Shows multiple colored pins (red=alta, blue=en proceso, yellow=pendiente, green=resuelto)
- Legend bottom-left with color dots

**Trending tags** card:
- Title: "Tendencias" 15px 700
- Tags: `# Baches (142)`, `# Alumbrado (118)`, `# Agua (96)`, `# Residuos (74)`
- Each tag: pill with count, `background: #f0edff; color: #6a5cf3`

**By category** card:
- Bar chart per category: Infraestructura, Servicios, Medio ambiente, Seguridad
- Bars: gradient `#7d8bf8→#5a6ff0`, height proportional to count

### State management

- Filters: Todo / Pendientes / En proceso / Resueltos (existing chips, restyled to match design)
- Infinite scroll: existing sentinel approach, keep it
- Auth check: show/hide Composer bar and FAB based on `auth.isAuthenticated()`
- Each card's "Yo también reporto" → calls same vote/claim API
- "Ver detalle" → navigate to incident detail route

---

## Screen 11 — Feed Mobile (iOS)

**File:** `frontend/app/layout-usuario/` + `frontend/app/feed/` (citizen-facing shell)  
**Layout:** Full mobile (393px wide, fits iOS viewport)  
**Target user:** Citizens (public, no sidebar/admin chrome)

### Structure

```
┌───────────────────────────────┐
│ Header: logo + bell + avatar  │  56px, bg white
├───────────────────────────────┤
│ Filter chips (horizontal)     │  ~44px, bg white, scrollable
├───────────────────────────────┤
│                               │
│  Incident card 1              │
│  Incident card 2              │
│  ...                          │  flex:1, overflow-y: auto, padding 12px, gap 12px
│                               │
├───────────────────────────────┤
│ Bottom nav bar                │  60px
└───────────────────────────────┘
```

### Header

- Height: ~56px, `background: #fff; border-bottom: 1px solid #eef0f5`
- Left: 32px logo icon (gradient, `fa-location-dot`) + "GeoReporta" `font-size: 17px; font-weight: 800`
- Right: notification bell (36px circle `#f3f4f9`) with red dot badge + user avatar (34px gradient circle, initials)

### Filter chips

- Horizontal row, `overflow-x: auto`, no scrollbar
- Active chip: gradient `#6a5cf3→#a06bf5`, white text
- Inactive chips: `background: #f3f4f9; border: 1px solid #eef0f5; color: #6b7180`
- Chips: "Todo", "Infra.", "Servicios", "Ambiente", "Seguridad"

### Mobile incident card

1. **Header**: avatar 36px circle + name (13px 700) + location+time (11px muted) + priority badge right-aligned
2. **Mini map** (130px height): same map-placeholder, smaller pin (28px), coordinates badge
3. **Body**: title (14px 700) + description (12.5px, 2 lines) + tags row (status badge + category tag)
4. **Action bar** (3-column, border-top): comments count | "Yo también" | "Ver" (colored `#6a5cf3`)

### Bottom nav bar

- `height: 60px; background: #fff; border-top: 1px solid #eef0f5`
- 5 equal columns: Feed (fa-house), Map (fa-map), Report (fa-circle-plus, gradient 44px, elevated), Notifications (fa-bell, red badge), Profile (fa-user)
- Active = `color: #6a5cf3`; inactive = `color: #b3b8c6`
- Report button is styled larger with gradient fill and slight elevation

---

## Files to create / modify

| File | Action | Notes |
|---|---|---|
| `frontend/app/feed/feed.component.css` | Rewrite | Match design tokens, new card structure |
| `frontend/app/feed/feed.component.html` | Rewrite | Composer + cards + right panel for desktop |
| `frontend/app/feed/feed.component.js` | Extend | Keep existing API logic, add card template, composer toggle |
| `frontend/app/layout-usuario/layout-usuario.component.html` | Rewrite | Match Screen 11 header |
| `frontend/app/layout-usuario/layout-usuario.component.css` | Rewrite | Mobile layout tokens |
| `frontend/app/layout-usuario/layout-usuario.component.js` | Keep mostly | Auth state checks same |

The feed component must detect context: when inside `layout-usuario` (citizen view) → render mobile card layout + no composer. When inside admin shell → render desktop 3-column layout + composer.

Or simpler: use two separate component templates (one for desktop feed route, one for mobile feed route). The route guard already splits `/feed` (public) from `/dashboard/incidencias` (admin).

---

## Key data fields (from existing API)

From `IncidentClaim` model:
- `id`, `title`, `description`
- `status`: `pending | in_progress | resolved`
- `priority`: `low | medium | high`
- `category` (with name)
- `geom` (GeoJSON point → lat/lng)
- `created_at`, `updated_at`
- `reporter` (user object → name, initials)
- `canton` / `location_name`

Map preview: render a static div placeholder with the lat/lng coords badge (no live map embed needed in the card — use Leaflet only in the create form and detail view).
