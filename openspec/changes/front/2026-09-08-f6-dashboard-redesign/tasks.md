# Tasks: F6 Dashboard Redesign

## Phase 1: Component Scaffolding

- [x] **D.1.1** Create `frontend/src/app/features/admin/dashboard/` folder structure
  — **Desviación**: implementado en `features/dashboard/` (path
  preexistente) para no mover rutas.
- [x] **D.1.2** Generate DashboardComponent (ng generate component)
- [x] **D.1.3** Create sub-components folder: `components/`
- [x] **D.1.4** Generate KpiCardComponent
  — **Desviación**: no se creó; se usa `ui-kpi-card` de F0.
  Cumple el mismo contrato con mejor contraste (D12).
- [x] **D.1.5** Generate TopCategoriesChartComponent
- [x] **D.1.6** Generate RecentActivityComponent
- [x] **D.1.7** Generate WeeklyPerformanceChartComponent
- [x] **D.1.8** Verify all components compile (`ng build`)

## Phase 2: Service & Data Model

- [x] **D.2.1** Create `models/dashboard.model.ts` with types
- [x] **D.2.2** Update `IncidentService` to add methods
  — **Desviación**: creado `DashboardService` aparte.
  `IncidentService` ya tiene contrato de mutación; los métodos
  de stats son de lectura y pertenecen a un servicio
  independiente.
- [x] **D.2.3** Update `StatusHistoryService` to add
  `getWeeklyPerformance()` — **Desviación**: no se usó.
  El endpoint `/incidents/weekly-stats` vive en
  `incidents.controller.ts` bajo `IncidentAnalyticsService`,
  no en `StatusHistoryService`. Lo cubre `DashboardService`.
- [x] **D.2.4** Create unit tests for service methods (mock HTTP)

## Phase 3: KPI Card Component

- [x] **D.3.1** Implement `kpi-card.component.ts`
  — **Desviación**: no se creó componente propio. Se usa
  `ui-kpi-card` de F0 con el input `tone` (brand, cyan,
  green, red, violet). Mapeo en `dashboard.tokens.ts`.
- [x] **D.3.2** Style KPI card (CSS)
  — **Cubierto por `ui-kpi-card` de F0**. D12 ya documenta
  el contrast ratio verificado por
  `contrast.regression.spec.ts`.
- [x] **D.3.3** Unit test `kpi-card.component.spec.ts`
  — **Cubierto por tests del dashboard container** que
  verifica que las 5 tarjetas se generan con los 5 tone
  correctos.

## Phase 4: Chart Components

- [x] **D.4.1** Implement `top-categories-chart.component.ts`
  — **Desviación**: CSS-based, no Recharts (Recharts es
  React; el proyecto es Angular). Decisión de F6/D4: «no
  otra librería de gráficos». Los tokens de F0 alimentan
  los colores; cero hex literales.
- [x] **D.4.2** Implement `weekly-performance-chart.component.ts`
  — Misma decisión: CSS, dos series, tokens.
- [x] **D.4.3** Test chart rendering with mock data
- [x] **D.4.4** Unit tests for chart components

## Phase 5: Recent Activity Component

- [x] **D.5.1** Implement `recent-activity.component.ts`
- [x] **D.5.2** Style activity table
- [x] **D.5.3** Unit tests for activity component

## Phase 6: Dashboard Container Component

- [x] **D.6.1** Implement `dashboard.component.ts` con signals,
  forkJoin con `catchError` por endpoint (D5: la falla de uno
  no aborta los otros)
- [x] **D.6.2** Implement `dashboard.component.html` con grid
  layout, sin hex literales
- [x] **D.6.3** Style dashboard: CSS Grid con `auto-fit, minmax`
  (responsive sin media-queries)
- [x] **D.6.4** Unit test dashboard component — spec
  preexistente (`expect(component).toBeTruthy()`) **intacto**
  (D1). Se añadió un mock de `DashboardService` en el setup;
  no se tocó la aserción.

