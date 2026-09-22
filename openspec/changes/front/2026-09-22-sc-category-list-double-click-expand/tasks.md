# Tasks: Double-Click Expand/Collapse for Category List

**Change**: `2026-09-22-sc-category-list-double-click-expand`  
**Total Effort**: ~30 minutes  
**Phase**: Single (UI Enhancement)

---

## Phase 1: Implementation (15 min)

### 1.1 Update CategoryListComponent Template

- [ ] Open `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.html`
- [ ] Locate the main `<tr *ngFor="let node of visibleNodes()">` element
- [ ] Add two attributes:
  - `[class.has-children]="hasChildren(node)"`
  - `(dblclick)="hasChildren(node) && toggleExpand(node)"`
- [ ] Example:
  ```html
  <tr [class.has-children]="hasChildren(node)"
      (dblclick)="hasChildren(node) && toggleExpand(node)">
  ```
- [ ] Save file

**Acceptance**: Template renders with both attributes; no syntax errors.

---

### 1.2 Add CSS Styling

- [ ] Open `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.scss`
- [ ] Add styling for rows with children:
  ```scss
  tr {
    &.has-children {
      cursor: pointer;
      user-select: none;
    }
  }
  ```
- [ ] Save file

**Acceptance**: CSS is syntactically valid; selector targets the right elements.

---

### 1.3 Verify No Component Code Changes

- [ ] Confirm `toggleExpand()` method exists and is unchanged
- [ ] Confirm `hasChildren()` method exists and is unchanged
- [ ] Confirm `expandedIds` signal exists and is unchanged
- [ ] No logic changes needed; reusing existing code

**Acceptance**: Component logic is untouched.

---

### 1.4 Run Linting

- [ ] Run: `cd frontend && npm run lint -- category-list.component.ts category-list.component.html`
- [ ] Verify no new linting errors

**Acceptance**: `npm run lint` exits with code 0 (no errors).

---

### 1.5 Run TypeCheck

- [ ] Run: `npm run typecheck`
- [ ] Verify no type errors

**Acceptance**: TypeCheck passes.

---

## Phase 2: Testing (15 min)

### 2.1 Unit Test: Template Binding

- [ ] Open test file: `category-list.component.spec.ts`
- [ ] Add test: "Row with children has 'has-children' class"
  - Arrange: Render component with categories that have children
  - Act: Query row element for category with children
  - Assert: Element has CSS class `has-children`
- [ ] Add test: "Row without children does NOT have 'has-children' class"
  - Arrange: Render component with leaf categories
  - Act: Query row element for leaf category
  - Assert: Element does NOT have class `has-children`
- [ ] Run: `npm test -- category-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.2 Unit Test: Double-Click Handler

- [ ] Add test: "Double-click on row with children calls toggleExpand"
  - Arrange: Render component; spy on `toggleExpand()` method
  - Act: Trigger `(dblclick)` event on row with children
  - Assert: `toggleExpand()` was called with correct node
- [ ] Add test: "Double-click on row without children does NOT call toggleExpand"
  - Arrange: Render component; spy on `toggleExpand()` method
  - Act: Trigger `(dblclick)` event on leaf row
  - Assert: `toggleExpand()` was NOT called
- [ ] Run: `npm test -- category-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.3 E2E Test: Double-Click Expand

- [ ] Open E2E test file: `frontend/e2e/category-list.e2e.ts` (create if needed)
- [ ] Add test: "Admin double-clicks on collapsed category → expands"
  - Navigate to `/app/categorias`
  - Find row for category with children (e.g., "Agua")
  - Assert category is collapsed (chevron points right)
  - Double-click on row
  - Wait for animation
  - Assert category is expanded (chevron points down)
  - Assert child categories are visible
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.4 E2E Test: Double-Click Collapse

- [ ] Add test: "Admin double-clicks on expanded category → collapses"
  - Navigate to `/app/categorias`
  - Find row for expanded category
  - Double-click on row
  - Wait for animation
  - Assert category is collapsed
  - Assert child categories are hidden
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.5 E2E Test: Single-Click Chevron Still Works

- [ ] Add test: "Single-click on chevron button still works"
  - Navigate to `/app/categorias`
  - Find chevron button for collapsed category
  - Single-click on chevron (not row)
  - Assert category expands
  - Verify: only single click needed (not double)
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes; single-click behavior unchanged.

---

### 2.6 E2E Test: Double-Click on Leaf Category

- [ ] Add test: "Double-click on leaf category (no children) does nothing"
  - Navigate to `/app/categorias`
  - Find leaf category row (no chevron)
  - Double-click on row
  - Assert no error in console
  - Assert row did not expand (no chevron to toggle)
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes; graceful handling.

---

### 2.7 Manual Test: Visual Inspection

- [ ] Start dev server: `docker compose up -d`
- [ ] Navigate to `http://localhost:8083/app/categorias`
- [ ] **Test 1**: 
  - Double-click on "Agua" (collapsed)
  - Verify: Row expands; chevron rotates; children visible
- [ ] **Test 2**:
  - Double-click on "Agua" again
  - Verify: Row collapses; chevron rotates back; children hidden
- [ ] **Test 3**:
  - Single-click on chevron of different category
  - Verify: Still works as before (single click on chevron only)
- [ ] **Test 4**:
  - Double-click on leaf category
  - Verify: Nothing happens; no error

**Acceptance**: All 4 manual tests pass.

---

### 2.8 Manual Test: Text Selection

- [ ] Navigate to category list
- [ ] Double-click on a row text (e.g., "Agua Potable")
- [ ] Verify: Text is NOT selected (no blue highlight)
- [ ] Verify: Category expands/collapses instead

**Acceptance**: Text not selected; expand happens cleanly.

---

### 2.9 Manual Test: Keyboard Navigation

- [ ] Navigate to category list
- [ ] Press Tab to focus on a chevron button
- [ ] Verify: Chevron has focus (visible outline)
- [ ] Press Enter
- [ ] Verify: Category expands/collapses
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
**Total Effort**: ~30 minutes (15 min implementation + 15 min testing)  
**Risk**: Very Low (single template line + CSS + no logic changes)  
**Rollback**: Single commit revert

**Delivery Gate**: All 6 specification scenarios must pass + full test suite green.
