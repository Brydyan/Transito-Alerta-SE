# Specifications: Sub-Category Priority Assignment

**Feature**: Assign and use default priority for incident sub-categories  
**Scenarios**: 12 (form creation, editing, incident publication)

---

## Scenario 1: Create Root Category → No Priority Field

**Given** Admin is on category create form  
**And** Form has `parent_id` field empty (root category mode)

**When** Page renders

**Then** Priority radio button group is NOT visible  
**And** Form submit works without priority field

**Acceptance**: Radio group hidden; form accepts submission with no priority data.

---

## Scenario 2: Create Sub-Category → Priority Field Visible

**Given** Admin is on category create form  
**And** Selects a parent category (sets `parent_id`)

**When** Page re-renders after parent selection

**Then** Priority radio button group becomes visible  
**And** "Medio" (medium) is pre-selected by default  
**And** Four radio options are shown: "Bajo", "Medio", "Alto", "Crítica"

**Acceptance**: Field visible; default is "Medio"; all 4 options available.

---

## Scenario 3: Create Sub-Category with Default Priority

**Given** Admin creates new sub-category "Agua Potable (Daño)"  
**And** Selects parent "Agua"  
**And** Fills name, description  
**And** Priority is set to default "Medio" (no change)

**When** Admin clicks "Guardar"  
**And** Backend responds with 201 (created)

**Then** Category is saved with `priority = 'medium'`  
**And** Toast shows "Sub-categoría creada correctamente"  
**And** Database query confirms `priority = 'medium'` is persisted

**Acceptance**: Priority is "medium" in DB and API response.

---

## Scenario 4: Create Sub-Category with Custom Priority

**Given** Admin creates new sub-category "Derrumbe"  
**And** Selects parent "Suelo"  
**And** Fills name, description  
**And** Selects "Crítica" from priority radio buttons

**When** Admin clicks "Guardar"  
**And** Backend responds with 201 (created)

**Then** Category is saved with `priority = 'critical'`  
**And** Database query confirms `priority = 'critical'` is persisted

**Acceptance**: Priority is persisted as selected value.

---

## Scenario 5: Edit Sub-Category → Priority Pre-Filled

**Given** Admin is editing existing sub-category with `priority = 'high'`

**When** Edit form loads

**Then** Priority field shows "Alto" as selected  
**And** User can change it to another value

**Acceptance**: Current priority value is loaded and displayed.

---

## Scenario 6: Edit Sub-Category → Change Priority

**Given** Admin is editing sub-category with current `priority = 'low'`  
**And** Selects "Medio" instead

**When** Admin clicks "Guardar"  
**And** Backend responds with 200 (updated)

**Then** Category is updated with `priority = 'medium'`  
**And** Database query confirms new value is persisted

**Acceptance**: Priority change is saved.

---

## Scenario 7: API Response Includes Priority

**Given** Admin has created sub-category with `priority = 'high'`

**When** Frontend calls `GET /api/incident-categories`

**Then** Response includes field `priority: 'high'` for that category  
**And** Root categories have `priority: null` in response

**Acceptance**: API returns priority field; null for root categories.

---

## Scenario 8: Root Category Never Has Priority

**Given** Admin creates a root category (no parent)

**When** Checks API response

**Then** Response includes `priority: null`  
**And** Database column is NULL for that row

**Acceptance**: Root categories always have priority = null.

---

## Scenario 9: Incident Creation → Pre-Fill Priority from Category

**Given** Citizen is creating a new incident  
**And** Form loads with incident priority field set to default "Medio"

**When** Citizen selects sub-category "Agua Potable (Daño)" which has `priority = 'high'`

**Then** Incident priority field updates to "Alto" (pre-filled)  
**And** Citizen can still change it before saving

**Acceptance**: Priority is pre-filled; not locked.

---

## Scenario 10: Incident Priority Not Changed If Root Category

**Given** Citizen is creating incident  
**And** Incident priority is "Medio"

**When** Citizen selects a root category (has `priority = null`)

**Then** Incident priority remains unchanged at "Medio"

**Acceptance**: No change to incident priority if category priority is null.

---

## Scenario 11: Incident Priority Override

**Given** Citizen selects sub-category with `priority = 'critical'`  
**And** Incident priority pre-fills to "Crítica"

**When** Citizen manually changes incident priority to "Bajo"  
**And** Publishes incident

**Then** Incident is created with `priority = 'low'` (the override)  
**And** Category priority is NOT enforced

**Acceptance**: Citizen's selection overrides category default.

---

## Scenario 12: Incident Publication Without Category

**Given** Citizen publishes incident without selecting a category  
**And** Manually selects priority "Alto"

**When** Incident is submitted

**Then** Incident is created with `priority = 'high'`, `category_id = null`  
**And** No category priority inference occurs

**Acceptance**: System works as before when category not selected.

---

## Non-Regression: Category List View

**Scenario**: Verify category list is not affected by priority field

**Given** Admin views `/app/categorias` (category list)

**When** Page renders

**Then** Category list displays as before (no new columns or changes)  
**And** Priority is NOT shown in the list view (only in edit form)

**Note**: Priority is an edit-only field; list view unchanged.

---

## Non-Regression: Delete Sub-Category with Priority

**Scenario**: Soft delete still works

**Given** Admin soft-deletes a sub-category (has priority set)

**When** Delete operation completes

**Then** Category is soft-deleted (deleted_at is set)  
**And** Incidents with that category are NOT affected  
**And** Existing incidents keep their assigned priority (not changed)

**Acceptance**: Delete is independent of priority field.

---

## Non-Regression: Import/Seed Data

**Scenario**: Existing categories remain unaffected

**Given** Database has existing categories (from seed or import)

**When** Migration 0063 runs

**Then** Existing categories have `priority = null`  
**And** They can still be edited (priority field added to form)  
**And** New incidents can still use them (null priority is valid)

**Acceptance**: Backward compatible.
