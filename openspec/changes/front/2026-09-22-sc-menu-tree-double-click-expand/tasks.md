# Tasks: Double-Click Expand/Collapse for Menu Tree

**Change**: `2026-09-22-sc-menu-tree-double-click-expand`  
**Component**: MenuTreeComponent  
**Total Effort**: ~20 minutes (5 min implementation + 15 min testing)  
**Phase**: Single (UI Enhancement)

---

## Phase 1: Implementation (5 min)

### 1.1 Locate MenuTreeComponent

- [ ] Find the MenuTreeComponent file (likely in `frontend/src/app/shared/components/` or `frontend/src/app/features/admin/`)
- [ ] Note: This SDD assumes component exists. If it does not, update openspec/config.yaml and reassess scope
- [ ] Record exact file path: `frontend/src/app/.../<component-path>/menu-tree.component.ts`

**Acceptance**: File path confirmed and component analyzed.

---

### 1.2 Update MenuTreeComponent Template

- [ ] Open `menu-tree.component.html`
- [ ] Locate the menu item row/element (likely a `<div>`, `<li>`, or similar)
- [ ] Add two attributes:
  - `[class.has-children]="hasChildren(id)"`
  - `(dblclick)="hasChildren(id) && toggleExpand(id)"`
- [ ] Example (if using divs):
  ```html
  <div [class.has-children]="hasChildren(id)"
       (dblclick)="hasChildren(id) && toggleExpand(id)">
    <!-- menu item content -->
  </div>
  ```
- [ ] Save file

**Acceptance**: Template renders with both attributes; no syntax errors.

---

### 1.3 Add CSS Styling

- [ ] Open `menu-tree.component.scss`
- [ ] Add styling for menu items with children (selector depends on actual structure):
  ```scss
  // If using .menu-item class:
  .menu-item {
    &.has-children {
      cursor: pointer;
      user-select: none;
    }
  }
  
  // Or if using li elements:
  li {
    &.has-children {
      cursor: pointer;
      user-select: none;
    }
  }
  ```
- [ ] Use the selector that matches your template structure
- [ ] Save file

**Acceptance**: CSS is syntactically valid; selector targets correct elements.

---

### 1.4 Verify No Component Code Changes

- [ ] Confirm `toggleExpand(id)` method exists and is unchanged
- [ ] Confirm `hasChildren(id)` method exists and is unchanged
- [ ] Confirm `expandedNodes` signal exists and uses `Record<string, boolean>` pattern
- [ ] No logic changes needed; reusing existing code

**Acceptance**: Component logic is untouched.

---

### 1.5 Run Linting

- [ ] Run: `cd frontend && npm run lint`
- [ ] Verify no new linting errors

**Acceptance**: `npm run lint` exits with code 0 (no errors).

---

### 1.6 Run TypeCheck

- [ ] Run: `npm run typecheck`
- [ ] Verify no type errors

**Acceptance**: TypeCheck passes.

---

## Phase 2: Testing (15 min)

### 2.1 Unit Test: Template Binding

- [ ] Open `menu-tree.component.spec.ts`
- [ ] Add test: "Menu item with children has 'has-children' class"
  - Arrange: Render component with menu items that have children
  - Act: Query menu item element for item with children
  - Assert: Element has CSS class `has-children`
- [ ] Add test: "Menu item without children does NOT have 'has-children' class"
  - Arrange: Render component with leaf menu items
  - Act: Query menu item element for leaf item
  - Assert: Element does NOT have class `has-children`
- [ ] Run: `npm test -- menu-tree.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.2 Unit Test: Double-Click Handler

- [ ] Add test: "Double-click on menu item with children calls toggleExpand"
  - Arrange: Render component; spy on `toggleExpand()` method
  - Act: Trigger `(dblclick)` event on menu item with children
  - Assert: `toggleExpand()` was called with correct ID
- [ ] Add test: "Double-click on menu item without children does NOT call toggleExpand"
  - Arrange: Render component; spy on `toggleExpand()` method
  - Act: Trigger `(dblclick)` event on leaf menu item
  - Assert: `toggleExpand()` was NOT called
- [ ] Run: `npm test -- menu-tree.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.3 E2E Test: Double-Click Expand

