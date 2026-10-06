# Design: Incidents Assignment

## Technical Approach

Frontend-only feature with one new backend endpoint. Implements a two-panel assignment modal (operators left, unassigned incidents right), a three-dot dropdown in the incident list rows, and a seguimiento (tracking) side panel with client-side elapsed timers. Follows the project's established signal-based state management, standalone component architecture, and `HttpService`-wrapped API layer.

## Architecture Decisions

### D1: Component Hierarchy for Assignment Modal

**Choice**: `AssignmentModalComponent` (overlay host) containing two child components: `OperatorPanelComponent` (left) and `IncidentPanelComponent` (right). The modal receives data from `AssignmentService` and orchestrates selection state.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Monolithic modal component | Simpler setup, one file; hard to test panels independently | Rejected |
| Two-child panel decomposition | Clear separation; panels testable alone; follows container-presentational pattern from users-list | **Chosen** |
| Three separate routes with shared state | Overkill for modal context; navigation overhead | Rejected |

**Rationale**: The project uses container-presentational split (see `ActionMenuComponent` as a standalone child with outputs). Two panels with distinct data sources justify two child components. The parent owns selection signals and coordinates the POST.

### D2: Tracking Panel Placement

**Choice**: Right-side drawer overlay anchored to the incident-detail layout, toggled by a "Seguimiento" button. Not a sibling of the list -- it lives in the detail view.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Right sidebar in incident-detail | Natural context (user already views one incident); matches admin panel patterns | **Chosen** |
| Standalone route `/app/incidencias/seguimiento` | Loses incident context; extra routing | Rejected |
| Overlay modal on the list page | Loses detail context; conflicts with assignment modal | Rejected |

**Rationale**: Seguimiento is per-incident (who is working on it, how long). Placing it in detail view next to the action buttons keeps context tight.

### D3: State Management -- Signals over Reactive Forms

**Choice**: Angular signals (`signal`, `computed`) for all modal/panel state. No `FormGroup` -- there are no form fields to validate.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Signals (like category-list, incident-list) | Consistent with project; reactive; OnPush-friendly | **Chosen** |
| Reactive FormGroup | Adds complexity with no validators; FormGroup is for data entry | Rejected |
| BehaviorSubject in service | Extra subscription management; project moved to signals | Rejected |

**Rationale**: The codebase uniformly uses `signal` + `computed` (see `IncidentListComponent`, `CategoryListComponent`, `UsersListComponent`). Assignment modal has selections (clicks), not validated input fields. Signals are the right primitive.

### D4: AssignmentService Structure

**Choice**: New standalone `AssignmentService` in `frontend/src/app/core/services/assignment.service.ts`, injectable at root, wrapping `HttpService`.

**Rationale**: Follows the pattern of `IncidentService` -- root-provided, uses `HttpService` for all calls. Methods:
- `assign(incidentId, operatorId, role?)` -> POST /assignments
- `listByIncident(incidentId)` -> GET /assignments/incident/:incidentId
- `release(assignmentId)` -> DELETE /assignments/:id
- `getOperatorsWithCount()` -> GET /assignments/operators/counts (new)
- `getUnassignedIncidents()` -> GET /incidents?unassigned=true (or client-side filter)

### D5: POST /assignments Payload

**Choice**: Reuse existing `AssignIncidentDto` shape: `{ incident_id: string, operator_id: string, role?: 'primary' | 'secondary' }`.

**Rationale**: Backend already validates this via `class-validator` decorators (`@IsUUID`, `@IsIn`). The frontend sends exactly this shape. No DTO changes needed.

### D6: Operator Count Endpoint

**Choice**: New backend endpoint `GET /assignments/operators/counts` returning `Array<{ operator_id: string, operator_name: string, active_count: number }>`. Protected by `@RequirePermission('READ')`.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New dedicated endpoint with SQL aggregation | One query, no N+1; clean contract | **Chosen** |
| Client-side count from all assignments | N+1 queries or over-fetching; inaccurate under concurrency | Rejected |
| Reuse GET /available-operators per incident | Per-incident scoping does not serve the modal's all-operators need | Rejected |

