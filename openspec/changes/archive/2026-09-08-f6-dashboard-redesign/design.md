# Design: F6 Dashboard Redesign

## Architecture Decision

### Component Structure
```
DashboardComponent (container, signals, HTTP)
├── KpiCardComponent (4 instances)
├── TopCategoriesChartComponent (Recharts wrapper)
├── RecentActivityComponent (table)
└── WeeklyPerformanceChartComponent (Recharts wrapper)
```

### State Management (Signals)
```typescript
dashboard: {
  loading$: signal<boolean>
  stats$: signal<DashboardStats>
  topCategories$: signal<CategoryStat[]>
  recentActivity$: signal<ActivityItem[]>
  weeklyPerformance$: signal<WeeklyPerformance[]>
  error$: signal<string | null>
}
```

### Service Injection
- `IncidentService` — getStats(), getCategoryStats(), getActivityFeed()
- `StatusHistoryService` — getWeeklyPerformance()
- (Others as needed)

## Component Design

### 1. KpiCardComponent
**Input**: `{ title: string, value: number | string, change: number, label: string, bgColor: string, icon: string }`  
**Template**:
```html
<ui-card [style.background]="bgColor" class="kpi-card">
  <div class="kpi-content">
    <div class="kpi-header">
      <h3>{{ title }}</h3>
      <i [class]="'icon-' + icon"></i>
    </div>
    <div class="kpi-value">{{ value }}</div>
    <div class="kpi-change">{{ change >= 0 ? '+' : '' }}{{ change }}% {{ label }}</div>
  </div>
</ui-card>
```

### 2. TopCategoriesChartComponent
**Input**: `{ data: { name: string, value: number }[] }`  
**Library**: Recharts (Bar chart)  
**Template**:
```html
<recharts-bar-chart [data]="data" width="100%" height="300">
  <recharts-x-axis dataKey="name" />
  <recharts-y-axis />
  <recharts-bar dataKey="value" fill="#06B6D4" />
</recharts-bar-chart>
```

### 3. RecentActivityComponent
**Input**: `{ items: ActivityItem[] }`  
**Template**: Simple table with 5 columns (category, status, dates, time-to-response)

### 4. WeeklyPerformanceChartComponent
**Input**: `{ data: { day: string, received: number, resolved: number }[] }`  
**Template**: Recharts grouped bar chart (received, resolved)

## Decisions

| Decision | Rationale | Alternative Rejected |
|----------|-----------|----------------------|
| **Signals over RxJS subjects** | Cleaner syntax, better trackBy, F0 pattern | BehaviorSubject (verbose) |
| **Recharts for charts** | Lightweight, React-compatible via Angular wrapper | Chart.js (heavier), D3 (overkill) |
| **No real-time** | Scope is initial load, not live updates | WebSocket-based updates (future) |
| **Error boundary** | Show loading states, then error message | Crash on error (bad UX) |
| **Color from spec** | Use exact mocks colors (purple, cyan, green, red) | Random or theme-based (doesn't match) |

## Data Flow

```
DashboardComponent
  ├─ on ngOnInit:
  │   ├─ IncidentService.getStats() → stats$ 
  │   ├─ IncidentService.getCategoryStats() → topCategories$
  │   ├─ IncidentService.getActivityFeed() → recentActivity$
  │   └─ StatusHistoryService.getWeeklyPerformance() → weeklyPerformance$
  │
  └─ Template binds to signals:
      ├─ *ngIf="!loading()" [data]="stats()" → KPI cards
      ├─ [data]="topCategories()" → Chart
      ├─ [items]="recentActivity()" → Activity
      └─ [data]="weeklyPerformance()" → Weekly chart
```

## Endpoints (Consumed)

> **Corrected 2026-09-08 (apply fix batch, W.3 from `fixes-required.md`).**
> The original table below listed 3 endpoints that do not exist in the
> backend (`/incidents/stats/by-category`, `/incidents/activity`,
> `/incidents/stats/weekly`). F6.4.1 (inventory phase, documented in
> `apply-progress.md`) verified the actual backend contract against
> `backend/src/modules/incidents/` — the top-5 categories are embedded
> in the stats payload (`top_categories[]`), not a separate endpoint.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/incidents/stats` | GET | Aggregate: `total`, `by_status`, `by_priority`, `recent_count`, `locations_count`, `average_resolution_time`, `trends`, and `top_categories[]` (top 5 embedded — no separate by-category endpoint) |
| `/api/incidents/weekly-stats` | GET | Weekly breakdown (`days[]` with `recibidas`/`resueltas` per day) |
| `/api/incidents/feed?limit=5` | GET | Recent activity (paginated feed, already consumed by F3; projected to flat `ActivityRow[]` by `DashboardService`) |

**Superseded (do not use)**: `/incidents/stats/by-category?limit=5`, `/incidents/activity?limit=5`, `/incidents/stats/weekly` — these were design-phase assumptions; the backend never implemented them under these names.

## CSS & Styling

- Use existing :root CSS tokens (no new variables per D6)
- Card padding: 1.5rem
- Grid gap: 1rem
- Chart height: 300px (fixed) or responsive within container
- Activity table: rows 1.5rem height, text-sm
- KPI value font-size: 2rem, font-weight: bold

## Testing Strategy (Strict TDD)

### Unit Tests
- `dashboard.component.spec.ts`:
  - Signal updates on service data
  - Error state handling
  - Loading state transitions
  - Component initialization

- `kpi-card.component.spec.ts`:
  - Renders input props correctly
  - Color applies to background
  - % change sign handling (positive/negative)

- `charts.component.spec.ts`:
  - Data transforms correctly
  - Empty data handling
  - No console errors

### E2E Tests (`dashboard.e2e.ts`)
- S1: Dashboard loads, 5 KPI cards visible
- S2: % changes display correctly
- S3: Activity stream populated
- S4: Charts render without errors
- S5: 500 error → graceful error state

## Future Extensions

- Real-time updates (WebSocket)
- Drill-down into incidents (click card → filter to that status)
- Export to PDF/CSV
- Custom time-range filters
- Mobile responsiveness