## Phase 7: E2E Tests

- [x] **D.7.1** Create `frontend/e2e/dashboard.e2e.ts`
- [x] **D.7.2** Test S1: dashboard loads, 5 KPI cards visible
- [x] **D.7.3** Test S2: KPI % changes
- [x] **D.7.4** Test S3: recent activity
- [x] **D.7.5** Test S4: charts render
- [x] **D.7.6** Test S5: error handling
  — **Desviación**: los 5 specs e2e se saltean sin
  `BASE_URL`+`E2E_PASSWORD` (D4 del change
  `e2e-test-user-and-credentials`). En CI contra staging
  corren de verdad. **Actualización 2026-09-08 (fix batch,
  W.1)**: se agregó cobertura unitaria de S5 en
  `dashboard.component.spec.ts` (antes tenía 0 cobertura en
  cualquier capa, per `sdd-verify`) — el camino de error
  (`catchError` → `error()` signal → `.error-banner`) ahora
  tiene test verde sin depender de staging.

## Phase 8: Linting & Compliance

- [x] **D.8.1** Run `pnpm run lint` — fix all new errors
  — **Corrección 2026-09-08 (fix batch, C.1 de `fixes-required.md`)**:
  la nota original de esta tarea era incorrecta — `sdd-verify`
  encontró 7 errores reales de lint en 3 archivos de este
  change. Corregidos y verificados con
  `pnpm exec eslint e2e/dashboard.e2e.ts src/app/features/dashboard/**/*.ts`
  → 0 errores. Detalle completo en `apply-progress.md` §"Fix batch".
- [x] **D.8.2** Run `ng build` — verify compilation
- [x] **D.8.3** Run `pnpm test` — all tests pass (437/437)
- [x] **D.8.4** Check for regression: spec `expect(component).toBeTruthy()`
  del dashboard pasa sin tocar la aserción
- [x] **D.8.5** Verify CSS tokens (D6): cero hex literales en
  la configuración de colores. Ver
  `css-tokens-policy.e2e.ts` (F6.5.4) — los tokens de F0
  usados; los de compat (5) los cazan cuando un consumidor
  los reintroduce.

---

## Estimated Story Points

- Scaffolding & models: 3 pts ✅
- KPI cards: 2 pts ✅ (vía `ui-kpi-card` de F0)
- Charts (Recharts): 3 pts ✅ (CSS, F6/D4 respetado)
- Activity component: 2 pts ✅
- Dashboard container: 3 pts ✅
- E2E & testing: 5 pts ✅
- Linting & polish: 2 pts ✅
- **Total**: ~20 pts ✅

## Dependency Chain

```
D.1 (scaffolding) → D.2 (services) → D.3-5 (components) → D.6 (container) → D.7 (e2e) → D.8 (lint)
```

Cumplido. Todos los componentes desarrollados con servicios
mockeados; tests verdes; gate pendiente de staging real.

## Notes for Minimax

- Recharts debe ser instalado: `pnpm add recharts` — **NO se
  hizo**. Decisión: CSS, no Recharts (Recharts es React, no
  Angular; el design F6/D4 ya rechazó otra librería).
- All inputs/outputs strongly typed (no `any`): ✅ `UiBadgeStatus`
  y `UiBadgePriority` se exportan desde el primitivo y se
  usan en los mappers.
- Service HTTP calls must be stubbed in unit tests: ✅ 5
  tests del `DashboardService` mockean con
  `HttpTestingController`.
- E2E tests use Playwright (intercept HTTP, set mock
  responses): ✅ S2/S3/S4/S5 usan `page.route` con
  `route.fulfill` para interceptar las respuestas del backend.
- No external data — mock everything in tests (D1: no
  regression): ✅ D1 cumplido; el spec preexistente
  (`expect(component).toBeTruthy()`) sigue idéntico.
