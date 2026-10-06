# Design: Double-Click Expand/Collapse for Catalog Tree Lists

**Change**: `2026-09-22-sc-tree-list-double-click-expand-catalog`  
**Status**: DESIGN  
**Last Updated**: 2026-09-22

---

## Overview

Add double-click gesture to catalog tree list rows (categories & locations) to toggle expand/collapse state. Reuses existing `toggleExpand()` logic; only template + CSS changes needed.

**Applies To**:
- `CategoryListComponent` (`/app/categorias`)
- `LocationListComponent` (`/app/ubicaciones`)

**Change Vector**: 2 templates (1 line each) + CSS styling × 2

---

## D1: Event Binding — (dblclick)

**Decision**: Use Angular's `(dblclick)` event binding on the table row element.

**Why**: 
- Built-in to Angular; no custom event listeners
- Browser handles double-click detection (~300ms window)
- Cleaner than manual mousedown/mouseup tracking

**Alternative Rejected**: Custom mousedown counter. Requires state tracking; overkill for standard gesture.

---

## D2: Conditional Execution — Only for Nodes with Children

**Decision**: Double-click only has effect if `hasChildren(node)` is true.

**Why**: 
- Leaf nodes have no children; toggling does nothing
- Prevents confusion: users expect visual feedback
- Matches chevron visibility: if chevron is hidden, double-click is disabled

**Implementation**:
```html
(dblclick)="hasChildren(node) && toggleExpand(node)"
```

---

## D3: CSS — Cursor & Selection Hints

**Decision**: Add CSS to rows with children:
- `cursor: pointer` — signals interactivity
- `user-select: none` — prevents text selection artifacts on double-click

**CSS** (same for both components):
```scss
tr {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}
```

**Template** (add class binding):
```html
<tr [class.has-children]="hasChildren(node)"
    (dblclick)="hasChildren(node) && toggleExpand(node)">
```

---

## D4: Accessibility — Preserve Keyboard Navigation

**Decision**: Chevron button remains focusable and clickable via keyboard. No changes to button handling.

**Why**: 
- Double-click is pointer-only gesture; keyboard users need an alternative
- Existing chevron button with Tab + Enter is sufficient
- Preserves WCAG compliance

**No Changes To**:
- Chevron button click handler (single click still works)
- Keyboard focus order
- Screen reader semantics

---

## D5: Event Propagation — No stopPropagation

**Decision**: Allow event to propagate. No `event.stopPropagation()` call.

**Why**: 
- No other elements on row listen to dblclick
- Clean separation: dblclick only triggers `toggleExpand()`

---

## D6: Node-Based Pattern Assumption

**Decision**: This SDD consolidates **only** node-based tree components (CategoryListComponent, LocationListComponent). Menu-tree is **out of scope** (uses id-based pattern with Record storage).

**Why**: 
- Both consolidated components use identical signature: `toggleExpand(node)`, `hasChildren(node)`, `expandedIds: Set<string>`
- MenuTreeComponent uses different pattern: `toggleExpand(id: string)`, `expandedNodes: Record<string, boolean>`
- Requires separate SDD with different template binding

---

## Affected Components

### 1. CategoryListComponent

**File**: `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts`

**No Component Code Changes**. The `toggleExpand()` and `hasChildren()` methods already exist.

**Template File**: `category-list.component.html`

**Change**: Update table row element:

```html
<!-- Before -->
<tr>
  <td *ngIf="hasChildren(node)">
    <button (click)="toggleExpand(node)" class="chevron">
      <i [class.open]="isExpanded(node)">▶</i>
    </button>
  </td>
  ...
</tr>

<!-- After -->
<tr [class.has-children]="hasChildren(node)"
    (dblclick)="hasChildren(node) && toggleExpand(node)">
  <td *ngIf="hasChildren(node)">
    <button (click)="toggleExpand(node)" class="chevron">
      <i [class.open]="isExpanded(node)">▶</i>
    </button>
  </td>
  ...
</tr>
```

**Stylesheet**: `category-list.component.scss`

```scss
tr {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}
```

---

### 2. LocationListComponent

**File**: `frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts`

**No Component Code Changes**. The `toggleExpand()` and `hasChildren()` methods already exist.

**Template File**: `location-list.component.html`

**Change**: Identical to CategoryListComponent (update row element with same bindings)

**Stylesheet**: `location-list.component.scss`

**Change**: Identical CSS

---

## Verification Checklist

- [ ] Both templates have `(dblclick)` binding on row element
- [ ] Both templates have `[class.has-children]` class binding
- [ ] Both stylesheets have cursor and user-select rules
- [ ] Chevron click still works (single click)
- [ ] Double-click on row with children toggles expand/collapse
- [ ] Double-click on row without children does nothing (no error)
- [ ] Text selection is prevented on double-click
- [ ] Keyboard Tab + Enter on chevron still works
- [ ] No regression in expand/collapse state management
- [ ] E2E tests pass for both `/app/categorias` and `/app/ubicaciones`
- [ ] All tests pass

---

## No Breaking Changes

**Backward Compatibility**:
- Existing chevron click behavior unchanged
- Keyboard navigation unchanged
- Catalog list display unchanged
- Pure addition of new gesture
