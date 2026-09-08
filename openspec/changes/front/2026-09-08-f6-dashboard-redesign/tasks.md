# Tasks: F6 Dashboard Redesign

## Phase 1: Component Scaffolding

- [ ] **D.1.1** Create `frontend/src/app/features/admin/dashboard/` folder structure
- [ ] **D.1.2** Generate DashboardComponent (ng generate component)
- [ ] **D.1.3** Create sub-components folder: `components/`
- [ ] **D.1.4** Generate KpiCardComponent
- [ ] **D.1.5** Generate TopCategoriesChartComponent
- [ ] **D.1.6** Generate RecentActivityComponent
- [ ] **D.1.7** Generate WeeklyPerformanceChartComponent
- [ ] **D.1.8** Verify all components compile (`ng build`)

## Phase 2: Service & Data Model

- [ ] **D.2.1** Create `models/dashboard.model.ts` with types:
  - `DashboardStats { totalIncidents, inProgress, resolved, pending, avgResolutionTime, changes % }`
  - `CategoryStat { name, value }`
  - `ActivityItem { category, status, createdAt, responseTime }`
  - `WeeklyPerformance { day, received, resolved }`
- [ ] **D.2.2** Update `IncidentService` to add methods:
  - `getStats()`: GET `/incidents/stats`
  - `getCategoryStats()`: GET `/incidents/stats/by-category?limit=5`
  - `getActivityFeed()`: GET `/incidents/activity?limit=5`
- [ ] **D.2.3** Update `StatusHistoryService` to add:
  - `getWeeklyPerformance()`: GET `/incidents/stats/weekly`
- [ ] **D.2.4** Create unit tests for service methods (mock HTTP)

## Phase 3: KPI Card Component

- [ ] **D.3.1** Implement `kpi-card.component.ts`:
  - Input properties: title, value, change, label, bgColor, icon
  - Template with correct styling
  - No dependencies on parent
- [ ] **D.3.2** Style KPI card (CSS):
  - Background from input prop
  - Large value font (2rem, bold)
  - Subtext font (text-sm, gray)
  - Padding 1.5rem
- [ ] **D.3.3** Unit test `kpi-card.component.spec.ts`:
  - Input rendering
  - Color application
  - Positive/negative % sign

## Phase 4: Chart Components

- [ ] **D.4.1** Implement `top-categories-chart.component.ts`:
  - Input: data array { name, value }
  - Recharts BarChart rendering
  - X-axis: category names
  - Y-axis: counts (auto-scale)
  - Height: 300px
- [ ] **D.4.2** Implement `weekly-performance-chart.component.ts`:
  - Input: data array { day, received, resolved }
  - Grouped bar chart (two series)
  - Colors: Purple (received), Green (resolved)
  - X-axis: Days (Mon-Sun)
  - Y-axis: counts (0-8)
- [ ] **D.4.3** Test chart rendering with mock data
- [ ] **D.4.4** Unit tests for chart components

## Phase 5: Recent Activity Component

- [ ] **D.5.1** Implement `recent-activity.component.ts`:
  - Input: items array
  - Simple table (no header)
  - Columns: icon, category, status (badge), dates, response-time
  - Max 4-5 rows
- [ ] **D.5.2** Style activity table:
  - Row height 1.5rem
  - Text-sm
  - Status badge (ui-badge component)
  - Footer link "Ver historial completo" (purple)
- [ ] **D.5.3** Unit tests for activity component

## Phase 6: Dashboard Container Component

- [ ] **D.6.1** Implement `dashboard.component.ts`:
  - Inject: IncidentService, StatusHistoryService
  - Create signals for: stats, categories, activity, weekly, loading, error
  - ngOnInit: call all 4 services in parallel (forkJoin)
- [ ] **D.6.2** Implement `dashboard.component.html`:
  - Grid layout: 5-col KPI row
  - 2-col: charts (60/40 split)
  - Bind all signals to child components
  - Loading skeleton (optional)
  - Error state UI
- [ ] **D.6.3** Style dashboard:
  - Use CSS Grid for layout
  - Gap 1rem
  - Responsive fallback (2-col KPI on tablet)
- [ ] **D.6.4** Unit test dashboard component:
  - Signals update on service data
  - Error handling (service returns 500)
  - Loading state transitions
  - All child components rendered

## Phase 7: E2E Tests

- [ ] **D.7.1** Create `frontend/e2e/dashboard.e2e.ts`
- [ ] **D.7.2** Test S1 (dashboard loads, 5 KPI cards visible)
  - Navigate to `/app/dashboard`
  - Verify page title "Dashboard"
  - Verify 5 cards are visible (Total, En proceso, Resueltas, Pendientes, Tiempo promedio)
- [ ] **D.7.3** Test S2 (KPI % changes)
  - Mock stats endpoint: { totalIncidents: 22, changePercent: 8 }
  - Verify card shows "+8% VS. MES ANTERIOR"
- [ ] **D.7.4** Test S3 (recent activity)
  - Mock activity endpoint: 4 items
  - Verify all 4 rows render
- [ ] **D.7.5** Test S4 (charts render)
  - Mock chart endpoints
  - Verify bars/axis visible
- [ ] **D.7.6** Test S5 (error handling)
  - Mock stats endpoint: 500 error
  - Verify error message or empty state

## Phase 8: Linting & Compliance

- [ ] **D.8.1** Run `pnpm run lint` — fix all new errors
- [ ] **D.8.2** Run `ng build` — verify compilation
- [ ] **D.8.3** Run `pnpm test` — all tests pass
- [ ] **D.8.4** Check for regression:
  - Run existing dashboard tests (if any)
  - Verify no specs broken (D1)
- [ ] **D.8.5** Verify CSS tokens (D6):
  - No new :root variables added
  - Colors use existing tokens

## Estimated Story Points
- Scaffolding & models: 3 pts
- KPI cards: 2 pts
- Charts (Recharts): 3 pts
- Activity component: 2 pts
- Dashboard container: 3 pts
- E2E & testing: 5 pts
- Linting & polish: 2 pts
- **Total**: ~20 pts

## Dependency Chain
```
D.1 (scaffolding) → D.2 (services) → D.3-5 (components) → D.6 (container) → D.7 (e2e) → D.8 (lint)
```

All components can be developed in parallel after services are mocked (D.2).

## Notes for Minimax
- Recharts must be installed: `pnpm add recharts`
- All inputs/outputs strongly typed (no `any`)
- Service HTTP calls must be stubbed in unit tests (use `httpTestingController`)
- E2E tests use Playwright (intercept HTTP, set mock responses)
- No external data — mock everything in tests (D1: no regression)
