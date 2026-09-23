# Tasks: Incidents Assignment Feature

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend endpoint) → PR 2 (frontend service + actions-dropdown) → PR 3 (assignment-modal + tracking-panel + list integration) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend: `countByOperator` endpoint | PR 1 | `npm test -- assignments` (backend) | `curl /api/assignments/operator/:id/count` after `npm run start:dev` | Remove route + method from controller/service; no schema change |
| 2 | Frontend service + actions-dropdown | PR 2 | `ng test --include **/assignment.service.spec.ts --include **/actions-dropdown.component.spec.ts` | N/A — headless unit tests only; no running backend needed for service stubs | Delete `assignment.service.ts` and `actions-dropdown/` folder |
| 3 | Assignment modal + tracking panel + list integration | PR 3 | `ng test --include **/assignment-modal** --include **/tracking-panel** --include **/incident-list**` | Manual smoke: `ng serve` → incidents list → open modal, open panel | Revert `incident-list` to single "Ver" button; delete `assignment-modal/` and `tracking-panel/` |

---

## Phase 1: Backend — countByOperator Endpoint

- [ ] 1.1 **RED** Write failing unit test in `backend/src/modules/assignments/assignments.service.spec.ts`: `countByOperator('op-1')` returns `2` when repo finds 2 active rows for `op-1`.
- [ ] 1.2 Add `countByOperator(operatorId: string): Promise<number>` to `backend/src/modules/assignments/assignments.service.ts` using `count({ where: { operatorId, deletedAt: IsNull() } })`.
- [ ] 1.3 **RED** Write failing unit test in `backend/src/modules/assignments/assignments.controller.spec.ts`: `GET /assignments/operator/:id/count` calls `service.countByOperator` and returns `{ count: N }`.
- [ ] 1.4 Add `@Get('operator/:operatorId/count') @RequirePermission('READ') getOperatorCount(@Param('operatorId') id: string)` to `backend/src/modules/assignments/assignments.controller.ts`, returning `{ count: number }`.
- [ ] 1.5 Verify `npm test -- --testPathPattern=assignments` passes (backend working directory).

## Phase 2: Frontend Service Layer

- [ ] 2.1 **RED** Write failing test in `frontend/src/app/core/services/assignment.service.spec.ts`: `listUnassigned()` calls `GET /incidents?status=pending&claimed_by=null`; `getOperatorsWithCounts(orgId)` calls `GET /users?role=operador_org&orgId=`; `createAssignment(dto)` calls `POST /assignments`.
- [ ] 2.2 Create `frontend/src/app/core/services/assignment.service.ts` with `HttpClient` injection; implement `listUnassigned(): Observable<Incident[]>`, `getOperatorsWithCounts(orgId: string): Observable<OperatorWithCount[]>`, and `createAssignment(dto: AssignIncidentDto): Observable<AssignmentEntity>`.
- [ ] 2.3 Add typed error handling: re-throw `409` as `AssignmentConflictError`, `403` as `AssignmentForbiddenError` (plain classes, not HTTP exceptions — frontend-only).
- [ ] 2.4 Verify `ng test --include **/assignment.service.spec.ts` passes.

## Phase 3: Actions Dropdown Component

- [ ] 3.1 **RED** Write failing test in `frontend/src/app/features/incidents/components/actions-dropdown/actions-dropdown.component.spec.ts`: renders three-dot button; emits `assign`, `tracking`, `delete` outputs on item click; hides "Asignar" item when `canAssign` input is `false`.
- [ ] 3.2 Create `frontend/src/app/features/incidents/components/actions-dropdown/actions-dropdown.component.ts` following `ActionMenuComponent` pattern (`HostListener document:click`, `ElementRef`, signals); inputs: `incidentId: string`, `canAssign: boolean`; outputs: `assign`, `tracking`, `delete`.
- [ ] 3.3 Create `frontend/src/app/features/incidents/components/actions-dropdown/actions-dropdown.component.html` with three-dot trigger button and menu items: Asignar (`@if(canAssign())`), Seguimiento, Eliminar.
- [ ] 3.4 Create `frontend/src/app/features/incidents/components/actions-dropdown/actions-dropdown.component.css` mirroring `.menu`, `.menu-item`, `.icon-btn` tokens from `action-menu.component.ts`.
- [ ] 3.5 Verify `ng test --include **/actions-dropdown.component.spec.ts` passes.

## Phase 4: Assignment Modal Component

- [ ] 4.1 **RED** Write failing tests in `frontend/src/app/features/incidents/components/assignment-modal/assignment-modal.component.spec.ts`: renders operator list with counts; renders unassigned incidents; pre-selects incident when `preselectedIncidentId` input provided; "Asignar (N)" count updates on selection; submit calls `assignmentService.createAssignment` once per selected incident; shows inline error on 409; closes and emits `assigned` on success; resets state on reopen.
- [ ] 4.2 Create `frontend/src/app/features/incidents/components/assignment-modal/assignment-modal.component.ts` with signals: `operators`, `unassignedIncidents`, `selectedOperator`, `selectedIncidents`, `submitting`, `conflictError`; `@Input() preselectedIncidentId`; `@Output() assigned`, `@Output() closed`; `OnInit` fetches both panels; `OnChanges` resets on reopen.
- [ ] 4.3 Create `frontend/src/app/features/incidents/components/assignment-modal/assignment-modal.component.html`: two-panel layout — left panel operator list with count badges (sortable by count asc), right panel unassigned incidents checkboxes; submit button shows "Asignar (N)"; inline conflict error block; empty states for both panels; backdrop div with `(click)="close()"`.
- [ ] 4.4 Create `frontend/src/app/features/incidents/components/assignment-modal/assignment-modal.component.css`: modal overlay, two-column grid, panel scroll, badge token colors.
- [ ] 4.5 Implement `submit()`: iterate `selectedIncidents`, call `createAssignment` per item via `forkJoin`, handle `409` inline, on full success emit `assigned` count and call `close()`; show toast via `NotificationService`.
- [ ] 4.6 Implement `sortByCountAsc()` method updating `operators` signal order.
- [ ] 4.7 Verify `ng test --include **/assignment-modal.component.spec.ts` passes.

