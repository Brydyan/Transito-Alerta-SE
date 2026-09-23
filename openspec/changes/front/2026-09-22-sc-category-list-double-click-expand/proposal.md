# Proposal: Double-Click Expand/Collapse for Category List

**Change**: `2026-09-22-sc-category-list-double-click-expand`  
**Scope**: Frontend (Angular) — UI/UX Enhancement  
**Date**: 2026-09-22  
**Phase**: F6 (UX Polish)  
**Ticket**: TBD (Shortcut)

---

## Intent

In the category list view (`/app/categorias`), allow users to double-click anywhere on a category row to toggle the expand/collapse state of that category's children. Currently, expansion is only available via a small chevron icon. Double-click provides a larger hit area and more intuitive gesture.

**User Flow**:
1. Admin views category list
2. Admin double-clicks on a category row (anywhere on the row, not just the chevron)
3. Category expands/collapses
4. Double-click again to toggle back

---

## Scope

### In Scope

**Component**: `CategoryListComponent` (`frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts`)

**Template Changes**: 
- Add `(dblclick)="toggleExpand(node)"` directive to the category row element
- Only applies to categories with children (chevron visible rows)

**Behavior**:
- Double-click on row = calls existing `toggleExpand(node)` method
- Respects existing `expandedIds` signal
- No state changes needed; reuses current expand logic

### Out of Scope

- Single-click behavior (unchanged)
- Chevron click behavior (unchanged)
- Category list display or structure changes
- Drag-and-drop or other gestures

---

## Technical Context

### Current Implementation

**CategoryListComponent**:
```typescript
toggleExpand(node: IncidentCategoryNode): void {
  const expanded = new Set(this.expandedIds());
  if (expanded.has(node.id)) {
    expanded.delete(node.id);
  } else {
    expanded.add(node.id);
  }
  this.expandedIds.set(expanded);
}
```

**Template** (simplified):
```html
<tr *ngFor="let node of visibleNodes()">
  <td *ngIf="hasChildren(node)">
    <button (click)="toggleExpand(node)" class="chevron">
      <i [class.open]="isExpanded(node)">▶</i>
    </button>
  </td>
  <td>{{ node.name }}</td>
  ...
</tr>
```

### After Change

**Template**:
```html
<tr *ngFor="let node of visibleNodes()" 
    (dblclick)="hasChildren(node) && toggleExpand(node)"
    [class.has-children]="hasChildren(node)">
  ...
</tr>
```

The existing chevron click handler stays; double-click on row calls the same `toggleExpand()`.

---

## Database Changes

None.

---

## Permission Changes

None.

---

## Deliverables

1. Updated template in `category-list.component.html`
2. Unit tests (template interaction)
3. E2E test (double-click behavior)
4. No component logic changes (reuses `toggleExpand()`)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Double-click conflicts with text selection | User frustration on accidental select | Add CSS `user-select: none` to row; or check `event.detail === 2` to ensure double-click |
| Unintended expansion on accident | Minor UX friction | Double-click is intentional gesture; users can easily double-click again to collapse |
| Keyboard users left out | Accessibility concern | Chevron button stays accessible via Tab + Enter |

---

## Success Criteria

- [ ] Double-click on category row with children expands/collapses
- [ ] Double-click on category row without children does nothing (no error)
- [ ] Chevron button still works (single click)
- [ ] Keyboard navigation still works (Tab + Enter on chevron)
- [ ] No text selection artifacts on double-click
- [ ] E2E test covers double-click scenarios
- [ ] No regression in existing expand/collapse behavior
