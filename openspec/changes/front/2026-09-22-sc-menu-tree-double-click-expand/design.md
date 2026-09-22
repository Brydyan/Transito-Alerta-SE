# Design: Double-Click Expand/Collapse for Menu Tree

**Change**: `2026-09-22-sc-menu-tree-double-click-expand`  
**Status**: DESIGN  
**Last Updated**: 2026-09-22

---

## Overview

Add double-click gesture to menu tree rows to toggle expand/collapse state. Reuses existing `toggleExpand(id)` logic; only template + CSS changes needed.

**Applies To**:
- `MenuTreeComponent` (used in `/app/admin/controles` and potentially other views)

**Change Vector**: 1 template (1 line) + CSS styling

**Key Difference**: ID-based pattern with `Record<string, boolean>` storage (vs. node-based pattern in CategoryListComponent/LocationListComponent)

---

## D1: Event Binding — (dblclick)

**Decision**: Use Angular's `(dblclick)` event binding on the menu item element.

**Why**: 
- Built-in to Angular; no custom event listeners
- Browser handles double-click detection (~300ms window)
- Cleaner than manual mousedown/mouseup tracking

**Alternative Rejected**: Custom mousedown counter. Requires state tracking; overkill for standard gesture.

---

## D2: Conditional Execution — Only for Items with Children

**Decision**: Double-click only has effect if `hasChildren(id)` is true.

**Why**: 
- Leaf menu items have no children; toggling does nothing
- Prevents confusion: users expect visual feedback
- Matches chevron visibility: if chevron is hidden, double-click is disabled

**Implementation**:
```html
(dblclick)="hasChildren(id) && toggleExpand(id)"
```

---

## D3: CSS — Cursor & Selection Hints

**Decision**: Add CSS to rows with children:
- `cursor: pointer` — signals interactivity
- `user-select: none` — prevents text selection artifacts on double-click

**CSS** (adapted for menu-tree context):
```scss
// Selector depends on MenuTreeComponent's row element structure
// Example if rows are <div> elements with class="menu-item":
.menu-item {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}

// Alternative if rows are nested list items:
li {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}
```

**Template** (add class binding):
```html
<div [class.has-children]="hasChildren(id)"
     (dblclick)="hasChildren(id) && toggleExpand(id)">
  <!-- menu item content -->
</div>
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

## D6: ID-Based Pattern Assumption

**Decision**: This SDD consolidates **only** MenuTreeComponent (ID-based pattern). CategoryListComponent and LocationListComponent are **out of scope** (use node-based pattern with Set storage).

**Why**: 
- MenuTreeComponent uses ID-based signature: `toggleExpand(id: string)`, `hasChildren(id: string)`, `expandedNodes: Record<string, boolean>`
- CategoryListComponent and LocationListComponent use different pattern: `toggleExpand(node)`, `hasChildren(node)`, `expandedIds: Set<string>`
- Requires separate SDD with different template binding

---

## Affected Components

### MenuTreeComponent

**File**: Location TBD (investigation required — likely in `frontend/src/app/shared/components/` or `frontend/src/app/features/admin/`)

**No Component Code Changes**. The `toggleExpand()` and `hasChildren()` methods already exist.

**Template File**: `menu-tree.component.html`

**Change**: Update menu item element:

```html
<!-- Before -->
<div class="menu-item">
  <button *ngIf="hasChildren(id)" (click)="toggleExpand(id)" class="chevron">
    <i [class.open]="isExpanded(id)">▶</i>
  </button>
  ...
</div>

<!-- After -->
<div [class.has-children]="hasChildren(id)"
     (dblclick)="hasChildren(id) && toggleExpand(id)"
     class="menu-item">
  <button *ngIf="hasChildren(id)" (click)="toggleExpand(id)" class="chevron">
    <i [class.open]="isExpanded(id)">▶</i>
  </button>
  ...
</div>
```

**Stylesheet**: `menu-tree.component.scss`

**Change**: Add styling (selector may vary based on actual component structure):

```scss
.menu-item {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}

// Or if using <li> elements:
li {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}
```

---

## Verification Checklist

- [ ] Template has `(dblclick)` binding on menu item element
- [ ] Template has `[class.has-children]` class binding
- [ ] Stylesheet has cursor and user-select rules
- [ ] Chevron click still works (single click)
- [ ] Double-click on menu item with children toggles expand/collapse
- [ ] Double-click on menu item without children does nothing (no error)
- [ ] Text selection is prevented on double-click
- [ ] Keyboard Tab + Enter on chevron still works
- [ ] No regression in expand/collapse state management
- [ ] E2E tests pass for `/app/admin/controles`
- [ ] All tests pass

---

## No Breaking Changes

**Backward Compatibility**:
- Existing chevron click behavior unchanged
- Keyboard navigation unchanged
- Menu tree display unchanged
- Pure addition of new gesture

---

## Implementation Prerequisites

Before implementing:

1. **Locate MenuTreeComponent**: Determine exact file path and component structure
2. **Analyze template structure**: Identify the row/item element selector (div, li, tr, etc.)
3. **Verify method signatures**: Confirm `toggleExpand(id)` and `hasChildren(id)` methods exist
4. **Check signal pattern**: Confirm `expandedNodes` uses `Record<string, boolean>` pattern

---
