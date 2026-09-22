# Tasks: Double-Click Expand/Collapse for Catalog Tree Lists

**Change**: `2026-09-22-sc-tree-list-double-click-expand-catalog`  
**Components**: CategoryListComponent, LocationListComponent  
**Total Effort**: ~1 hour (15 min implementation per component + 30 min testing)  
**Phase**: Single (UI Enhancement)

---

## Phase 1: Implementation (30 min)

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

### 1.2 Update CategoryListComponent CSS

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

**Acceptance**: CSS is syntactically valid; selector targets rows with children.

---

### 1.3 Update LocationListComponent Template

- [ ] Open `frontend/src/app/features/catalogs/locations/location-list/location-list.component.html`
- [ ] Locate the main `<tr *ngFor="let node of visibleNodes()">` element (or equivalent loop)
- [ ] Add same two attributes as CategoryListComponent:
  - `[class.has-children]="hasChildren(node)"`
  - `(dblclick)="hasChildren(node) && toggleExpand(node)"`
- [ ] Save file

**Acceptance**: Template renders with both attributes; no syntax errors.

---

### 1.4 Update LocationListComponent CSS

- [ ] Open `frontend/src/app/features/catalogs/locations/location-list/location-list.component.scss`
- [ ] Add identical styling:
  ```scss
  tr {
    &.has-children {
      cursor: pointer;
      user-select: none;
    }
  }
  ```
- [ ] Save file

**Acceptance**: CSS is syntactically valid; selector targets rows with children.

---

### 1.5 Verify No Component Code Changes

- [ ] Confirm `toggleExpand()` method exists in both components and is unchanged
- [ ] Confirm `hasChildren()` method exists in both components and is unchanged
- [ ] Confirm `expandedIds` signal exists in both components and is unchanged
- [ ] No logic changes needed; reusing existing code

**Acceptance**: Component logic is untouched in both components.

---

### 1.6 Run Linting

- [ ] Run: `cd frontend && npm run lint`
- [ ] Verify no new linting errors in updated files

**Acceptance**: `npm run lint` exits with code 0 (no errors).

---

### 1.7 Run TypeCheck

- [ ] Run: `npm run typecheck`
- [ ] Verify no type errors

**Acceptance**: TypeCheck passes.

---

## Phase 2: Testing (30 min)

### 2.1 Unit Test: CategoryListComponent — Template Binding

- [ ] Open `category-list.component.spec.ts`
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

### 2.2 Unit Test: CategoryListComponent — Double-Click Handler

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

### 2.3 Unit Test: LocationListComponent — Template Binding

- [ ] Open `location-list.component.spec.ts`
- [ ] Add test: "Row with children has 'has-children' class" (same pattern as CategoryListComponent)
- [ ] Add test: "Row without children does NOT have 'has-children' class" (same pattern)
- [ ] Run: `npm test -- location-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.4 Unit Test: LocationListComponent — Double-Click Handler

- [ ] Add test: "Double-click on row with children calls toggleExpand"
- [ ] Add test: "Double-click on row without children does NOT call toggleExpand"
- [ ] Run: `npm test -- location-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.5 E2E Test: CategoryListComponent — Double-Click Expand

- [ ] Open or create E2E test file: `frontend/e2e/category-list.e2e.ts`
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

### 2.6 E2E Test: CategoryListComponent — Double-Click Collapse

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

### 2.7 E2E Test: LocationListComponent — Double-Click Expand

- [ ] Open or create E2E test file: `frontend/e2e/location-list.e2e.ts`
- [ ] Add test: "Admin double-clicks on collapsed location → expands"
  - Navigate to `/app/ubicaciones`
  - Find row for location with children
  - Assert location is collapsed
  - Double-click on row
  - Wait for animation
  - Assert location is expanded
  - Assert child zones are visible
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.8 E2E Test: LocationListComponent — Double-Click Collapse

- [ ] Add test: "Admin double-clicks on expanded location → collapses"
  - Navigate to `/app/ubicaciones`
  - Find row for expanded location
  - Double-click on row
  - Wait for animation
  - Assert location is collapsed
  - Assert child zones are hidden
- [ ] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.9 E2E Test: Chevron Click Still Works (Both Components)

