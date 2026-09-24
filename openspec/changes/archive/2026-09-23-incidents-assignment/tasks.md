# Tasks: Incidents Assignment Feature

**Change**: `incidents-assignment`
**Date**: 2026-09-23
**Chain Strategy**: feature-branch-chain (branch: brydyan/sc-incidents-assignment-feature)
**Delivery Strategy**: auto-chain

---

## Review Workload Forecast

- `Decision needed before apply: No`
- `Chained PRs recommended: No`
- `400-line budget risk: Medium`

---

## Phase 1: Backend — New Endpoint

- [x] 1.1 Add `countByOperator(operatorId)` method to `assignments.service.js`
- [x] 1.2 Add `GET /assignments/operator/:operatorId/count` route to `assignments.controller.js`
- [x] 1.3 Update `assignments.service.d.ts` declaration for `countByOperator`
- [x] 1.4 Update `assignments.controller.d.ts` declaration for `countByOperator`

## Phase 2: Frontend — AssignmentService

- [x] 2.1 Create `assignment.service.spec.ts` (TDD RED — tests first)
- [x] 2.2 Create `assignment.service.ts` with `assign()`, `getOperatorWorkload()`, `getAvailableOperators()`, `getLatestAssignment()` (TDD GREEN)

## Phase 3: AssignmentModal Component

- [x] 3.1 Create `assignment-modal.component.spec.ts` (TDD RED)
- [x] 3.2 Create `assignment-modal.component.ts` (TDD GREEN — two-panel layout, signal state)

## Phase 4: ActionsDropdown Component

- [x] 4.1 Create `actions-dropdown.component.spec.ts` (TDD RED)
- [x] 4.2 Create `actions-dropdown.component.ts` (TDD GREEN — three-dot menu, RBAC gate)

## Phase 5: TrackingPanel Component

- [x] 5.1 Create `tracking-panel.component.spec.ts` (TDD RED — timer lifecycle tests)
- [x] 5.2 Create `tracking-panel.component.ts` (TDD GREEN — setInterval + OnDestroy cleanup)

## Phase 6: Integration in incident-list

- [x] 6.1 Create `incident-list-assignment.spec.ts` (TDD RED — new state signals)
- [x] 6.2 Update `incident-list.component.ts` (add modal/dropdown/tracking state signals + ASSIGN gate)
- [x] 6.3 Update `incident-list.component.html` (toolbar button + ActionsDropdown per row + overlays)
- [x] 6.4 Update `incident-list.component.css` (no changes needed)

## Phase 7: E2E Tests

- [x] 7.1 Create `incidents-assignment.e2e.ts` (14 BDD scenarios)

## Phase 8: Error Handling (inline in components)

- [x] 8.1 409 Conflict handling in `assignment-modal.component.ts` (toast + modal stays open)
- [x] 8.2 Permission gate in `incident-list.component.ts` (hasAssignPermission computed)
- [x] 8.3 Timer cleanup in `tracking-panel.component.ts` (ngOnDestroy)
