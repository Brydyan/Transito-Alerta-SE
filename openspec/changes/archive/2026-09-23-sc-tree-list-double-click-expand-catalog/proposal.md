# Proposal: Double-Click Expand/Collapse for Catalog Tree Lists

**Change**: `2026-09-22-sc-tree-list-double-click-expand-catalog`  
**Scope**: Frontend (Angular) — UI/UX Enhancement  
**Date**: 2026-09-22  
**Phase**: F6 (UX Polish)  
**Ticket**: TBD (Shortcut)

---

## Intent

In catalog tree list views, allow users to double-click anywhere on a row to toggle the expand/collapse state of that row's children. Currently, expansion is only available via a small chevron icon. Double-click provides a larger hit area and more intuitive gesture.

**Applies to**:
- `/app/categorias` (Incident Categories) — CategoryListComponent
- `/app/ubicaciones` (Locations/Geo-Zones) — LocationListComponent

**User Flow**:
1. Admin views catalog list
2. Admin double-clicks on a row (anywhere on the row, not just the chevron)
3. Row expands/collapses to show/hide children
4. Double-click again to toggle back

---

## Scope

### In Scope

**Components**:
- `CategoryListComponent` (`frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts`)
- `LocationListComponent` (`frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts`)

**Template Changes**: 
- Add `(dblclick)="toggleExpand(node)"` directive to the row element
- Add `[class.has-children]="hasChildren(node)"` class binding
- Only applies to rows with children (chevron visible rows)

**Behavior**:
- Double-click on row = calls existing `toggleExpand(node)` method
- Respects existing `expandedIds` signal (Set<string>)
- No state changes needed; reuses current expand logic

### Out of Scope

- Single-click behavior (unchanged)
- Chevron click behavior (unchanged)
- Catalog list display or structure changes
- Drag-and-drop or other gestures
- MenuOptionsComponent (menu-tree) — different implementation pattern (id-based, not node-based)

---

## Technical Context

### Current Implementation (Identical in Both Components)

Both components follow the same pattern:

```typescript
// Storage
readonly expandedIds = signal<Set<string>>(new Set());

// Methods
toggleExpand(node: IncidentCategoryNode | IGeoZoneNode): void {
  const expanded = new Set(this.expandedIds());
  if (expanded.has(node.id)) {
    expanded.delete(node.id);
  } else {
    expanded.add(node.id);
  }
  this.expandedIds.set(expanded);
}

hasChildren(node: IncidentCategoryNode | IGeoZoneNode): boolean {
  return node.children.length > 0;
}
```

**Template Structure**: Tree view with expand/collapse chevrons

**Change**: Add double-click binding to row element (1 line template + CSS per component)

---

## Database Changes

None.

---

## Permission Changes

None.

---

## Deliverables

1. Updated template in `category-list.component.html`
2. Updated template in `location-list.component.html`
3. CSS styling for both components
4. Unit tests (template interaction)
5. E2E tests (double-click behavior on each route)
6. No component logic changes (reuses `toggleExpand()`, `hasChildren()`)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Double-click conflicts with text selection | User frustration on accidental select | Add CSS `user-select: none` to row |
| Unintended expansion on accident | Minor UX friction | Double-click is intentional gesture |
| Keyboard users left out | Accessibility concern | Chevron button stays accessible via Tab + Enter |

---

## Success Criteria

- [ ] Double-click on category/location row with children expands/collapses
- [ ] Double-click on leaf row does nothing (no error)
- [ ] Chevron button still works (single click)
- [ ] Keyboard navigation still works (Tab + Enter on chevron)
- [ ] No text selection artifacts on double-click
- [ ] E2E tests pass for both `/app/categorias` and `/app/ubicaciones`
- [ ] No regression in existing expand/collapse behavior