## Phase 5: Tracking Panel Component

- [ ] 5.1 **RED** Write failing tests in `frontend/src/app/features/incidents/components/tracking-panel/tracking-panel.component.spec.ts`: renders title/description/priority/location; shows "Sin ubicación" when missing; shows "No asignado" for unassigned; Timer 1 ticks every second; Timer 2 shows "--:--" when unassigned; `ngOnDestroy` clears intervals; format switches to HH:MM:SS above 1 hour; Escape key closes panel.
- [ ] 5.2 Create `frontend/src/app/features/incidents/components/tracking-panel/tracking-panel.component.ts`: `@Input() incident: Incident`; `@Input() assignment: AssignmentEntity | null`; `@Output() closed`; signals `timer1`, `timer2`; two `setInterval` handles; `OnDestroy` clears both; `formatElapsed(ms)` returns MM:SS or HH:MM:SS; `@HostListener('document:keydown.escape')` emits `closed`.
- [ ] 5.3 Create `frontend/src/app/features/incidents/components/tracking-panel/tracking-panel.component.html`: side panel with X close button, incident summary section, operator/assignment section, two timer blocks.
- [ ] 5.4 Create `frontend/src/app/features/incidents/components/tracking-panel/tracking-panel.component.css`: slide-in panel, two-column timer layout, priority badge tokens.
- [ ] 5.5 Verify `ng test --include **/tracking-panel.component.spec.ts` passes.

## Phase 6: Incident List Integration

- [ ] 6.1 **RED** Write failing tests in `frontend/src/app/features/incidents/incident-list/incident-list.component.spec.ts`: toolbar "Asignar" button present for `ASSIGN assignments` permission; absent for unauthorized role; row dropdown triggers `openModal(incident)` on assign action; row dropdown triggers `openPanel(incident)` on tracking action; modal closes on `(assigned)` output; modal state resets on second open.
- [ ] 6.2 Update `frontend/src/app/features/incidents/incident-list/incident-list.component.ts`: inject `AssignmentService`; add signals `showModal`, `showPanel`, `selectedIncident`, `panelAssignment`; add `canAssign` computed from `permissions`; add `openModal(incident?)`, `closeModal()`, `onAssigned()`, `openPanel(incident)`, `closePanel()` handlers; import new components.
- [ ] 6.3 Update `frontend/src/app/features/incidents/incident-list/incident-list.component.html`: replace `<app-view-action-btn>` in each row with `<app-actions-dropdown [incidentId]="inc.id" [canAssign]="canAssign()" (assign)="openModal(inc)" (tracking)="openPanel(inc)">`; add toolbar "Asignar" button gated by `@if(canAssign())`; add `<app-assignment-modal>` and `<app-tracking-panel>` at bottom of template with `@if` guards.
- [ ] 6.4 Update `frontend/src/app/features/incidents/incident-list/incident-list.component.css`: toolbar button style using F0 tokens; no new color literals.
- [ ] 6.5 Verify `ng test --include **/incident-list.component.spec.ts` passes.

## Phase 7: Error Handling and Edge Cases (RED tests first)

- [ ] 7.1 **RED** Test in `assignment-modal.component.spec.ts`: 409 from `createAssignment` renders inline "Incidencia ya asignada. ¿Actualizar lista?" and does not close modal; clicking refresh re-fetches unassigned list.
- [ ] 7.2 **RED** Test in `assignment-modal.component.spec.ts`: 403 shows toast and modal stays open.
- [ ] 7.3 **RED** Test in `assignment-modal.component.spec.ts`: empty operator list shows "No hay operadores disponibles" and disables submit button.
- [ ] 7.4 **RED** Test in `assignment-modal.component.spec.ts`: empty unassigned incidents list shows "No hay incidencias sin asignar".
- [ ] 7.5 Implement error handling branches in `assignment-modal.component.ts` to make tasks 7.1–7.4 tests pass.

## Phase 8: Full Suite Verification

- [ ] 8.1 Run `npm test` from `backend/` — all assignments tests pass, no regressions.
- [ ] 8.2 Run `ng test` from `frontend/` — all new component specs pass, no regressions.
- [ ] 8.3 Run `npm run lint` from `backend/`; run `ng lint` from `frontend/` — zero violations.
- [ ] 8.4 Run `npm run typecheck` from `backend/`; run `ng build --no-emit` (or `tsc --noEmit`) from `frontend/` — zero type errors.
- [ ] 8.5 Manual smoke test (all three roles): master sees toolbar button and row "Asignar"; operador_org sees dropdown without "Asignar"; reporter sees dropdown without "Asignar"; assignment modal opens, submits, closes; tracking panel opens, timers tick, Escape closes.
