# Proposal: Double-Click Expand/Collapse for Menu Tree

**Change**: `2026-09-22-sc-menu-tree-double-click-expand`  
**Scope**: Frontend (Angular) — UI/UX Enhancement  
**Date**: 2026-09-22  
**Phase**: F6 (UX Polish)  
**Ticket**: TBD (Shortcut)

---

## Intent

In the menu options tree view (`MenuTreeComponent`), allow users to double-click anywhere on a menu row to toggle the expand/collapse state of that row's children. Currently, expansion is only available via a small chevron icon. Double-click provides a larger hit area and more intuitive gesture.

**Used In**:
- `/app/admin/controles` (Menu Options Control Panel) — MenuTreeComponent  
- Any other views using MenuTreeComponent with hierarchical menu items

**User Flow**:
1. Admin views menu options tree
2. Admin double-clicks on a menu row (anywhere on the row, not just the chevron)
3. Menu item expands/collapses to show/hide child items
4. Double-click again to toggle back

---

## Scope

### In Scope

**Component**: `MenuTreeComponent` (location TBD - likely `frontend/src/app/shared/components/menu-tree/menu-tree.component.ts` or similar)

**Template Changes**: 
- Add `(dblclick)="toggleExpand(id)"` directive to the row/item element
- Add `[class.has-children]="hasChildren(id)"` class binding
- Only applies to rows with children (chevron visible rows)

**Behavior**:
- Double-click on row = calls existing `toggleExpand(id)` method with menu item ID
- Respects existing `expandedNodes` signal (Record<string, boolean>)
- No state changes needed; reuses current expand logic

### Out of Scope

- Single-click behavior (unchanged)
- Chevron click behavior (unchanged)
- Menu tree display or structure changes
- Drag-and-drop or other gestures
- CategoryListComponent and LocationListComponent (different implementation pattern — covered in separate SDD)

---

## Technical Context

### Current Implementation

**Component**: `MenuTreeComponent`

**Pattern**: ID-based with Record storage (different from CategoryListComponent/LocationListComponent which use node-based with Set storage)

```typescript
// Storage
private readonly expandedNodes = signal<Record<string, boolean>>({});

// Methods
toggleExpand(id: string): void {
  const expanded = { ...this.expandedNodes() };
  expanded[id] = !expanded[id];
  this.expandedNodes.set(expanded);
}

hasChildren(id: string): boolean {
  // Determines if menu item ID has children
  return /* logic to check child count */;
}
```

**Template Structure**: Tree view of menu items with expand/collapse chevrons

**Change**: Add double-click binding to row element (1 line template + CSS)

**Why Separate SDD**: MenuTreeComponent uses ID-based pattern with `Record<string, boolean>` storage, while CategoryListComponent and LocationListComponent use node-based pattern with `Set<string>` storage. The template binding signatures differ:
- CategoryListComponent: `(dblclick)="hasChildren(node) && toggleExpand(node)"`
- MenuTreeComponent: `(dblclick)="hasChildren(id) && toggleExpand(id)"`

This architectural difference justifies a separate SDD with adapted implementation.

---

## Database Changes

None.

---

## Permission Changes

None.

---

## Deliverables

1. Updated template in `menu-tree.component.html`
2. CSS styling for menu-tree component
3. Unit tests (template interaction)
4. E2E tests (double-click behavior on `/app/admin/controles`)
5. No component logic changes (reuses `toggleExpand()`, `hasChildren()`)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Double-click conflicts with text selection | User frustration on accidental select | Add CSS `user-select: none` to row |
| Unintended expansion on accident | Minor UX friction | Double-click is intentional gesture |
| Keyboard users left out | Accessibility concern | Chevron button stays accessible via Tab + Enter |

---

## Success Criteria

- [ ] Double-click on menu row with children expands/collapses
- [ ] Double-click on leaf menu row does nothing (no error)
- [ ] Chevron button still works (single click)
- [ ] Keyboard navigation still works (Tab + Enter on chevron)
- [ ] No text selection artifacts on double-click
- [ ] E2E tests pass for `/app/admin/controles`
- [ ] No regression in existing expand/collapse behavior

---