**Rationale**: The proposal identified this gap. One SQL `COUNT(*) ... GROUP BY operator_id` with a `LEFT JOIN users` is efficient and avoids N+1.

### D7: Error Handling for 409 Conflict

**Choice**: Toast with backend message + full modal data refresh.

```
POST /assignments -> 409 -> toast.error(err.error.message) -> re-fetch operators + incidents
```

**Rationale**: Matches the established pattern in `incident-detail.component.ts` lines 181-188 and 265-275: on any error, show the backend message via toast, then refresh the authoritative data from the server. D4 principle: "the server is the authority".

### D8: Refresh Strategy on Concurrent Changes

**Choice**: Re-fetch both panels (operators with counts + unassigned incidents) when:
1. Modal opens (always fresh)
2. After a successful assignment (optimistic removal from right panel + server confirm)
3. After a 409 error (full refresh, no optimistic update)

**Rationale**: No WebSocket push for assignment changes exists. The modal is short-lived (open, assign, close). Polling adds complexity for little gain.

### D9: IncidentAssignment Interface (Frontend)

**Choice**: Mirror the `AssignmentEntity` backend shape after `SnakeCaseResponseInterceptor`.

### D10: Operator Display Model

**Choice**: `IOperatorWithCount` -- a view model combining user identity with active assignment count, consumed only by the left panel.

### D11: Seguimiento Display Model

**Choice**: `ISeguimientoInfo` -- enriched model joining assignment + incident data with a `client_elapsed_seconds` computed field, consumed by the tracking panel.

### D12: Frontend Permission Checks

**Choice**: Permission string `'ASSIGN assignments'` -- already used in `workflow.util.ts` line 51. The toolbar "Asignar" button and three-dot "Asignar" option use `*hasPermission="'ASSIGN assignments'"` structural directive (same as categories/users use `HasPermissionDirective`).

**Rationale**: The backend `AssignmentsController` uses `@RequirePermission('ASSIGN')` which resolves to `ASSIGN assignments` via `PermissionGuard`. Frontend mirrors this for UI gating. Backend remains the authority (403 if mismatch).

### D13: Backend Org Scope Validation

**Choice**: No frontend validation of org scope. The backend `AssignmentsService.assign()` can be extended to check org match. Frontend trusts the operator list returned by the new endpoint (pre-filtered by scope).

**Rationale**: The proposal established: operator list endpoint respects caller's scope. A master sees all operators; an admin_org sees only their org's operators. Frontend does not re-validate -- the backend is authoritative.

### D14: Dropdown Menu Positioning

**Choice**: Native CSS `position: absolute` on the menu `<ul>`, matching the existing `ActionMenuComponent` pattern (users-list). No CDK overlay.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Native CSS absolute positioning | Simple; matches existing ActionMenuComponent; no extra dependency | **Chosen** |
| CDK Overlay | Powerful but adds @angular/cdk dependency; overkill for a simple dropdown | Rejected |

**Rationale**: `ActionMenuComponent` (line 112-148) uses `position: absolute; top: calc(100% + 0.25rem); right: 0; z-index: 20` with `HostListener('document:click')` for outside-click dismissal. The incident row dropdown reuses this exact pattern.

### D15: Modal Sizing and Responsiveness

**Choice**: Fixed modal at `max-width: 900px; width: 90vw`. Two-panel layout uses CSS grid `grid-template-columns: 1fr 1fr` with `@media (max-width: 768px)` stacking to single column.

**Rationale**: Mobile responsive modal is OUT of scope per proposal, but basic column stacking prevents layout breakage. The 900px width accommodates both panels comfortably on desktop.

### D16: Timer Display Format

**Choice**: `HH:MM:SS` format using `setInterval(1000)` -- displays `00:45:23` style.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| HH:MM:SS | Human-readable for multi-hour assignments; familiar clock format | **Chosen** |
| MM:SS | Loses hour granularity for long assignments | Rejected |
| Raw seconds | Not human-readable | Rejected |
| Server-side elapsed | Requires polling; adds latency; timer jumps | Rejected |

