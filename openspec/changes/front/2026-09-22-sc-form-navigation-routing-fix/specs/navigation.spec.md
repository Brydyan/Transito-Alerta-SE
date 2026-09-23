# Specifications: Form Navigation After Save

**Feature**: Correct form navigation after successful create/edit operations  
**Scenarios**: 8 (2 per catalog × 4 catalogs)

---

## Scenario 1: Create Category → Redirect to List

**Given** User is on route `/app/categorias/new`  
**And** Form is valid (name field populated)

**When** User clicks "Guardar" button  
**And** Backend responds with 201 (created)  

**Then** User is redirected to `/app/categorias`  
**And** Page displays the category list component  
**And** Toast shows "Categoría creada correctamente"

---

## Scenario 2: Edit Category → Redirect to List

**Given** User is on route `/app/categorias/[uuid]/edit`  
**And** Form contains existing category data  
**And** Form is modified (name field changed)

**When** User clicks "Guardar" button  
**And** Backend responds with 200 (updated)

**Then** User is redirected to `/app/categorias`  
**And** Page displays the category list component  
**And** Toast shows "Categoría actualizada correctamente"

---

## Scenario 3: Create Location → Redirect to List

**Given** User is on route `/app/ubicaciones/new`  
**And** Form is valid (name field populated)

**When** User clicks "Guardar" button  
**And** Backend responds with 201 (created)

**Then** User is redirected to `/app/ubicaciones`  
**And** Page displays the location list component  
**And** Toast shows "Ubicación creada correctamente"

---

## Scenario 4: Edit Location → Redirect to List

**Given** User is on route `/app/ubicaciones/[uuid]/edit`  
**And** Form is modified

**When** User clicks "Guardar" button  
**And** Backend responds with 200 (updated)

**Then** User is redirected to `/app/ubicaciones`  
**And** Page displays the location list component  
**And** Toast shows "Ubicación actualizada correctamente"

---

## Scenario 5: Create Department → Redirect to List

**Given** User is on route `/app/departamentos/new`  
**And** Form is valid (name field populated)

**When** User clicks "Guardar" button  
**And** Backend responds with 201 (created)

**Then** User is redirected to `/app/departamentos`  
**And** Page displays the department list component  
**And** Toast shows "Departamento creado correctamente"

---

## Scenario 6: Edit Department → Redirect to List

**Given** User is on route `/app/departamentos/[uuid]/edit`  
**And** Form is modified

**When** User clicks "Guardar" button  
**And** Backend responds with 200 (updated)

**Then** User is redirected to `/app/departamentos`  
**And** Page displays the department list component  
**And** Toast shows "Departamento actualizado correctamente"

---

## Scenario 7: Create Organization → Redirect to List

**Given** User is on route `/app/organizaciones/new`  
**And** Form is valid (name field populated)

**When** User clicks "Guardar" button  
**And** Backend responds with 201 (created)

**Then** User is redirected to `/app/organizaciones`  
**And** Page displays the organization list component  
**And** Toast shows "Organización creada correctamente"

---

## Scenario 8: Edit Organization → Redirect to List

**Given** User is on route `/app/organizaciones/[uuid]/edit`  
**And** Form is modified

**When** User clicks "Guardar" button  
**And** Backend responds with 200 (updated)

**Then** User is redirected to `/app/organizaciones`  
**And** Page displays the organization list component  
**And** Toast shows "Organización actualizada correctamente"

---

## Non-Regression: Cancel Button

**Scenario**: User navigates away via Cancel (not Save)

**Given** User is on any form route (`/app/[catalog]/new` or `/app/[catalog]/[id]/edit`)  
**And** Form is clean (no changes) OR user confirmed discard

**When** User clicks "Cancelar" button

**Then** User is redirected to the catalog list (`/app/[catalog]`)  
**And** No toast is shown (no save operation occurred)

**Note**: The `onCancel()` method also calls `goBack()`, so the fix covers this path too.

---

## Non-Regression: Save Error (Backend Failure)

**Scenario**: Save fails (backend error or network failure)

**Given** User is on any form route  
**And** Backend responds with 4xx or 5xx error

**When** Save completes with error

**Then** User remains on the form route  
**And** Toast shows error message  
**And** No redirect occurs

**Note**: Navigation only happens in the `next` callback of the service subscription, not in error cases. This is unchanged by the fix.
