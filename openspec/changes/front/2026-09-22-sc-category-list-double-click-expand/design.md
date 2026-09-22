# Design: Double-Click Expand/Collapse for Category List

**Change**: `2026-09-22-sc-category-list-double-click-expand`  
**Status**: DESIGN  
**Last Updated**: 2026-09-22

---

## Overview

Add double-click gesture to category list rows to toggle expand/collapse state. Reuses existing `toggleExpand()` logic; only template change needed.

**Change Vector**: 1 line in template + CSS styling

---

## D1: Event Binding — (dblclick)

**Decision**: Use Angular's `(dblclick)` event binding on the table row element.

**Why**: 
- Built-in to Angular; no custom event listeners needed
- Browser handles double-click detection (waits for 2nd click within ~300ms)
- Cleaner than manual mousedown/mouseup tracking

**Alternative Rejected**: Custom mousedown counter. Requires state tracking and event listener cleanup. Not worth the added code for a standard gesture.

**Alternative Rejected**: Touchscreen double-tap. Out of scope for this change (category admin list is desktop-only); can be added later if needed.

---

## D2: Conditional Execution — Only for Nodes with Children

**Decision**: Double-click only has effect if `hasChildren(node)` is true.

**Why**: 
- Leaf categories have no children; toggling does nothing
- Prevents confusion: user double-clicks leaf, nothing happens, thinks it's broken
- Matches chevron visibility: if chevron is hidden, double-click is disabled

**Implementation**:
```html
(dblclick)="hasChildren(node) && toggleExpand(node)"
```

The `&&` operator ensures `toggleExpand()` only fires if `hasChildren()` returns true.

---

## D3: CSS — Cursor & Selection Hints

**Decision**: Add CSS to the row to hint that double-click is available:
- `cursor: pointer` on rows with children
- `user-select: none` to prevent text selection artifacts

**Why**: 
- `cursor: pointer` signals interactivity
- `user-select: none` prevents accidental text selection on double-click, which looks jarring

**CSS** (in `.component.scss`):
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
- Clean separation: dblclick only triggers `toggleExpand()`; click events are separate

**Alternative Rejected**: Add `$event.stopPropagation()` in template. Unnecessary; no other handlers conflict.

---

## Affected Components

### CategoryListComponent

**File**: `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts`

**No Component Code Changes**. The `toggleExpand()` method already exists and is reused.

---

### CategoryListComponent Template

**File**: `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.html`

**Change**: Update table row element (locate the `<tr *ngFor="let node of visibleNodes()">` line):

**Before**:
```html
<tr>
  <td *ngIf="hasChildren(node)">
    <button (click)="toggleExpand(node)" class="chevron">
      <i [class.open]="isExpanded(node)">▶</i>
    </button>
  </td>
  <td>{{ node.name }}</td>
  ...
</tr>
```

**After**:
```html
<tr [class.has-children]="hasChildren(node)"
    (dblclick)="hasChildren(node) && toggleExpand(node)">
  <td *ngIf="hasChildren(node)">
    <button (click)="toggleExpand(node)" class="chevron">
      <i [class.open]="isExpanded(node)">▶</i>
    </button>
  </td>
  <td>{{ node.name }}</td>
  ...
</tr>
```

**Changes**:
1. Add `[class.has-children]="hasChildren(node)"` for CSS targeting
2. Add `(dblclick)="hasChildren(node) && toggleExpand(node)"` event binding

---

### CategoryListComponent Stylesheet

**File**: `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.scss`

**Add** (if not already present):
```scss
tr {
  &.has-children {
    cursor: pointer;
    user-select: none;
  }
}
```

---

## Verification Checklist

- [ ] Template has `(dblclick)` binding on row element
- [ ] Class binding `[class.has-children]` is applied
- [ ] CSS cursor and user-select rules are in place
- [ ] Chevron click still works (single click)
- [ ] Double-click on row with children toggles expand/collapse
- [ ] Double-click on row without children does nothing (no error)
- [ ] Text selection is prevented on double-click
- [ ] Keyboard Tab + Enter on chevron still works
- [ ] No regression in expand/collapse state management
- [ ] All tests pass

---

## No Breaking Changes

**Backward Compatibility**:
- Existing chevron click behavior unchanged
- Keyboard navigation unchanged
- Category list display unchanged
- Pure addition of new gesture; no removal of features
