# Specifications: Double-Click Expand/Collapse for Category List

**Feature**: Expand/collapse categories by double-clicking on row  
**Scenarios**: 6 (primary + edge cases)

---

## Scenario 1: Double-Click on Category with Children → Expand

**Given** Admin is viewing category list (`/app/categorias`)  
**And** Category "Agua" has sub-categories (children)  
**And** Category is currently collapsed (chevron points right ▶)

**When** Admin double-clicks anywhere on the "Agua" row

**Then** Category expands  
**And** Chevron rotates to point down ▼  
**And** Child categories become visible below the parent

**Acceptance**: Expansion occurs; chevron updates; children render.

---

## Scenario 2: Double-Click on Expanded Category → Collapse

**Given** Admin is viewing category list  
**And** Category "Agua" is currently expanded (chevron points down ▼)  
**And** Child categories are visible

**When** Admin double-clicks anywhere on the "Agua" row again

**Then** Category collapses  
**And** Chevron rotates to point right ▶  
**And** Child categories are hidden

**Acceptance**: Collapse occurs; chevron updates; children are hidden.

---

## Scenario 3: Double-Click on Leaf Category → No Effect

**Given** Admin is viewing category list  
**And** Category "Suelo (Erosión)" is a leaf (no children)  
**And** No chevron is visible for this category

**When** Admin double-clicks on the leaf category row

**Then** Nothing happens  
**And** No error is thrown  
**And** No console warnings

**Acceptance**: No-op; graceful handling.

---

## Scenario 4: Chevron Click Still Works

**Given** Admin is viewing category list  
**And** Category "Agua" is collapsed

**When** Admin clicks the chevron icon (single click, not double)

**Then** Category expands  
**And** Behavior is identical to before the change

**Acceptance**: Single-click on chevron still works.

---

## Scenario 5: Double-Click Does Not Select Text

**Given** Admin is viewing category list  
**And** Category row text is "Agua Potable (Daño)"

**When** Admin double-clicks on the row

**Then** Text is NOT selected (no blue highlight)  
**And** Only expand/collapse occurs

**Acceptance**: Text remains unselected; no selection artifacts.

---

## Scenario 6: Keyboard Navigation Still Works

**Given** Admin is viewing category list

**When** Admin uses Tab key to focus the chevron button  
**And** Presses Enter key

**Then** Category expands/collapses  
**And** No double-click required  
**And** Fully keyboard accessible

**Acceptance**: Keyboard users unaffected.

---

## Non-Regression: Expand State Persistence

**Scenario**: Expand/collapse state is persisted in `expandedIds` signal

**Given** Admin expands category "Agua" via double-click

**When** Admin navigates away and back to `/app/categorias`

**Then** Category remains expanded  
**Or** State is re-initialized based on component logic (per current behavior)

**Note**: State persistence follows existing expand/collapse behavior, unchanged by this feature.

---

## Non-Regression: Search & Filter Still Work

**Scenario**: Double-click works with filtered/searched categories

**Given** Admin searches for categories (search term "agua")  
**And** Results show only categories matching search

**When** Admin double-clicks on a result row with children

**Then** Category expands  
**And** Filter/search state is unaffected

**Acceptance**: Double-click works alongside existing features.

---

## Non-Regression: Mobile/Responsive

**Scenario**: Double-click does not interfere on touch devices

**Given** Admin uses tablet or touch device on category list

**When** Admin taps (not double-taps) on category

**Then** Single tap does not trigger expand (unchanged)  
**And** Double-tap behavior depends on browser default (not customized in this change)

**Note**: Touch handling is out of scope; desktop double-click only.
