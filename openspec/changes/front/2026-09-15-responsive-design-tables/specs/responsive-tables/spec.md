# Specification: Responsive Tables (Card View on Mobile)

**Change**: `2026-09-15-responsive-design-tables`  
**Capability**: Mobile-responsive table-to-card layout conversion  
**In Scope**: 5 data tables, infinite scroll, filter drawer, action dropdowns

---

## R1: Desktop Table Layout (≥1024px)

**Requirement**: On desktop (lg+), all tables display in standard table format (no change from current).

### S1.1 — Table renders as <table> on desktop

**Given** viewport width ≥ 1024px (lg breakpoint)  
**When** user views any table (incidents, users, roles, orgs, categories)  
**Then** table renders with columns, headers, pagination controls as today  
**And** no card layout is used

### S1.2 — Sticky header on desktop scroll

**Given** a desktop user scrolls table vertically  
**When** table rows scroll out of view  
**Then** column headers remain sticky (fixed position)  
**And** user always sees column names

---

## R2: Mobile Card Grid (<1024px)

**Requirement**: On mobile/tablet (<1024px), tables convert to responsive card grid.

### S2.1 — Table converts to card grid on mobile

**Given** viewport width < 1024px (sm/md breakpoints)  
**When** user views incidents, users, roles, orgs, or categories table  
**Then** table is hidden; card grid appears instead  
**And** cards display in 1-column layout on sm, 2-column on md

### S2.2 — Each card shows 3 fields

**Given** a card in mobile view  
**When** card is rendered  
**Then** card displays exactly 3 fields (header + 2 metadata rows):
  - **Incidents**: title | status | priority
  - **Users**: nombre | email | rol
  - **Roles**: nombre | permisos count | usuarios count
  - **Organizations**: nombre | zona | usuarios count
  - **Categories**: nombre | descripcion | icon

### S2.3 — Card includes "Ver detalle" button

**Given** a card in mobile view  
**When** user needs to view full record details  
**Then** "Ver detalle" button is always visible at bottom of card  
**And** clicking it opens detail modal/page with all fields

### S2.4 — Card includes action dropdown (⋮)

**Given** a card in mobile view  
**When** user clicks the three-dot menu (⋮) icon  
**Then** dropdown menu appears with options:
  - Edit
  - Delete
  - (table-specific: claim, release, close, permissions, assign-category, etc.)  
**And** menu is touch-friendly (large tap targets ≥44x44px)

### S2.5 — Card spacing and padding mobile-optimized

**Given** sm viewport (640px) with multiple cards  
**When** cards are rendered in grid  
**Then** padding is reduced (0.5rem gaps, 1rem card padding)  
**And** no excessive whitespace; content takes precedence

---

## R3: Pagination & Data Loading (Infinite Scroll)

**Requirement**: Mobile uses infinite scroll with manual "Load more" button (not auto-load).

### S3.1 — Desktop pagination unchanged

**Given** a desktop table (lg+)  
**When** user views pagination controls  
**Then** pagination works as today (page 1, 2, 3, ... navigation)

### S3.2 — Mobile infinite scroll with button

**Given** mobile user (sm/md) at bottom of card grid  
**When** all visible cards are rendered  
**Then** "Ver más datos" button appears at bottom  
**And** clicking it loads next page of data  
**And** new cards are appended (not replaced)

### S3.3 — Loading state visible during fetch

**Given** user clicks "Ver más datos"  
**When** API request is in flight  
**Then** button shows loading spinner or "Cargando..." state  
**And** button is disabled (cannot click twice)

### S3.4 — No auto-scroll load (user control)

**Given** mobile user scrolls to bottom  
**When** scroll reach is detected  
**Then** "Ver más datos" button is shown  
**And** data is NOT auto-loaded without user action

### S3.5 — End-of-data state

**Given** all data has been loaded (no more pages)  
**When** user is at bottom of card grid  
**Then** "Ver más datos" button is hidden or disabled  
**And** message "No hay más datos" appears (optional)

---

## R4: Filter Drawer (Mobile Collapsible)

**Requirement**: Filters are hidden in drawer on mobile; always visible on desktop.

### S4.1 — Desktop filters visible

**Given** desktop user (lg+) viewing any table  
**When** page loads  
**Then** filter panel (search, dropdowns, date pickers) is visible  
**And** filters remain visible during scroll

### S4.2 — Mobile filters in drawer

**Given** mobile user (sm/md) viewing any table  
**When** page loads  
**Then** filter panel is hidden (collapsed)  
**And** "Filtros" button is visible at top of table/grid

### S4.3 — Open/close drawer

**Given** mobile user clicks "Filtros" button  
**When** button is tapped  
**Then** filter drawer slides in from left or bottom (scoped)  
**And** drawer overlays card grid (z-index managed)

### S4.4 — Filter changes apply immediately

**Given** mobile user in filter drawer  
**When** user changes a filter (e.g., status dropdown, search input)  
**Then** table/grid updates immediately (no "Apply" button)  
**And** drawer stays open (user can close manually or continue filtering)

### S4.5 — Close drawer

**Given** filter drawer is open  
**When** user clicks outside drawer, presses Esc, or taps close button  
**Then** drawer slides out  
**And** card grid is fully visible again

---

## R5: Sticky Header & Context Preservation

**Requirement**: Maintain layout context during scroll (no jarring jumps).

### S5.1 — No layout shift on load

