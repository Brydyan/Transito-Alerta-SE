# Specifications: Double-Click Expand/Collapse for Menu Tree

**Feature**: Expand/collapse menu tree items by double-clicking on row  
**Scenarios**: 6 (primary + edge cases)  
**Component**: MenuTreeComponent (used in `/app/admin/controles` and other views)

---

## Scenario 1: Double-Click on Menu Item with Children → Expand

**Given** Admin is viewing menu options tree in admin control panel (`/app/admin/controles`)  
**And** Menu item has sub-menu items (children)  
**And** Menu item is currently collapsed (chevron points right ▶)

**When** Admin double-clicks anywhere on the menu item row (not just the chevron)

**Then** Menu item expands  
**And** Chevron rotates to point down ▼  
**And** Child menu items become visible below the parent

**Acceptance**: Expansion occurs; chevron updates; children render.

---

## Scenario 2: Double-Click on Expanded Menu Item → Collapse

**Given** Admin is viewing menu options tree  
**And** Menu item is currently expanded (chevron points down ▼)  
**And** Child menu items are visible

**When** Admin double-clicks anywhere on the menu item row again

**Then** Menu item collapses  
**And** Chevron rotates to point right ▶  
**And** Child menu items are hidden

**Acceptance**: Collapse occurs; chevron updates; children are hidden.

---

## Scenario 3: Double-Click on Leaf Menu Item → No Effect

**Given** Admin is viewing menu options tree  
**And** Menu item is a leaf (no children)  
**And** No chevron is visible for this item

**When** Admin double-clicks on the leaf menu item row

**Then** Nothing happens  
**And** No error is thrown  
**And** No console warnings

**Acceptance**: No-op; graceful handling.

---

## Scenario 4: Chevron Click Still Works

**Given** Admin is viewing menu options tree  
**And** Menu item is collapsed

**When** Admin clicks the chevron icon (single click, not double)

**Then** Menu item expands  
**And** Behavior is identical to before the change

**Acceptance**: Single-click on chevron still works.

---

## Scenario 5: Double-Click Does Not Select Text

**Given** Admin is viewing menu options tree  
**And** Menu item row text is visible

**When** Admin double-clicks on the row

**Then** Text is NOT selected (no blue highlight)  
**And** Only expand/collapse occurs

**Acceptance**: Text remains unselected; no selection artifacts.

---

## Scenario 6: Keyboard Navigation Still Works

**Given** Admin is viewing menu options tree

**When** Admin uses Tab key to focus the chevron button  
**And** Presses Enter key

**Then** Menu item expands/collapses  
**And** No double-click required  
**And** Fully keyboard accessible

**Acceptance**: Keyboard users unaffected.

---

## Non-Regression: Expand State Persistence

**Scenario**: Expand/collapse state is persisted in `expandedNodes` signal

**Given** Admin expands a menu item via double-click

**When** Admin navigates away and back to `/app/admin/controles`

**Then** Expand state follows current component behavior  
**Note**: State persistence is unchanged by this feature.

---

## Non-Regression: Menu Permissions Still Work

**Scenario**: Double-click works with permission-filtered menu items

**Given** Admin views menu options tree with some items filtered by role permissions  
**And** Results show only items the admin can manage

**When** Admin double-clicks on a result item with children

**Then** Menu item expands  
**And** Permission state is unaffected

**Acceptance**: Double-click works alongside existing permission features.

---
