# Tasks: Double-Click Expand/Collapse for Catalog Tree Lists

**Change**: `2026-09-22-sc-tree-list-double-click-expand-catalog`  
**Components**: CategoryListComponent, LocationListComponent  
**Total Effort**: ~1 hour (15 min implementation per component + 30 min testing)  
**Phase**: Single (UI Enhancement)

---

## Phase 1: Implementation (30 min)

### 1.1 Update CategoryListComponent Template

- [x] Open `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.html`
- [x] Locate the main `<tr *ngFor="let node of visibleNodes()">` element
- [x] Add two attributes:
  - `[class.has-children]="hasChildren(node)"`
  - `(dblclick)="hasChildren(node) && toggleExpand(node)"`
- [x] Example:
  ```html
  <tr [class.has-children]="hasChildren(node)"
      (dblclick)="hasChildren(node) && toggleExpand(node)">
  ```
- [x] Save file

**Acceptance**: Template renders with both attributes; no syntax errors.

---

### 1.2 Update CategoryListComponent CSS

- [x] Open `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.scss`
- [x] Add styling for rows with children:
  ```scss
  tr {
    &.has-children {
      cursor: pointer;
      user-select: none;
    }
  }
  ```
- [x] Save file

**Acceptance**: CSS is syntactically valid; selector targets rows with children.

---

### 1.3 Update LocationListComponent Template

- [x] Open `frontend/src/app/features/catalogs/locations/location-list/location-list.component.html`
- [x] Locate the main `<tr *ngFor="let node of visibleNodes()">` element (or equivalent loop)
- [x] Add same two attributes as CategoryListComponent:
  - `[class.has-children]="hasChildren(node)"`
  - `(dblclick)="hasChildren(node) && toggleExpand(node)"`
- [x] Save file

**Acceptance**: Template renders with both attributes; no syntax errors.

---

### 1.4 Update LocationListComponent CSS

- [x] Open `frontend/src/app/features/catalogs/locations/location-list/location-list.component.scss`
- [x] Add identical styling:
  ```scss
  tr {
    &.has-children {
      cursor: pointer;
      user-select: none;
    }
  }
  ```
- [x] Save file

**Acceptance**: CSS is syntactically valid; selector targets rows with children.

---

### 1.5 Verify No Component Code Changes

- [x] Confirm `toggleExpand()` method exists in both components and is unchanged
- [x] Confirm `hasChildren()` method exists in both components and is unchanged
- [x] Confirm `expandedIds` signal exists in both components and is unchanged
- [x] No logic changes needed; reusing existing code

**Acceptance**: Component logic is untouched in both components.

---

### 1.6 Run Linting

- [x] Run: `cd frontend && npm run lint`
- [x] Verify no new linting errors in updated files

**Acceptance**: `npm run lint` exits with code 0 (no errors).

---

### 1.7 Run TypeCheck

- [x] Run: `npm run typecheck`
- [x] Verify no type errors

**Acceptance**: TypeCheck passes.

---

## Phase 2: Testing (30 min)

### 2.1 Unit Test: CategoryListComponent — Template Binding

- [x] Open `category-list.component.spec.ts`
- [x] Add test: "Row with children has 'has-children' class"
  - Arrange: Render component with categories that have children
  - Act: Query row element for category with children
  - Assert: Element has CSS class `has-children`
- [x] Add test: "Row without children does NOT have 'has-children' class"
  - Arrange: Render component with leaf categories
  - Act: Query row element for leaf category
  - Assert: Element does NOT have class `has-children`
- [x] Run: `npm test -- category-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.2 Unit Test: CategoryListComponent — Double-Click Handler

- [x] Add test: "Double-click on row with children calls toggleExpand"
  - Arrange: Render component; spy on `toggleExpand()` method
  - Act: Trigger `(dblclick)` event on row with children
  - Assert: `toggleExpand()` was called with correct node
- [x] Add test: "Double-click on row without children does NOT call toggleExpand"
  - Arrange: Render component; spy on `toggleExpand()` method
  - Act: Trigger `(dblclick)` event on leaf row
  - Assert: `toggleExpand()` was NOT called
- [x] Run: `npm test -- category-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.3 Unit Test: LocationListComponent — Template Binding

