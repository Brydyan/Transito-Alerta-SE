# Design: Incidents Assignment Feature

**Change**: `incidents-assignment`  
**Date**: 2026-09-23  
**Status**: READY FOR IMPLEMENTATION  

---

## Architecture Overview

### Component Hierarchy

```
incident-list/
  ├── incident-list.component (main container, manages selection state)
  │   ├── list-toolbar (bulk action button "Asignar", role-gated)
  │   ├── actions-dropdown (three-dot row menu)
  │   │   ├── "Ver" → incident-detail
  │   │   ├── "Asignar" → assignment-modal (row-preselected)
  │   │   ├── "Seguimiento" → tracking-panel
  │   │   └── "Eliminar" (placeholder, deferred)
  │   └── incidents-table
  │
  assignment-modal/ (new)
  │   ├── operator-list-panel
  │   │   ├── operator-search
  │   │   └── operator-workload-display (assignment counts)
  │   └── incident-selector-panel
  │       ├── incident-filter
  │       └── incident-list
  │
  tracking-panel/ (new)
  │   ├── incident-summary-card
  │   ├── operator-display
  │   └── elapsed-timers (creation → now, assignment → now)
```

### State Management (Signals)

**incident-list.component**:
- `selectedIncidents = signal<string[]>([])` — selected for bulk action
- `dropdownOpenId = signal<string | null>(null)` — which row dropdown is visible
- `trackingPanelOpen = signal<boolean>(false)` — side panel visibility
- `trackingIncidentId = signal<string | null>(null)` — which incident to track

**assignment-modal.component**:
- `selectedOperatorId = signal<string | null>(null)` — chosen operator
- `selectedIncidentId = signal<string | null>(null)` — chosen incident (row pre-selected if modal opened from row)
- `operatorList = signal<OperatorWorkload[]>([])` — fetched from backend
- `unassignedIncidents = signal<Incident[]>([])` — filtered to unassigned only
- `isAssigning = signal<boolean>(false)` — prevent double-submit

**tracking-panel.component**:
- `incidentData = signal<IncidentWithAssignment | null>(null)` — loaded from API
- `elapsedSinceCreation = signal<string>('')` — e.g., "2 hours 15 min"
- `elapsedSinceAssignment = signal<string>('')` — e.g., "45 minutes"

### Data Flow

**On assignment submission**:
1. Modal collects `operatorId` + `incidentId`
2. Calls `assignmentService.assign(operatorId, incidentId)`
3. Backend POST /assignments → 201 (success) or 409 (conflict)
4. On success: refresh unassigned list, close modal, toast
5. On 409: show conflict toast, re-fetch unassigned incidents

**On tracking panel open**:
1. Click "Seguimiento" in dropdown
2. `tracking-panel` loads via `GET /incidents/:id` + `GET /incidents/:id/assignments/latest`
3. Display incident summary + operator name
4. Start `setInterval` to update elapsed times every 1 second
5. On panel close: `clearInterval` to prevent memory leak

---

## API Contracts

### Existing Endpoints Used

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/incidents` | List unassigned incidents (filter: `assigned=false`) |
| POST | `/assignments` | Create assignment (body: `{operatorId, incidentId}`) |
| GET | `/assignments/:id/available-operators` | Fetch operators by org capacity |
| GET | `/incidents/:id` | Incident detail (for tracking panel) |

### New Backend Endpoint

**GET /assignments/operator/:operatorId/count**
- **Purpose**: Fetch active (non-soft-deleted) assignment count for an operator
- **Auth**: `@RequirePermission('ASSIGN')` (existing decorator)
- **Response**: `{ count: number, operatorId: string }`
- **Implementation**: Single query to COUNT(*) assignments WHERE operator_id = :operatorId AND deleted_at IS NULL

---

## Frontend Service Design

**assignment.service.ts** (new):
```typescript
export class AssignmentService {
  assign(operatorId: string, incidentId: string): Observable<AssignmentResult> {
    // POST /assignments with { operatorId, incidentId }
  }

  getOperatorWorkload(operatorId: string): Observable<{ count: number }> {
    // GET /assignments/operator/:operatorId/count
  }

  getAvailableOperators(): Observable<Operator[]> {
    // GET /assignments/:id/available-operators (existing, wrapped for reuse)
  }

