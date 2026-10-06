# Design: Canonical Absolute Routing for Catalog Forms & Lists

**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Status**: DESIGN  
**Date**: 2026-10-06  
**Architect**: Gemini Architect / SDD Lead  

---

## 1. Architectural Context

In Angular applications, routing can be performed via **relative commands** (`{ relativeTo: this.route }`) or **absolute commands** (`['/app/...']`).
While relative navigation is syntactically concise, it introduces subtle, high-impact bugs when applied to CRUD trees structured with asymmetric route depths:

```text
/app
  ├── /admin
  │     ├── /organizaciones
  │     │     ├── (empty path)  -> OrganizationListComponent   [depth 3]
  │     │     ├── /new          -> OrganizationFormComponent   [depth 4: 'new']
  │     │     └── /:id/edit     -> OrganizationFormComponent   [depth 5: ':id' + 'edit']
  │     └── /departamentos
  │           ├── (empty path)  -> DepartmentListComponent     [depth 3]
  │           ├── /new          -> DepartmentFormComponent     [depth 4: 'new']
  │           └── /:id/edit     -> DepartmentFormComponent     [depth 5: ':id' + 'edit']
  │
  ├── /categorias
  │     ├── (empty path)        -> CategoryListComponent       [depth 2]
  │     ├── /new                -> CategoryFormComponent       [depth 3: 'new']
  │     └── /:id/edit           -> CategoryFormComponent       [depth 4: ':id' + 'edit']
  └── /ubicaciones
        ├── (empty path)        -> LocationListComponent       [depth 2]
        ├── /new                -> LocationFormComponent       [depth 3: 'new']
        └── /:id/edit           -> LocationFormComponent       [depth 4: ':id' + 'edit']
```

Notice the crucial asymmetry:
- `/new` adds **1 segment** (`new`) relative to the list route.
- `/:id/edit` adds **2 segments** (`:id` and `edit`) relative to the list route.

Consequently:
- Executing `navigate(['../'])` from `/:id/edit` strips only `edit` and leaves `/:id` (which does not exist, triggering 404 `ErrorPage`).
- Executing `navigate(['../../'])` from `/new` strips 2 levels instead of 1, escaping into `/app` and triggering redirect to `/app/dashboard`.

---

## 2. Architectural Decisions (D1 - D4)

### D1: Canonical Absolute Paths for Form Returns (`goBack()`)

**Decision**: All catalog form components (`OrganizationFormComponent`, `DepartmentFormComponent`, `CategoryFormComponent`, `LocationFormComponent`) will execute `goBack()` using explicit canonical absolute paths:
- `OrganizationFormComponent`: `this.router.navigate(['/app/admin/organizaciones'])`
- `DepartmentFormComponent`: `this.router.navigate(['/app/admin/departamentos'])`
- `CategoryFormComponent`: `this.router.navigate(['/app/categorias'])`
- `LocationFormComponent`: `this.router.navigate(['/app/ubicaciones'])`

**Why**:
1. **Segment Depth Independence**: The form's return destination is constant regardless of whether the user was creating (`/new`, 1 segment) or editing (`/:id/edit`, 2 segments).
2. **Zero Router-State Ambiguity**: Absolute navigation completely eliminates bugs arising from empty-path route snapshots, nested outlets, or trailing slashes.
3. **Consistency with Mature Modules**: Aligns with established conventions in `NewUserFormComponent` (`['/app/admin/users']`), `RoleEditorComponent` (`['/app/admin/roles']`), and `IncidentDetailComponent` (`['/app/incidencias']`).

**Alternative Rejected**: Keep relative navigation with segment arithmetic (`isEditing() ? navigate(['../..']) : navigate(['..'])`).
*Reason for Rejection*: Conditional relative jumping (`user-form` approach) is fragile, harder to read, and breaks if route structures change (e.g., if a subpath is added). Absolute paths are declarative and deterministic.

**Alternative Rejected**: Use browser history `window.history.back()` / `Location.back()`.
*Reason for Rejection*: Unreliable UX. If a user arrived at the edit page via a direct link, notification, or external tab, `back()` could navigate to an external site or a different workflow. Forms must return to their domain catalog list.

---

### D2: Canonical Absolute Paths for Catalog Lists Navigation

**Decision**: All catalog list components (`OrganizationListComponent`, `DepartmentListComponent`, `CategoryListComponent`, `LocationListComponent`) will navigate to create and edit views using canonical absolute paths:
- `OrganizationListComponent`:
  - `navigateToCreate()`: `this.router.navigate(['/app/admin/organizaciones/new'])`
  - `navigateToEdit(org)`: `this.router.navigate(['/app/admin/organizaciones', org.id, 'edit'])`
- `DepartmentListComponent`:
  - `navigateToCreate()`: `this.router.navigate(['/app/admin/departamentos/new'])`
  - `navigateToEdit(dept)`: `this.router.navigate(['/app/admin/departamentos', dept.id, 'edit'])`