- [x] Open `location-list.component.spec.ts`
- [x] Add test: "Row with children has 'has-children' class" (same pattern as CategoryListComponent)
- [x] Add test: "Row without children does NOT have 'has-children' class" (same pattern)
- [x] Run: `npm test -- location-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.4 Unit Test: LocationListComponent — Double-Click Handler

- [x] Add test: "Double-click on row with children calls toggleExpand"
- [x] Add test: "Double-click on row without children does NOT call toggleExpand"
- [x] Run: `npm test -- location-list.component.spec.ts`

**Acceptance**: Both tests pass.

---

### 2.5 E2E Test: CategoryListComponent — Double-Click Expand

- [x] Open or create E2E test file: `frontend/e2e/category-list.e2e.ts`
- [x] Add test: "Admin double-clicks on collapsed category → expands"
  - Navigate to `/app/categorias`
  - Find row for category with children (e.g., "Agua")
  - Assert category is collapsed (chevron points right)
  - Double-click on row
  - Wait for animation
  - Assert category is expanded (chevron points down)
  - Assert child categories are visible
- [x] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.6 E2E Test: CategoryListComponent — Double-Click Collapse

- [x] Add test: "Admin double-clicks on expanded category → collapses"
  - Navigate to `/app/categorias`
  - Find row for expanded category
  - Double-click on row
  - Wait for animation
  - Assert category is collapsed
  - Assert child categories are hidden
- [x] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.7 E2E Test: LocationListComponent — Double-Click Expand

- [x] Open or create E2E test file: `frontend/e2e/location-list.e2e.ts`
- [x] Add test: "Admin double-clicks on collapsed location → expands"
  - Navigate to `/app/ubicaciones`
  - Find row for location with children
  - Assert location is collapsed
  - Double-click on row
  - Wait for animation
  - Assert location is expanded
  - Assert child zones are visible
- [x] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.8 E2E Test: LocationListComponent — Double-Click Collapse

- [x] Add test: "Admin double-clicks on expanded location → collapses"
  - Navigate to `/app/ubicaciones`
  - Find row for expanded location
  - Double-click on row
  - Wait for animation
  - Assert location is collapsed
  - Assert child zones are hidden
- [x] Run: `npm run test:e2e`

**Acceptance**: Test passes.

---

### 2.9 E2E Test: Chevron Click Still Works (Both Components)

- [x] Add test: "Single-click on chevron button still works — Category"
  - Navigate to `/app/categorias`
  - Find chevron button for collapsed category
  - Single-click on chevron (not row)
  - Assert category expands
  - Verify: only single click needed (not double)
- [x] Add test: "Single-click on chevron button still works — Location"
  - Navigate to `/app/ubicaciones`
  - Find chevron button for collapsed location
  - Single-click on chevron (not row)
  - Assert location expands
  - Verify: only single click needed (not double)
- [x] Run: `npm run test:e2e`

**Acceptance**: Both tests pass; single-click behavior unchanged.

---

### 2.10 E2E Test: Double-Click on Leaf Rows (Both Components)

- [x] Add test: "Double-click on leaf category does nothing"
  - Navigate to `/app/categorias`
  - Find leaf category row (no chevron)
  - Double-click on row
  - Assert no error in console
  - Assert row did not expand
- [x] Add test: "Double-click on leaf location does nothing"
  - Navigate to `/app/ubicaciones`
  - Find leaf zone row (no chevron)
  - Double-click on row
  - Assert no error in console
  - Assert row did not expand
- [x] Run: `npm run test:e2e`

**Acceptance**: Both tests pass; graceful handling.

---

### 2.11 Manual Test: Visual Inspection — Categories

- [x] Start dev server: `docker compose up -d` (if needed)
- [x] Navigate to `http://localhost:8083/app/categorias`
- [x] **Test 1**: 
  - Double-click on collapsed category (e.g., "Agua")
  - Verify: Row expands; chevron rotates; children visible
- [x] **Test 2**:
  - Double-click on expanded category again
  - Verify: Row collapses; chevron rotates back; children hidden
- [x] **Test 3**:
  - Single-click on chevron of different category
  - Verify: Still works as before (single click on chevron only)
- [x] **Test 4**:
  - Double-click on leaf category
  - Verify: Nothing happens; no error

**Acceptance**: All 4 manual tests pass.

---

### 2.12 Manual Test: Visual Inspection — Locations

- [x] Navigate to `http://localhost:8083/app/ubicaciones`
- [x] **Test 1**: 
  - Double-click on collapsed location
  - Verify: Row expands; chevron rotates; children visible
- [x] **Test 2**:
  - Double-click on expanded location again
  - Verify: Row collapses; chevron rotates back; children hidden
- [x] **Test 3**:
  - Single-click on chevron of different location
  - Verify: Still works as before
- [x] **Test 4**:
  - Double-click on leaf location
  - Verify: Nothing happens; no error

**Acceptance**: All 4 manual tests pass.

---

### 2.13 Manual Test: Text Selection

- [x] Navigate to category or location list
- [x] Double-click on a row text (e.g., "Agua Potable")
- [x] Verify: Text is NOT selected (no blue highlight)
- [x] Verify: Category/location expands/collapses instead

**Acceptance**: Text not selected; expand happens cleanly.

---

### 2.14 Manual Test: Keyboard Navigation

- [x] Navigate to category or location list
- [x] Press Tab to focus on a chevron button
- [x] Verify: Chevron has focus (visible outline)
- [x] Press Enter
- [x] Verify: Category/location expands/collapses
- [x] Verify: Keyboard-only users can still use the feature

**Acceptance**: Keyboard navigation works.

---

### 2.15 Run Full Frontend Test Suite

- [x] Run: `npm test`
- [x] Verify no new failures
- [x] Verify all existing tests still pass

**Acceptance**: Test suite exits with code 0.

---

### 2.16 Run Full E2E Test Suite

- [x] Run: `npm run test:e2e`
- [x] Verify no new failures
- [x] Verify all existing tests still pass

**Acceptance**: E2E suite exits with code 0.

---

## Summary

**Total Tasks**: 16  
**Total Effort**: ~1 hour (30 min implementation + 30 min testing)  
**Risk**: Very Low (identical template line + CSS + no logic changes)  
**Rollback**: Single commit revert

**Delivery Gate**: All 8 specification scenarios must pass + full test suite green.

---
