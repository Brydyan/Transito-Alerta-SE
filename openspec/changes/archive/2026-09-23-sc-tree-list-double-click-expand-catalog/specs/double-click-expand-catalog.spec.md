# Specifications: Double-Click Expand/Collapse for Catalog Tree Lists

**Feature**: Expand/collapse categories and locations by double-clicking on row  
**Scenarios**: 8 (primary + edge cases)  
**Components**: CategoryListComponent, LocationListComponent

---

## Scenario 1: Double-Click on Category Row with Children → Expand

**Given** Admin is viewing category list (`/app/categorias`)  
**And** Category "Agua" has sub-categories (children)  
**And** Category is currently collapsed (chevron points right ▶)

**When** Admin double-clicks anywhere on the "Agua" row (not just the chevron)

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

## Scenario 3: Double-Click on Location Row with Children → Expand

**Given** Admin is viewing location list (`/app/ubicaciones`)  
**And** Location has sub-zones (children)  
**And** Location is currently collapsed (chevron points right ▶)

**When** Admin double-clicks anywhere on the location row

**Then** Location expands  
**And** Chevron rotates to point down ▼  
**And** Child zones become visible below the parent

**Acceptance**: Expansion occurs; chevron updates; children render.

---

## Scenario 4: Double-Click on Expanded Location → Collapse

**Given** Admin is viewing location list  
**And** Location is currently expanded (chevron points down ▼)  
**And** Child zones are visible

**When** Admin double-clicks anywhere on the location row

**Then** Location collapses  
**And** Chevron rotates to point right ▶  
**And** Child zones are hidden

**Acceptance**: Collapse occurs; chevron updates; children are hidden.

---

## Scenario 5: Double-Click on Leaf Category → No Effect

**Given** Admin is viewing category list  
**And** Category "Suelo (Erosión)" is a leaf (no children)  
**And** No chevron is visible for this category

**When** Admin double-clicks on the leaf category row

**Then** Nothing happens  
**And** No error is thrown  
**And** No console warnings

**Acceptance**: No-op; graceful handling.

---

## Scenario 6: Double-Click on Leaf Location → No Effect

**Given** Admin is viewing location list  
**And** A location zone is a leaf (no children)  
**And** No chevron is visible

**When** Admin double-clicks on the leaf zone row

**Then** Nothing happens  
**And** No error is thrown  
**And** No console warnings

**Acceptance**: No-op; graceful handling.

---

## Scenario 7: Chevron Click Still Works

**Given** Admin is viewing category list or location list  
**And** A row with children is collapsed

**When** Admin clicks the chevron icon (single click, not double)

**Then** Row expands  
**And** Behavior is identical to before the change

**Acceptance**: Single-click on chevron still works; unchanged behavior.

---

## Scenario 8: Double-Click Does Not Select Text

**Given** Admin is viewing category list or location list  
**And** Row text is visible

**When** Admin double-clicks on the row

**Then** Text is NOT selected (no blue highlight)  
**And** Only expand/collapse occurs

**Acceptance**: Text remains unselected; no selection artifacts.

---

## Non-Regression: Expand State Persistence

**Scenario**: Expand/collapse state is persisted in `expandedIds` signal

**Given** Admin expands a category/location via double-click

**When** Admin navigates away and back to the list

**Then** Expand state follows current component behavior  
**Note**: State persistence is unchanged by this feature.

---

## Non-Regression: Search & Filter Still Work

**Scenario**: Double-click works with filtered/searched results

**Given** Admin searches or filters the list  
**And** Results show only matching items

**When** Admin double-clicks on a result row with children

**Then** Item expands  
**And** Filter/search state is unaffected

**Acceptance**: Double-click works alongside existing features.

---

## Non-Regression: Keyboard Navigation Still Works

**Scenario**: Keyboard users can expand/collapse via chevron button

**Given** Admin is viewing category list or location list

**When** Admin uses Tab key to focus the chevron button  
**And** Presses Enter key

**Then** Row expands/collapses  
**And** No double-click required  
**And** Fully keyboard accessible

**Acceptance**: Keyboard users unaffected; alternative path preserved.

---