- [ ] Open or create E2E test file: `frontend/e2e/menu-tree.e2e.ts` (or add to existing admin.e2e.ts)
- [ ] Add test: "Admin double-clicks on collapsed menu item → expands"
  - Navigate to `/app/admin/controles`
  - Find menu item with children (e.g., "Usuarios" or similar)
  - Assert menu item is collapsed (chevron points right)
  - Double-click on menu item row
  - Wait for animation
  - Assert menu item is expanded (chevron points down)
  - Assert child menu items are visible
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.4 E2E Test: Double-Click Collapse

- [ ] Add test: "Admin double-clicks on expanded menu item → collapses"
  - Navigate to `/app/admin/controles`
  - Find expanded menu item
  - Double-click on menu item row
  - Wait for animation
  - Assert menu item is collapsed
  - Assert child menu items are hidden
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.5 E2E Test: Single-Click Chevron Still Works

- [ ] Add test: "Single-click on chevron button still works"
  - Navigate to `/app/admin/controles`
  - Find chevron button for collapsed menu item
  - Single-click on chevron (not row)
  - Assert menu item expands
  - Verify: only single click needed (not double)
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes; single-click behavior unchanged.

---

### 2.6 E2E Test: Double-Click on Leaf Menu Item

- [ ] Add test: "Double-click on leaf menu item does nothing"
  - Navigate to `/app/admin/controles`
  - Find leaf menu item row (no chevron)
  - Double-click on row
  - Assert no error in console
  - Assert row did not expand (no chevron to toggle)
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes; graceful handling.

---

### 2.7 Manual Test: Visual Inspection

- [ ] Start dev server: `docker compose up -d` (if needed)
- [ ] Navigate to `http://localhost:8083/app/admin/controles`
- [ ] **Test 1**: 
  - Double-click on collapsed menu item
  - Verify: Row expands; chevron rotates; children visible
- [ ] **Test 2**:
  - Double-click on expanded menu item again
  - Verify: Row collapses; chevron rotates back; children hidden
- [ ] **Test 3**:
  - Single-click on chevron of different menu item
  - Verify: Still works as before (single click on chevron only)
- [ ] **Test 4**:
  - Double-click on leaf menu item
  - Verify: Nothing happens; no error

**Acceptance**: All 4 manual tests pass.

---

### 2.8 Manual Test: Text Selection

- [ ] Navigate to admin control panel menu tree
- [ ] Double-click on a menu item text
- [ ] Verify: Text is NOT selected (no blue highlight)
- [ ] Verify: Menu item expands/collapses instead

**Acceptance**: Text not selected; expand happens cleanly.

---

### 2.9 Manual Test: Keyboard Navigation

- [ ] Navigate to admin control panel menu tree
- [ ] Press Tab to focus on a chevron button
- [ ] Verify: Chevron has focus (visible outline)
- [ ] Press Enter
- [ ] Verify: Menu item expands/collapses
- [ ] Verify: Keyboard-only users can still use the feature

**Acceptance**: Keyboard navigation works.

---

### 2.10 Run Full Frontend Test Suite

- [ ] Run: `npm test`
- [ ] Verify no new failures
- [ ] Verify all existing tests still pass

**Acceptance**: Test suite exits with code 0.

---

### 2.11 Run Full E2E Test Suite

- [ ] Run: `npm run test:e2e`
- [ ] Verify no new failures
- [ ] Verify all existing tests still pass

**Acceptance**: E2E suite exits with code 0.

---

## Summary

**Total Tasks**: 11  
**Total Effort**: ~20 minutes (5 min implementation + 15 min testing)  
**Risk**: Very Low (single template line + CSS + no logic changes)  
**Rollback**: Single commit revert

**Delivery Gate**: All 6 specification scenarios must pass + full test suite green.

---

## Implementation Notes

**Prerequisites**:
- MenuTreeComponent location and structure must be confirmed before starting implementation
- If component structure differs significantly (e.g., uses custom elements or web components), adapt template selector and CSS accordingly
- Design.md D2 may need clarification if menu items use a different method to determine child count

**Post-Implementation**:
- If MenuTreeComponent is used in multiple routes beyond `/app/admin/controles`, consider testing other locations
- Verify that the `expandedNodes` state is properly persisted and restored per component behavior

---