**Rationale**: Client-side `setInterval` computes `Date.now() - created_at` every second. No polling. Timer starts from `assignment.created_at`. `ngOnDestroy` clears the interval (spec requirement for memory leak prevention).

### D17: Seguimiento Panel Placement

**Choice**: Right sidebar drawer within the incident-detail layout, toggled via button.

**Rationale**: See D2. Implemented as a `SeguimientoDrawerComponent` that slides in from the right with a fixed width (~320px), overlaying the detail content. Close button and click-outside to dismiss.

### D18: Unit Test Coverage

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `AssignmentService` methods (assign, list, release, counts) | `HttpClientTestingModule`, verify URL/body/method |
| Unit | `IncidentActionMenuComponent` dropdown toggle, outside-click, output emissions | `TestBed` + click events |
| Unit | `OperatorPanelComponent` selection signal, search filter | Signal state assertions |
| Unit | `IncidentPanelComponent` rendering, selection output | Signal state assertions |
| Unit | `AssignmentModalComponent` orchestration (selection -> assign call) | Mock service, verify call arguments |
| Unit | Timer util `formatElapsed(seconds)` | Pure function test |
| Unit | `workflow.util.ts` -- existing tests already cover `availableActions` with `assign` | Verify no regression |

### D19: E2E Test Scenarios

| Scenario | What | Approach |
|----------|------|----------|
| Happy path | Open modal -> select operator -> select incident -> assign -> success toast | Playwright with mocked API |
| 409 Conflict | Assign already-assigned incident -> error toast -> panel refreshes | Mock 409 response |
| Permission edge | User without ASSIGN -> no Asignar button in dropdown, no toolbar button | Login as restricted role |
| Empty state | No operators or no unassigned incidents -> empty state message | Mock empty responses |

## Data Flow

```
IncidentListComponent
  |
  +-- IncidentActionMenuComponent (per row, three-dot)
  |     |
  |     +-- (click "Asignar") --> opens AssignmentModalComponent
  |
  +-- Toolbar "Asignar" button (*hasPermission) --> opens AssignmentModalComponent


AssignmentModalComponent
  |
  +-- OperatorPanelComponent -----> AssignmentService.getOperatorsWithCount()
  |     selectedOperator signal <-----+
  |                                    |
  +-- IncidentPanelComponent -----> IncidentService.getIncidents({status: pending})
  |     selectedIncidents signal <----+
  |                                    |
  +-- "Asignar" button ------> AssignmentService.assign(incident_id, operator_id)
        on success: toast + re-fetch + close modal
        on 409:     toast + re-fetch


IncidentDetailComponent
  |
  +-- SeguimientoDrawerComponent
        |
        +-- AssignmentService.listByIncident(incidentId)
        +-- setInterval(1000) -> computed elapsed from created_at
        +-- ngOnDestroy -> clearInterval
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/core/services/assignment.service.ts` | Create | HTTP wrapper for /assignments endpoints |
| `src/app/core/models/assignment.model.ts` | Create | Frontend interfaces: IAssignment, IOperatorWithCount, IAssignmentPayload, ISeguimientoInfo |
| `src/app/features/incidents/components/assignment-modal/assignment-modal.component.ts` | Create | Two-panel modal host |
| `src/app/features/incidents/components/assignment-modal/operator-panel.component.ts` | Create | Left panel: operators with counts |
| `src/app/features/incidents/components/assignment-modal/incident-panel.component.ts` | Create | Right panel: unassigned incidents |
| `src/app/features/incidents/components/incident-action-menu/incident-action-menu.component.ts` | Create | Three-dot dropdown for incident rows (modeled on `ActionMenuComponent`) |
| `src/app/features/incidents/components/seguimiento-drawer/seguimiento-drawer.component.ts` | Create | Right-side tracking panel with timers |
| `src/app/features/incidents/utils/timer.util.ts` | Create | `formatElapsed(seconds): string` pure function |
| `src/app/features/incidents/incident-list/incident-list.component.ts` | Modify | Import IncidentActionMenuComponent; replace ViewActionBtnComponent in template |
| `src/app/features/incidents/incident-list/incident-list.component.html` | Modify | Replace eye-only actions column with three-dot dropdown |
| `src/app/features/incidents/incident-detail/incident-detail.component.ts` | Modify | Replace `assign` toast placeholder with modal open logic; add seguimiento drawer |
| `src/app/features/incidents/incident-detail/incident-detail.component.html` | Modify | Add seguimiento toggle button and drawer outlet |
| `backend/src/modules/assignments/assignments.controller.ts` | Modify | Add GET /assignments/operators/counts endpoint |
| `backend/src/modules/assignments/assignments.service.ts` | Modify | Add `countByOperator(scope)` method |

