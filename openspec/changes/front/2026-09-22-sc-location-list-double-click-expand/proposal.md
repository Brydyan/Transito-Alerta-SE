# Proposal: Double-Click Expand/Collapse for Location List

**Change**: `2026-09-22-sc-location-list-double-click-expand`  
**Scope**: Frontend (Angular) — UI/UX Enhancement  
**Date**: 2026-09-22  
**Phase**: F6 (UX Polish)  
**Ticket**: TBD (Shortcut)

---

## Intent

In the location list view (`/app/ubicaciones`), allow users to double-click anywhere on a location row to toggle the expand/collapse state of that location's children (sub-zones). Currently, expansion is only available via a small chevron icon. Double-click provides a larger hit area and more intuitive gesture.

**User Flow**:
1. Admin views location list
2. Admin double-clicks on a location row (anywhere on the row, not just the chevron)
3. Location expands/collapses to show/hide child zones
4. Double-click again to toggle back

---

## Scope

### In Scope

**Component**: `LocationListComponent` (`frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts`)

**Template Changes**: 
- Add `(dblclick)="toggleExpand(node)"` directive to the location row element
- Only applies to locations with children (chevron visible rows)

**Behavior**:
- Double-click on row = calls existing `toggleExpand(node)` method
- Respects existing `expandedIds` signal
- No state changes needed; reuses current expand logic

### Out of Scope

- Single-click behavior (unchanged)
- Chevron click behavior (unchanged)
- Location list display or structure changes
- Drag-and-drop or other gestures

---

## Technical Context

**Component**: `LocationListComponent` (`frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts`)

**Current State**: Has `toggleExpand()` method, `expandedIds` signal, `hasChildren()` method (identical to CategoryListComponent pattern)

**Template Structure**: Tree view of geo-zones with expand/collapse chevrons

**Change**: Add double-click binding to row element (1 line template + CSS)

---

## Database Changes

None.

---

## Permission Changes

None.

---

## Deliverables

1. Updated template in `location-list.component.html`
2. Unit tests (template interaction)
3. E2E test (double-click behavior)
4. No component logic changes (reuses `toggleExpand()`)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Double-click conflicts with text selection | User frustration on accidental select | Add CSS `user-select: none` to row |
| Unintended expansion on accident | Minor UX friction | Double-click is intentional; users can undo easily |
| Keyboard users left out | Accessibility concern | Chevron button stays accessible via Tab + Enter |

---

## Success Criteria

- [ ] Double-click on location row with children expands/collapses
- [ ] Double-click on location row without children does nothing (no error)
- [ ] Chevron button still works (single click)
- [ ] Keyboard navigation still works (Tab + Enter on chevron)
- [ ] No text selection artifacts on double-click
- [ ] E2E test covers double-click scenarios
- [ ] No regression in existing expand/collapse behavior
