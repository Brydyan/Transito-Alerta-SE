# Specifications: Catalog Forms & Lists Navigation

**Domain**: `navigation`  
**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Scenarios**: 22 (12 Form operations + 8 List operations + 1 Template link + 1 Error non-regression)

---

## 1. Organizations Navigation (`/app/admin/organizaciones`)

### Scenario 1.1: Edit Organization → Save → Redirect to List
- **Given** user is editing organization `"org-uuid-1"` on route `/app/admin/organizaciones/org-uuid-1/edit`
- **When** user submits valid form modifications and the update succeeds
- **Then** router navigates to `/app/admin/organizaciones`
- **And** page does not route to `/app/admin/organizaciones/org-uuid-1` or 404 ErrorPage
- **And** success toast displays "Organización actualizada correctamente"

### Scenario 1.2: Create Organization → Save → Redirect to List
- **Given** user is creating an organization on route `/app/admin/organizaciones/new`
- **When** user submits valid form data and the creation succeeds
- **Then** router navigates to `/app/admin/organizaciones`
- **And** success toast displays "Organización creada correctamente"

### Scenario 1.3: Organization Form → Cancel → Return to List
- **Given** user is on route `/app/admin/organizaciones/new` or `/app/admin/organizaciones/org-uuid-1/edit`
- **When** user clicks "Cancelar" and confirms discarding if dirty
- **Then** router navigates to `/app/admin/organizaciones`

### Scenario 1.4: Organization List → Navigate to Create
- **Given** user is on the organizations list `/app/admin/organizaciones`
- **When** user clicks the "+ Nueva organización" button
- **Then** router navigates to `/app/admin/organizaciones/new`

### Scenario 1.5: Organization List → Navigate to Edit
- **Given** user is on the organizations list `/app/admin/organizaciones`
- **When** user clicks "Editar" on row for organization `"org-uuid-1"`
- **Then** router navigates to `['/app/admin/organizaciones', 'org-uuid-1', 'edit']`

---

## 2. Departments Navigation (`/app/admin/departamentos`)

### Scenario 2.1: Edit Department → Save → Redirect to List
- **Given** user is editing department `"dept-uuid-1"` on route `/app/admin/departamentos/dept-uuid-1/edit`
- **When** user submits valid form modifications and the update succeeds
- **Then** router navigates to `/app/admin/departamentos`
- **And** page does not route to `/app/admin/departamentos/dept-uuid-1` or 404 ErrorPage
- **And** success toast displays "Departamento actualizado correctamente"

### Scenario 2.2: Create Department → Save → Redirect to List
- **Given** user is creating a department on route `/app/admin/departamentos/new`
- **When** user submits valid form data and the creation succeeds
- **Then** router navigates to `/app/admin/departamentos`
- **And** success toast displays "Departamento creado correctamente"

### Scenario 2.3: Department Form → Cancel → Return to List
- **Given** user is on route `/app/admin/departamentos/new` or `/app/admin/departamentos/dept-uuid-1/edit`
- **When** user clicks "Cancelar" and confirms discarding if dirty
- **Then** router navigates to `/app/admin/departamentos`

### Scenario 2.4: Department List → Navigate to Create
- **Given** user is on the departments list `/app/admin/departamentos`
- **When** user clicks the "+ Nuevo departamento" button
- **Then** router navigates to `/app/admin/departamentos/new`

### Scenario 2.5: Department List → Navigate to Edit
- **Given** user is on the departments list `/app/admin/departamentos`
- **When** user clicks "Editar" on row for department `"dept-uuid-1"`
- **Then** router navigates to `['/app/admin/departamentos', 'dept-uuid-1', 'edit']`

---

## 3. Incident Categories Navigation (`/app/categorias`)

### Scenario 3.1: Edit Category → Save → Redirect to List
- **Given** user is editing category `"cat-uuid-1"` on route `/app/categorias/cat-uuid-1/edit`
- **When** user submits valid form modifications and the update succeeds
- **Then** router navigates to `/app/categorias`
- **And** success toast displays "Categoría actualizada exitosamente"

### Scenario 3.2: Create Category → Save → Redirect to List
- **Given** user is creating a category on route `/app/categorias/new`
- **When** user submits valid form data and the creation succeeds
- **Then** router navigates to `/app/categorias`
- **And** page is not redirected to `/app/dashboard`
- **And** success toast displays "Categoría creada exitosamente"

### Scenario 3.3: Category Form → Cancel → Return to List
- **Given** user is on route `/app/categorias/new` or `/app/categorias/cat-uuid-1/edit`
- **When** user clicks "Cancelar" and confirms discarding if dirty
- **Then** router navigates to `/app/categorias`
- **And** user is never redirected to `/app/dashboard`

### Scenario 3.4: Category List → Navigate to Create
- **Given** user is on the categories list `/app/categorias`
- **When** user clicks the "+ Nueva categoría" button
- **Then** router navigates to `/app/categorias/new`

### Scenario 3.5: Category List → Navigate to Edit
- **Given** user is on the categories list `/app/categorias`
- **When** user clicks "Editar" on row for category `"cat-uuid-1"`
- **Then** router navigates to `['/app/categorias', 'cat-uuid-1', 'edit']`

---

## 4. Locations Navigation (`/app/ubicaciones`)

### Scenario 4.1: Edit Location → Save → Redirect to List
- **Given** user is editing location `"loc-uuid-1"` on route `/app/ubicaciones/loc-uuid-1/edit`
- **When** user submits valid form modifications and the update succeeds
- **Then** router navigates to `/app/ubicaciones`
- **And** success toast displays "Ubicación actualizada correctamente"

### Scenario 4.2: Create Location → Save → Redirect to List
- **Given** user is creating a location on route `/app/ubicaciones/new`
- **When** user submits valid form data and the creation succeeds
- **Then** router navigates to `/app/ubicaciones`
- **And** page is not redirected to `/app/dashboard`
- **And** success toast displays "Ubicación creada correctamente"

### Scenario 4.3: Location Form → Cancel → Return to List
- **Given** user is on route `/app/ubicaciones/new` or `/app/ubicaciones/loc-uuid-1/edit`
- **When** user clicks "Cancelar" and confirms discarding if dirty
- **Then** router navigates to `/app/ubicaciones`
- **And** user is never redirected to `/app/dashboard`

### Scenario 4.4: Location List → Navigate to Create
- **Given** user is on the locations list `/app/ubicaciones`
- **When** user clicks the "+ Nueva ubicación" button
- **Then** router navigates to `/app/ubicaciones/new`

### Scenario 4.5: Location List → Navigate to Edit
- **Given** user is on the locations list `/app/ubicaciones`
- **When** user clicks "Editar" on row for location `"loc-uuid-1"`
- **Then** router navigates to `['/app/ubicaciones', 'loc-uuid-1', 'edit']`

---

## 5. Users List Template Link

### Scenario 5.1: Organizations Card Link
- **Given** user is on `/app/admin/users`
- **When** user inspects or clicks the "Ver organizaciones..." card link
- **Then** the link target is `['/app/admin/organizaciones']`
- **And** the link does not route to `/app/organizaciones` (which causes 404 ErrorPage)

---

## 6. Non-Regression: Save Error (Backend Failure)

### Scenario 6.1: Submission Failure Keeps Form State
- **Given** user is on any of the 4 form routes (`/app/admin/organizaciones/:id/edit`, etc.)
- **When** server returns 422 Unprocessable Entity or 500 Internal Server Error upon save
- **Then** user remains on the current form route
- **And** server validation errors or error toast are displayed
- **And** no router navigation occurs
