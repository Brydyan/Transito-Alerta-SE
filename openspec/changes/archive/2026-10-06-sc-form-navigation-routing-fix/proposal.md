# Proposal: Canonical Absolute Routing for Catalog Forms & Lists

**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Scope**: Frontend (Angular 21) — Routing & Catalog Navigation  
**Date**: 2026-10-06 (Updated from 2026-09-22)  
**Phase**: F6 (Bug Fix — Blocking Navigation Defects)  
**Ticket**: SC-Form-Navigation-Fix

---

## 1. Intent & Problem Statement

Users navigating within administrative and catalog modules encounter broken routes and redirects to `404 ErrorPage` or `/app/dashboard`:

1. **Edit Form Save / Cancel Error (404 Page Not Found)**:
   - In `OrganizationFormComponent` (`/app/admin/organizaciones/:id/edit`) and `DepartmentFormComponent` (`/app/admin/departamentos/:id/edit`), clicking "Guardar cambios" or "Cancelar" invokes `goBack()`.
   - `goBack()` currently calls `this.router.navigate(['../'], { relativeTo: this.route })`.
   - Because the active route has two segments (`:id` and `edit`), climbing one relative level (`../`) drops only `edit`, resolving to `/app/admin/organizaciones/:id` (or `/app/admin/departamentos/:id`).
   - Neither `:id` route exists in `app.routes.ts` (only `''`, `'new'`, and `':id/edit'` are configured). Angular Router cannot match the URL, hits the wildcard `**` route, and displays `[ErrorPage] No route matched. URL intentada: /app/admin/organizaciones/{uuid}`.

2. **Create Form Save / Cancel Redirect (Unexpected Kick to Dashboard)**:
   - In `CategoryFormComponent` (`/app/categorias/new`) and `LocationFormComponent` (`/app/ubicaciones/new`), clicking "Guardar" or "Cancelar" invokes `goBack()`.
   - `goBack()` currently calls `this.router.navigate(['../../'], { relativeTo: this.route })`.
   - From `/app/categorias/new` (one segment below `/categorias`), climbing two relative levels (`../../`) ascends to `/app/`, which redirects to `/app/dashboard` instead of returning to the catalog list.

3. **Fragile Relative Navigation in Catalog Lists**:
   - `OrganizationListComponent`, `DepartmentListComponent`, `CategoryListComponent`, and `LocationListComponent` use relative navigation (`navigate(['new'], { relativeTo: this.route })` and `navigate([id, 'edit'], { relativeTo: this.route })`).
   - Because the list components are mounted on an empty path (`path: ''`), relative navigation creates unnecessary coupling with Angular's active route segment hierarchy.

4. **Broken RouterLink in Users Management**:
   - `UsersListComponent` (`frontend/src/app/features/admin/users/users-list/users-list.component.html:142`) contains a hardcoded link `<a [routerLink]="['/app/organizaciones']">Ver organizaciones...</a>`.
   - The route was moved to `/app/admin/organizaciones` in migration 0064, making this link an immediate 404 trigger.

---

## 2. Scope

### In Scope

1. **4 Catalog Form Components (`goBack()` method)**:
   - `OrganizationFormComponent`: navigate to canonical absolute path `['/app/admin/organizaciones']`.
   - `DepartmentFormComponent`: navigate to canonical absolute path `['/app/admin/departamentos']`.
   - `CategoryFormComponent`: navigate to canonical absolute path `['/app/categorias']`.
   - `LocationFormComponent`: navigate to canonical absolute path `['/app/ubicaciones']`.

2. **4 Catalog List Components (`navigateToCreate()` and `navigateToEdit()` methods)**:
   - `OrganizationListComponent`:
     - Create: `['/app/admin/organizaciones/new']`
     - Edit: `['/app/admin/organizaciones', organization.id, 'edit']`
   - `DepartmentListComponent`:
     - Create: `['/app/admin/departamentos/new']`
     - Edit: `['/app/admin/departamentos', dept.id, 'edit']`
   - `CategoryListComponent`:
     - Create: `['/app/categorias/new']`
     - Edit: `['/app/categorias', category.id, 'edit']`
   - `LocationListComponent`:
     - Create: `['/app/ubicaciones/new']`
     - Edit: `['/app/ubicaciones', location.id, 'edit']`

3. **1 Template Fix in Users Management**:
   - `frontend/src/app/features/admin/users/users-list/users-list.component.html:142`:
     Update `[routerLink]="['/app/organizaciones']"` to `[routerLink]="['/app/admin/organizaciones']"`.

4. **Unit Test Coverage**:
   - Add/update unit test assertions for `navigateToCreate`, `navigateToEdit`, and `goBack` (on both create and edit modes) across the 8 affected components.
   - Update `users-list.component.html` tests if applicable.

### Out of Scope

- Changes to backend API or database migrations (already verified in 0064).
- Restructuring `app.routes.ts` route hierarchies (the existing structure `/app/admin/...` and `/app/...` is preserved).
- Profile settings secondary dead links (`/app/cambiar-contrasena`, `/app/zonas`) — tracked in follow-up UX backlog.

---

## 3. Database & RBAC Changes

- **Database Migrations**: None required.
- **RBAC Permissions**: No permission changes. All routes keep their existing guards (`permissionGuard`).

---

## 4. Success Criteria

- [ ] Saving an edited organization redirects cleanly to `/app/admin/organizaciones` without triggering 404 `ErrorPage`.
- [ ] Saving a new organization redirects cleanly to `/app/admin/organizaciones`.
- [ ] Saving an edited or new department redirects cleanly to `/app/admin/departamentos`.
- [ ] Saving an edited or new category redirects cleanly to `/app/categorias` (never to `/app/dashboard`).
- [ ] Saving an edited or new location redirects cleanly to `/app/ubicaciones` (never to `/app/dashboard`).
- [ ] Clicking "Editar" or "+ Nuevo" in all 4 lists navigates to the exact expected URL.
- [ ] Clicking "Ver organizaciones..." from `users-list` navigates to `/app/admin/organizaciones`.
- [ ] All frontend unit tests (`pnpm test`) pass with zero regressions.
- [ ] Frontend build (`pnpm run build`) succeeds cleanly with exit code 0.
