# Proposal: Incidents Assignment Feature

## Intent

Operators with supervisory roles (master, operador_sistema, admin_org) cannot assign incidents to operador_org users from the incidents list. The current UX forces navigating to each incident's detail page where the assign action is a placeholder toast ("requiere integracion con modulo assignments"). The backend assignment infrastructure exists (POST /assignments, GET /incidents/:id/available-operators) but the frontend has no UI to consume it. Additionally, supervisors lack visibility into assignment timelines and elapsed resolution time once an incident is assigned.

This change closes the gap between backend capability and frontend UX for incident assignment and tracking.

## Scope

### In Scope
- Three-dot dropdown menu replacing single "Ver" button in incident list rows
- "Asignar" bulk action button in list toolbar (role-gated)
- Assignment modal: two-panel operator/incident selector
- Seguimiento (tracking) side panel with timers
- Frontend assignment service consuming existing backend endpoints
- New backend endpoint: GET /assignments/operator/:operatorId/count (active assignment count per operator)

### Out of Scope
- Bulk re-assignment (changing operator on already-assigned incidents)
- Assignment history/audit log UI (backend already soft-deletes)
- Push notifications on assignment
- Mobile-responsive layout for the modal (deferred to responsive pass)
- "Eliminar" row action implementation (listed in dropdown but handler deferred)

## Capabilities

### New Capabilities
- `incident-assignment-ui`: Two-panel assignment modal, bulk action toolbar button, and frontend service wiring to POST /assignments
- `incident-tracking-panel`: Seguimiento side panel with incident summary, operator name, and live elapsed timers

### Modified Capabilities
- `frontend-incidents`: List actions column changes from single button to three-dot dropdown; toolbar gains role-gated bulk action

## Approach

**Assignment modal -- two-panel layout over tabs/wizard.** A side-by-side layout (operator list left, unassigned incidents right) lets supervisors see operator workload and available incidents simultaneously. Tabs would hide one context while acting on the other. A wizard adds unnecessary steps for what is conceptually a single drag-and-drop-like action. The modal opens from either the toolbar bulk button or the per-row "Asignar" dropdown action; when opened per-row, the right panel pre-selects that incident.

**Three-dot dropdown over inline buttons.** The current single "Ver" button does not scale to three actions. Inline buttons would crowd the row. A dropdown keeps the table clean and is consistent with the user-detail-modal pattern already in the admin users list.

**Live timers using `setInterval` + `DatePipe`.** The two elapsed timers (since creation, since assignment) tick every second client-side. No backend polling -- the timestamps are already in the incident and assignment records. `OnDestroy` cleanup prevents leaks.

**No new migration needed.** `assignments.created_at` already records when the assignment was made. The incident's `created_at` provides the creation timestamp. No schema changes required.

**Backend: one new lightweight endpoint.** GET /assignments/operator/:operatorId/count returns the count of active (non-soft-deleted) assignments for an operator. The existing `availableOperators` endpoint filters by org and claim capacity but does not serve the modal's need to show all operators with their assignment counts. Alternative: compute counts client-side from multiple list calls -- rejected for N+1 concerns at scale.

**RBAC: reuse existing ASSIGN permission.** The `@RequirePermission('ASSIGN')` decorator on AssignmentsController already gates assignment creation. The frontend guards the "Asignar" button visibility behind `permissions.includes('ASSIGN assignments')`. No new permissions needed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/app/features/incidents/incident-list/` | Modified | Add dropdown menu, bulk action button |
| `frontend/src/app/features/incidents/components/assignment-modal/` | New | Two-panel assignment modal component |
| `frontend/src/app/features/incidents/components/tracking-panel/` | New | Seguimiento side panel with timers |
| `frontend/src/app/features/incidents/components/actions-dropdown/` | New | Reusable three-dot dropdown for row actions |
| `frontend/src/app/core/services/assignment.service.ts` | New | Frontend service wrapping /assignments endpoints |
| `backend/src/modules/assignments/assignments.controller.ts` | Modified | Add GET /assignments/operator/:operatorId/count |
| `backend/src/modules/assignments/assignments.service.ts` | Modified | Add countByOperator method |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bulk assignment race condition (two supervisors assign same incident) | Medium | Backend already returns 409 ConflictException; modal should handle and refresh |
| Operator list grows large in big organizations | Low | Paginate operator list or add search filter in left panel |
| Timer precision drift over long sessions | Low | Client-side seconds are sufficient; no business logic depends on precision |
| Permission edge case: user sees button but backend rejects | Low | Frontend checks permissions before rendering; 403 handled with toast |
| Modal state desync after background assignment by another user | Medium | Refresh unassigned list on modal open; show toast on 409 and re-fetch |

## Rollback Plan

- Frontend: revert to single "Ver" button in incident list (remove dropdown, modal, panel components)
- Backend: the new count endpoint is additive and read-only; remove the route and method. No migration to roll back.
- No database schema changes to revert.

## Dependencies

- Existing POST /assignments endpoint (backend, already deployed)
- Existing GET /incidents/:id/available-operators endpoint (backend, already deployed)
- Angular CDK overlay or custom dropdown positioning (evaluate during design)

## Success Criteria

- [ ] Supervisors (master, operador_sistema, admin_org) can assign unassigned incidents to operador_org users from the list view
- [ ] Assignment modal shows operator workload (active assignment count) alongside unassigned incidents
- [ ] Per-row three-dot dropdown shows Asignar, Seguimiento, Eliminar options
- [ ] Seguimiento panel displays incident summary with two live elapsed timers
- [ ] 409 conflicts from concurrent assignment are handled gracefully with toast + refresh
- [ ] ASSIGN permission is enforced: unauthorized roles do not see assignment UI
- [ ] All new components have unit tests; assignment flow has integration coverage