  getLatestAssignment(incidentId: string): Observable<Assignment | null> {
    // GET /incidents/:id/assignments/latest (may need new backend endpoint if not exists)
  }
}
```

---

## RBAC & Permission Design

**Permission Used**: `ASSIGN` (existing)
- Gated on: AssignmentsController methods (backend already enforces)
- Frontend guard: Show "Asignar" dropdown button only if `permissions.includes('ASSIGN assignments')`
- Bulk button: Same guard

**Affected Roles**: Master, operador_sistema, admin_org (supervisors only)
- Reporter role: No ASSIGN permission → buttons hidden
- operador_org: No ASSIGN permission → buttons hidden

**409 Conflict Handling**:
- Backend returns 409 ConflictException if incident already assigned
- Frontend catches it, shows toast "Este incidente ya fue asignado"
- Calls `unassignedIncidents$.next(updated_list)` to refresh modal

---

## UI/UX Decisions

**Decision D1: Two-Panel Modal over Tabs**
- Supervisors see operator workload + available incidents simultaneously
- No context switching (tabs hide one panel while working on the other)
- Drag-and-drop-like UX: pick operator on left, pick incident on right, click Assign

**Decision D2: Three-Dot Dropdown over Inline Buttons**
- Row actions: Ver, Asignar, Seguimiento, Eliminar
- Inline buttons would crowd table
- Consistent with existing user-detail-modal pattern in admin/users

**Decision D3: Live Client-Side Timers (setInterval)**
- No backend polling needed
- Timestamps already in incident and assignment records
- Sufficient precision for UI display ("2 hours 15 min")
- OnDestroy cleanup prevents leaks

**Decision D4: Workload Counts via Dedicated Endpoint**
- Don't compute client-side from list calls (N+1 problem at scale)
- One call per operator shown: `GET /assignments/operator/:operatorId/count`
- Lightweight: COUNT(*) query, no joins

**Decision D5: No New Schema Changes**
- `assignments.created_at` already records assignment timestamp
- `incidents.created_at` provides creation timestamp
- Soft deletes already in assignments table

---

## Testing Strategy

**Unit Tests**:
- `assignment.service.spec.ts`: Test assign(), getOperatorWorkload(), error handling
- `assignment-modal.component.spec.ts`: Test operator selection, incident selection, submit flow, 409 handling
- `tracking-panel.component.spec.ts`: Test timer lifecycle, cleanup on destroy, time formatting

**Integration Tests**:
- E2E: Full flow from list → modal → assignment → confirmation
- E2E: Conflict scenario (two supervisors assign same incident)
- E2E: Permission gate (non-supervisor sees no dropdown)

**Coverage Target**: 85%+ for new components

---

## Implementation Phases

**Phase 1 (Backend, ~2 days)**:
- New endpoint: GET /assignments/operator/:operatorId/count
- AssignmentsService.countByOperator() method
- Tests: Unit + integration

**Phase 2 (Frontend, ~3 days)**:
- AssignmentService wrapper
- AssignmentModal component (two-panel layout)
- ActionsDropdown component (row menu)
- Template integration in incident-list

**Phase 3 (Tracking Panel, ~2 days)**:
- TrackingPanel component
- Timer lifecycle management
- Integration with incident-list

**Phase 4 (Testing & Polish, ~1 day)**:
- E2E coverage
- 409 conflict handling
- Permission guards
- Toast notifications

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Bulk assignment race (two supervisors assign same incident) | Backend 409 + frontend refresh |
| Operator list grows large | Pagination or search filter in left panel (future) |
| Timer precision drift | Client-side seconds sufficient; no business logic depends on it |
| User sees button but backend rejects | Frontend permission check + 403 toast |
| Modal state desync after background assignment | Refresh unassigned list on modal open |

---

## Rollback Plan

1. Frontend: Remove assignment-modal, actions-dropdown, tracking-panel components
2. Restore single "Ver" button in incident-list
3. Backend: Remove GET /assignments/operator/:operatorId/count endpoint
4. No migration to revert (no schema changes)

---

## Success Criteria

- ✅ Supervisors can assign unassigned incidents from list view (not detail page only)
- ✅ Assignment modal shows operator workload alongside available incidents
- ✅ Three-dot dropdown per row (Ver, Asignar, Seguimiento, Eliminar placeholder)
- ✅ Seguimiento panel displays incident + operator + elapsed timers
- ✅ 409 conflicts handled gracefully (toast + refresh)
- ✅ ASSIGN permission enforced (unauthorized roles don't see UI)
- ✅ Unit tests + integration tests pass; 85%+ coverage
