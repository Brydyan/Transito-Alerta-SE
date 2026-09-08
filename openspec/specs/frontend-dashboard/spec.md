# Specification: F6 Dashboard Redesign

## Layout & Visual Hierarchy

### Header Section
- Title: "Dashboard" (h1)
- Right side: "Filtros" button + "Exportar" button (purple background)

### Content Grid (3 sections)

#### Section 1: KPI Cards (5-column row)
5 colored cards, each with:
- Background color (distinct per card)
- Title + emoji icon (right side)
- Large number (stat)
- Subtext: % change + "VS. MES ANTERIOR" or "ESTA SEMANA" or "TASA DE RESOLUCIÓN"

**Cards**:
1. **Total Incidencias** (Purple #6D28D9)
   - Value: 22
   - Subtext: "+8% VS. MES ANTERIOR"

2. **En proceso** (Cyan #06B6D4)
   - Value: 7
   - Subtext: "+3% ESTA SEMANA"

3. **Resueltas** (Green #10B981)
   - Value: 6
   - Subtext: "+67% TASA DE RESOLUCIÓN"

4. **Pendientes** (Red #EF4444)
   - Value: 9
   - Subtext: "-5% VS. MES ANTERIOR"

5. **Tiempo promedio** (Purple #8B5CF6)
   - Value: ~13h
   - Subtext: "SOBRE INCIDENCIAS RESUELTAS"

#### Section 2: Two-column layout

**Left (60%)**: "Top 5 Categorías"
- Heading with bar-chart icon
- Horizontal bar chart (Recharts)
- 3+ incident categories on Y-axis
- Two series: dark blue (Series 1), light blue (Series 2)
- X-axis: count scale

**Right (40%)**: "Actividad reciente"
- Heading: "Últimas actualizaciones del sistema"
- Table (no header row):
  - Row 1: "Baches y Hundimientos" | "Pendiente" + "ALTA" badge | "[FECHA CREACIÓN]" | "[HORA CREACIÓN]" | "[ITIEMPO DE RESPUESTA]"
  - Row 2: "Agua Potable" | "En proceso" + "ALTA" badge | same timestamps
  - etc.
- Max 4-5 rows visible
- Footer: "Ver historial completo" link (purple)

#### Section 3: Bottom charts (2-column)

**Left (60%)**: "Rendimiento semanal"
- Subtext: "Incidencias recibidas vs resueltas por día"
- Y-axis: count (0, 2, 4, 6, 8)
- X-axis: days (Lun, Mar, Mié, Jue, Vie, Sáb, Dom)
- Two bar series: Recibidas (Purple), Resueltas (Green)

**Right (40%)**: Empty or future widget

## Scenarios

### S1: Dashboard loads successfully
**Given** user is logged in as admin  
**When** user navigates to /app/dashboard  
**Then**:
- Page title is "Dashboard"
- 5 KPI cards render with correct colors
- All stat values are visible
- Both charts render (no errors)

### S2: KPI % changes display
**Given** dashboard is loaded  
**When** stats endpoint returns { totalIncidents: 22, changePercent: 8 }  
**Then**:
- KPI card shows "+8% VS. MES ANTERIOR"
- If changePercent is negative, show "-X%"

### S3: Recent activity shows latest items
**Given** /activity endpoint returns 4 items  
**When** dashboard renders  
**Then**:
- Activity stream shows all 4 rows
- Each row has category, status badge, and timestamps

### S4: Charts render from data
**Given** /stats/by-category and /stats/weekly endpoints return data  
**When** dashboard loads  
**Then**:
- Top 5 chart shows correct categories + counts
- Weekly chart shows 7 bars (one per day)
- No axis labels missing

### S5: Error state — stats endpoint fails
**Given** /incidents/stats returns 500  
**When** dashboard loads  
**Then**:
- KPI cards show loading skeleton or "N/A"
- Charts show empty state + "No data available"
- No app crash

## Responsive Behavior

- **Desktop (1200px+)**: Full 5-col KPI row, 60/40 split charts
- **Tablet (768px-1199px)**: Fallback to 2-col KPI cards, stack charts
- **Mobile**: Out of scope (F6 is desktop-only per design D2)

## CSS Token Usage

- Colors: Use :root variables from existing `main.css`
  - `--color-primary` (purple), `--color-success` (green), `--color-warning` (orange), `--color-danger` (red)
- Typography: Reuse `heading-lg`, `text-base`, `text-sm`
- Spacing: Grid gap 1rem, card padding 1.5rem
- Do NOT add new CSS tokens (D6)