- [ ] Add test: "Single-click on chevron button still works — Category"
  - Navigate to `/app/categorias`
  - Find chevron button for collapsed category
  - Single-click on chevron (not row)
  - Assert category expands
  - Verify: only single click needed (not double)
- [ ] Add test: "Single-click on chevron button still works — Location"
  - Navigate to `/app/ubicaciones`
  - Find chevron button for collapsed location
  - Single-click on chevron (not row)
  - Assert location expands
  - Verify: only single click needed (not double)
- [ ] Run: `npm run test:e2e`

**Acceptance**: Both tests pass; single-click behavior unchanged.

---

### 2.10 E2E Test: Double-Click on Leaf Rows (Both Components)

- [ ] Add test: "Double-click on leaf category does nothing"
  - Navigate to `/app/categorias`
  - Find leaf category row (no chevron)
  - Double-click on row
  - Assert no error in console
  - Assert row did not expand
- [ ] Add test: "Double-click on leaf location does nothing"
  - Navigate to `/app/ubicaciones`
  - Find leaf zone row (no chevron)
  - Double-click on row
  - Assert no error in console
  - Assert row did not expand
- [ ] Run: `npm run test:e2e`

**Acceptance**: Both tests pass; graceful handling.

---

### 2.11 Manual Test: Visual Inspection — Categories

- [ ] Start dev server: `docker compose up -d` (if needed)
- [ ] Navigate to `http://localhost:8083/app/categorias`
- [ ] **Test 1**: 
  - Double-click on collapsed category (e.g., "Agua")
  - Verify: Row expands; chevron rotates; children visible
- [ ] **Test 2**:
  - Double-click on expanded category again
  - Verify: Row collapses; chevron rotates back; children hidden
- [ ] **Test 3**:
  - Single-click on chevron of different category
  - Verify: Still works as before (single click on chevron only)
- [ ] **Test 4**:
  - Double-click on leaf category
  - Verify: Nothing happens; no error

**Acceptance**: All 4 manual tests pass.

---

### 2.12 Manual Test: Visual Inspection — Locations

- [ ] Navigate to `http://localhost:8083/app/ubicaciones`
- [ ] **Test 1**: 
  - Double-click on collapsed location
  - Verify: Row expands; chevron rotates; children visible
- [ ] **Test 2**:
  - Double-click on expanded location again
  - Verify: Row collapses; chevron rotates back; children hidden
- [ ] **Test 3**:
  - Single-click on chevron of different location
  - Verify: Still works as before
- [ ] **Test 4**:
  - Double-click on leaf location
  - Verify: Nothing happens; no error

**Acceptance**: All 4 manual tests pass.

---

### 2.13 Manual Test: Text Selection

- [ ] Navigate to category or location list
- [ ] Double-click on a row text (e.g., "Agua Potable")
- [ ] Verify: Text is NOT selected (no blue highlight)
- [ ] Verify: Category/location expands/collapses instead

**Acceptance**: Text not selected; expand happens cleanly.

---

### 2.14 Manual Test: Keyboard Navigation

- [ ] Navigate to category or location list
- [ ] Press Tab to focus on a chevron button
- [ ] Verify: Chevron has focus (visible outline)
- [ ] Press Enter
- [ ] Verify: Category/location expands/collapses
- [ ] Verify: Keyboard-only users can still use the feature

**Acceptance**: Keyboard navigation works.

---

### 2.15 Run Full Frontend Test Suite

- [ ] Run: `npm test`
- [ ] Verify no new failures
- [ ] Verify all existing tests still pass

**Acceptance**: Test suite exits with code 0.

---

### 2.16 Run Full E2E Test Suite

- [ ] Run: `npm run test:e2e`
- [ ] Verify no new failures
- [ ] Verify all existing tests still pass

**Acceptance**: E2E suite exits with code 0.

---

## Summary

**Total Tasks**: 16  
**Total Effort**: ~1 hour (30 min implementation + 30 min testing)  
**Risk**: Very Low (identical template line + CSS + no logic changes)  
**Rollback**: Single commit revert

**Delivery Gate**: All 8 specification scenarios must pass + full test suite green.

---