- `CategoryListComponent`:
  - `navigateToCreate()`: `this.router.navigate(['/app/categorias/new'])`
  - `navigateToEdit(cat)`: `this.router.navigate(['/app/categorias', cat.id, 'edit'])`
- `LocationListComponent`:
  - `navigateToCreate()`: `this.router.navigate(['/app/ubicaciones/new'])`
  - `navigateToEdit(loc)`: `this.router.navigate(['/app/ubicaciones', loc.id, 'edit'])`

**Why**:
1. Eliminates dependency on the list's `ActivatedRoute` instance (`{ relativeTo: this.route }`), which is assigned to an empty path (`path: ''`).
2. Adopts the exact same pattern already used by `UsersListComponent` (`['/app/admin/users', userId, 'edit']`).
3. Makes the intent and destination immediately clear during code review and debugging.

**Alternative Rejected**: Retain relative navigation in lists while only fixing forms.
*Reason for Rejection*: Mixed conventions invite confusion. Standardizing on canonical absolute routing across all 4 catalogs guarantees uniformity and eliminates a class of subtle routing bugs.

---

### D3: Users List Information Card Link Repair

**Decision**: Correct the template link in `UsersListComponent` (`frontend/src/app/features/admin/users/users-list/users-list.component.html:142`):
```html
<!-- Before -->
<a [routerLink]="['/app/organizaciones']">Ver organizaciones...</a>

<!-- After -->
<a [routerLink]="['/app/admin/organizaciones']">Ver organizaciones...</a>
```

**Why**:
Migration 0064 and route registration in `app.routes.ts:236` established `/app/admin/organizaciones` as the true route. The legacy `/app/organizaciones` link in the user administration view was an overlooked dead link.

**Alternative Rejected**: Add a redirect route `{ path: 'organizaciones', redirectTo: 'admin/organizaciones' }` to `app.routes.ts`.
*Reason for Rejection*: Unnecessary alias complexity. Fixing the link in the template directly resolves the defect at the source.

---

### D4: Testing Strategy with Router Spy Assertions

**Decision**: Test navigation behavior in component unit tests by spying directly on `Router.navigate`:
- In form specs: verify that calling `goBack()` or saving invokes `router.navigate` with the exact expected absolute path array (`['/app/admin/organizaciones']`, etc.).
- In list specs: verify that calling `navigateToCreate()` and `navigateToEdit(item)` invokes `router.navigate` with the exact expected absolute path array.
- In users list spec: verify that the rendered anchor href or routerLink points to `/app/admin/organizaciones`.

**Why**:
Fast execution, highly targeted, and prevents regressions in CI without requiring heavy end-to-end browser fixtures for simple navigation commands.

---

## 3. Component Change Matrix

| Component | Target File | Method / Location | Before | After |
| :--- | :--- | :--- | :--- | :--- |
| **OrganizationFormComponent** | `.../organizations/organization-form.component.ts` | `goBack()` (line 195) | `navigate(['../'], { relativeTo })` | `navigate(['/app/admin/organizaciones'])` |
| **DepartmentFormComponent** | `.../departments/department-form.component.ts` | `goBack()` (line 325) | `navigate(['../'], { relativeTo })` | `navigate(['/app/admin/departamentos'])` |
| **CategoryFormComponent** | `.../incident-categories/category-form.component.ts` | `goBack()` (line 248) | `navigate(['../../'], { relativeTo })` | `navigate(['/app/categorias'])` |
| **LocationFormComponent** | `.../locations/location-form.component.ts` | `goBack()` (line 298) | `navigate(['../../'], { relativeTo })` | `navigate(['/app/ubicaciones'])` |
| **OrganizationListComponent** | `.../organizations/organization-list.component.ts` | `navigateToCreate()` & `navigateToEdit()` | `['new']` & `[id, 'edit']` relative | `['/app/admin/organizaciones/new']` & `['/app/admin/organizaciones', id, 'edit']` |
| **DepartmentListComponent** | `.../departments/department-list.component.ts` | `navigateToCreate()` & `navigateToEdit()` | `['new']` & `[id, 'edit']` relative | `['/app/admin/departamentos/new']` & `['/app/admin/departamentos', id, 'edit']` |
| **CategoryListComponent** | `.../incident-categories/category-list.component.ts` | `navigateToCreate()` & `navigateToEdit()` | `['new']` & `[id, 'edit']` relative | `['/app/categorias/new']` & `['/app/categorias', id, 'edit']` |
| **LocationListComponent** | `.../locations/location-list.component.ts` | `navigateToCreate()` & `navigateToEdit()` | `['new']` & `[id, 'edit']` relative | `['/app/ubicaciones/new']` & `['/app/ubicaciones', id, 'edit']` |
| **UsersListComponent** | `.../admin/users/users-list.component.html` | Line 142 | `[routerLink]="['/app/organizaciones']"` | `[routerLink]="['/app/admin/organizaciones']"` |