**Given** cards are loading data  
**When** new content appends to grid  
**Then** previously visible cards don't shift position  
**And** scroll position is stable

### S5.2 — Sort/filter state persists

**Given** mobile user filters table (e.g., status=pending)  
**When** user navigates away and back  
**Then** filter state is preserved (localStorage or route query params)  
**And** same filtered view loads (no reset to all data)

### S5.3 — Scroll position restored

**Given** mobile user scrolls to card #15 in grid  
**When** user clicks "Ver detalle" → modal → back  
**Then** scroll position returns to card #15 area (approximate)

---

## R6: Action Dropdown (Kebab Menu ⋮)

**Requirement**: Three-dot dropdown contains all edit/delete/more actions.

### S6.1 — Dropdown positioned correctly

**Given** card with action dropdown on mobile  
**When** user clicks ⋮ icon  
**Then** dropdown menu opens without truncating off-screen  
**And** menu is repositioned if near viewport edge

### S6.2 — Touch-friendly menu items

**Given** action dropdown is open on mobile  
**When** user taps a menu item (Edit, Delete, etc.)  
**Then** menu item is at least 44x44px (touch target size)  
**And** tap registers reliably (no hover-state bloat)

### S6.3 — Delete confirmation on mobile

**Given** user taps "Delete" in dropdown  
**When** delete action is triggered  
**Then** confirmation modal appears (same as desktop)  
**And** user can cancel or confirm delete

### S6.4 — Dropdown closes after action

**Given** user selects an action from dropdown  
**When** action completes (or modal opens)  
**Then** dropdown automatically closes  
**And** card grid is visible again

---

## R7: Responsive Breakpoints

**Requirement**: Use Tailwind standard breakpoints for consistency.

### S7.1 — Breakpoint definitions

**Given** Tailwind CSS is configured  
**When** breakpoints are applied  
**Then** layout follows these widths:
  - **sm**: 640px (phones)
  - **md**: 768px (tablets)
  - **lg**: 1024px (desktops) — TABLE mode starts here
  - **xl**: 1280px
  - **2xl**: 1536px
**And** no custom breakpoints are added

### S7.2 — Responsive text sizing

**Given** card text on sm viewport  
**When** card is rendered  
**Then** font sizes are reduced appropriately:
  - Title: 1rem (not 1.25rem)
  - Metadata: 0.875rem (not 1rem)
**And** text remains readable (no smaller than 14px)

### S7.3 — Responsive spacing

**Given** card grid on different viewports  
**When** cards are rendered  
**Then** gap/padding scales:
  - sm: 0.5rem gap, 1rem card padding
  - md: 1rem gap, 1.25rem card padding
  - lg+: 1.5rem gap, 1.5rem card padding

---

## R8: Accessibility (Mobile)

**Requirement**: Cards are accessible on touch devices.

### S8.1 — Focus indicators visible on mobile

**Given** mobile user navigates card grid with keyboard/screen reader  
**When** card or button receives focus  
**Then** focus ring is visible (not just hover state)  
**And** focus ring color has contrast ≥ 3:1

### S8.2 — Touch target size

**Given** buttons on cards (detail, delete, dropdown)  
**When** user taps on mobile  
**Then** all touch targets are ≥ 44x44px (WCAG 2.5.5)

### S8.3 — Screen reader announced card content

**Given** screen reader user opens table on mobile  
**When** card is announced  
**Then** reader says: "Card: [title], [field1]: [value1], [field2]: [value2], Actions: [button count]"

### S8.4 — No hover-only content

**Given** cards on mobile  
**When** card is rendered  
**Then** no critical content is hidden behind `:hover` pseudo-class  
**And** all actions are visible or accessible via tap

---

## R9: All 5 Tables Responsive

**Requirement**: Each table has unique 3-field card layout.

### S9.1 — Incidents cards mobile

**Given** incidents table on mobile (<1024px)  
**When** cards are rendered  
**Then** each card shows: `title | status badge | priority badge`  
**And** "Ver detalle" + ⋮ menu included

### S9.2 — Users cards mobile

**Given** users table on mobile  
**When** cards are rendered  
**Then** each card shows: `nombre | email | rol`  
**And** detail + ⋮ (edit, delete, permissions) included

### S9.3 — Roles cards mobile

**Given** roles table on mobile  
**When** cards are rendered  
**Then** each card shows: `nombre | [N] permisos | [N] usuarios`  
**And** detail + ⋮ (edit, delete) included

### S9.4 — Organizations cards mobile

**Given** organizations table on mobile  
**When** cards are rendered  
**Then** each card shows: `nombre | geo-zone name | [N] usuarios`  
**And** detail + ⋮ (edit, delete, assign-category) included

### S9.5 — Categories cards mobile

**Given** incident-categories table on mobile  
**When** cards are rendered  
**Then** each card shows: `nombre | descripcion (truncated) | icon`  
**And** detail + ⋮ (edit, delete) included

---

## R10: Progressive Enhancement

**Requirement**: Works without JavaScript; graceful fallback to desktop table.

### S10.1 — Table renders without JS

**Given** JavaScript is disabled  
**When** page loads on desktop  
**Then** table renders in HTML (no card layout attempted)  
**And** pagination works via form submission

### S10.2 — Mobile fallback

**Given** JS is disabled on mobile  
**When** page loads  
**Then** table still renders (not ideal, but functional)  
**And** user can scroll horizontally to see all columns (overflow-x)
