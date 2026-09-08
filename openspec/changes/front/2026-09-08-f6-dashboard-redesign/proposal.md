# Proposal: F6 Dashboard Redesign

**Change**: `2026-09-08-f6-dashboard-redesign`  
**Scope**: Frontend only (UI, no backend changes)  
**Date**: 2026-09-08  
**Owner**: Minimax

## What

Redesign the admin dashboard from scratch using F0 primitives (ui-card, ui-badge, Recharts). Replace the old kpi-dashboard component with a new layout featuring 5 KPI cards, top-categories chart, recent-activity stream, and weekly-performance bar chart.

## Why

- Stakeholder requirement (F6 spec, mock 01-01)
- Improve data visibility with visual hierarchy
- Align with F0 component system (ui-card, ui-badge)
- Prepare for data-driven analytics (endpoint data, not hardcoded)

## Scope

### In
- Dashboard layout (5 cols KPI cards + 2-col charts)
- KPI card component (colored, stat + % change)
- Top-5 categories bar chart
- Recent activity stream (table)
- Weekly performance bar chart (received vs resolved)
- E2E test suite (`dashboard.e2e.ts`)

### Out
- Backend changes (assume endpoints exist)
- Real-time updates (no WebSocket)
- Drill-down into incidents (future work)
- Perfil / Usuarios / Roles (separate changes)

## Constraints

**D1**: Existing specs pass unchanged (no regression)  
**D6**: CSS tokens preserved (:root variables)  
**D7**: No *hasPermission (dashboard is universal access)  
**TDD**: Strict TDD mode active — unit + e2e required

## File Changes

| File | Type | Change |
|------|------|--------|
| `frontend/src/app/features/admin/dashboard/dashboard.component.ts` | New | Main dashboard component w/ signals + services |
| `frontend/src/app/features/admin/dashboard/dashboard.component.html` | New | Grid layout for KPIs + charts |
| `frontend/src/app/features/admin/dashboard/components/kpi-card.component.ts` | New | Single KPI card (title, value, % change, color) |
| `frontend/src/app/features/admin/dashboard/components/top-categories-chart.component.ts` | New | Bar chart (Recharts) |
| `frontend/src/app/features/admin/dashboard/components/recent-activity.component.ts` | New | Activity stream table |
| `frontend/src/app/features/admin/dashboard/components/weekly-performance-chart.component.ts` | New | Weekly bar chart |
| `frontend/src/app/features/admin/dashboard/dashboard.component.spec.ts` | New | Unit + integration tests |
| `frontend/e2e/dashboard.e2e.ts` | New | E2E test suite (Playwright) |

## Definition of Done

- [ ] All 4 components render per mock
- [ ] 5 KPI cards with correct colors + % changes
- [ ] Bar charts populate from endpoints (or stubs)
- [ ] Recent activity shows latest 4-5 items
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm run lint` — zero new errors
- [ ] `ng build` — compiles without errors
- [ ] E2E suite green
- [ ] No regression in existing specs

## Dependencies

- Endpoints: `/incidents/stats`, `/stats/by-category`, `/activity`, `/stats/weekly` (backend may need implementation)
- Recharts library (check if installed: `pnpm list recharts`)
- F0 ui-card, ui-badge components

## Non-Goals

- Permission checks (all admins see dashboard)
- Mobile-responsive charts (desktop-first)
- Chart drill-down interactions