## Interfaces / Contracts

```typescript
// frontend/src/app/core/models/assignment.model.ts

export interface IAssignment {
  id: string;
  incident_id: string;
  operator_id: string;
  role: 'primary' | 'secondary' | 'supervisor' | 'observer';
  created_at: string;       // ISO date from wire
  updated_at: string;
  deleted_at: string | null;
}

export interface IOperatorWithCount {
  operator_id: string;
  operator_name: string;    // "nombres apellidos" from users join
  active_count: number;     // COUNT of non-deleted assignments
}

export interface IUnassignedIncident {
  id: string;
  title: string;
  status: 'pending' | 'in_progress';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export interface IAssignmentPayload {
  incident_id: string;
  operator_id: string;
  role?: 'primary' | 'secondary';
}

export interface IAssignmentResponse {
  id: string;
  incident_id: string;
  operator_id: string;
  role: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
}

export interface ISeguimientoInfo {
  assignment_id: string;
  incident_id: string;
  incident_title: string;
  incident_status: string;
  incident_priority: string;
  operator_id: string;
  operator_name: string;
  assigned_at: string;         // assignment.created_at
  elapsed_seconds: number;     // client-computed: now - assigned_at
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | AssignmentService (5 methods) | HttpClientTestingModule, assert URL + body + method |
| Unit | IncidentActionMenuComponent | TestBed, verify dropdown toggle, output events, outside-click |
| Unit | AssignmentModalComponent | Mock service, verify assign() called with correct IDs |
| Unit | OperatorPanelComponent | Signal assertions for selection, search filter |
| Unit | SeguimientoDrawerComponent | Verify timer starts/stops, formatElapsed correctness |
| Unit | timer.util.ts formatElapsed | Pure function: edge cases (0, 59, 3600, 86400) |
| E2E | Happy path assignment flow | Playwright, mock API, full modal workflow |
| E2E | 409 conflict recovery | Playwright, mock 409, verify toast + refresh |
| E2E | Permission gating | Login as operator without ASSIGN, verify no buttons |

## Threat Matrix

N/A -- no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

**SQL Changes**: No schema migration needed. The `assignments` table already has `created_at`, `operator_id`, `incident_id` with appropriate constraints (migration 0007, 0026). The `deleted_at` soft-delete column exists (migration 0026).

**Suggested index**: Verify `assignments.operator_id` has an index. If not, add one for the new `COUNT ... GROUP BY operator_id` query:

```sql
CREATE INDEX IF NOT EXISTS idx_assignments_operator_id
  ON assignments (operator_id)
  WHERE deleted_at IS NULL;
```

This is a partial index on active assignments, optimizing both the count query and the conflict check.

**Feature rollout**: No feature flag needed. The UI is gated by `ASSIGN assignments` permission. Users without this permission see no change in behavior.

## Open Questions

- [x] Confirm `ASSIGN assignments` permission string matches backend -- confirmed in `workflow.util.ts:51`
- [x] Confirm no schema changes needed -- confirmed: `assignments` table has all required columns
- [ ] Backend team to confirm: should GET /assignments/operators/counts be scoped by caller's org? (Design assumes yes, matching `list()` scope pattern)
