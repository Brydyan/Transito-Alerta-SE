# Tasks: Canonical Absolute Routing for Catalog Forms & Lists

**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Total Effort**: ~45 min  
**Status**: COMPLETED  

---

## Phase 1: Catalog Form Components (`goBack()`) (15 min)

- [x] 1.1 Update `OrganizationFormComponent` (`frontend/src/app/features/catalogs/organizations/organization-form/organization-form.component.ts`):
  - Change `goBack()` to: `this.router.navigate(['/app/admin/organizaciones']);`
- [x] 1.2 Update `DepartmentFormComponent` (`frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts`):
  - Change `goBack()` to: `this.router.navigate(['/app/admin/departamentos']);`
- [x] 1.3 Update `CategoryFormComponent` (`frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts`):
  - Change `goBack()` to: `this.router.navigate(['/app/categorias']);`
- [x] 1.4 Update `LocationFormComponent` (`frontend/src/app/features/catalogs/locations/location-form/location-form.component.ts`):
  - Change `goBack()` to: `this.router.navigate(['/app/ubicaciones']);`

---

## Phase 2: Catalog List Components (`navigateToCreate` & `navigateToEdit`) (15 min)

- [x] 2.1 Update `OrganizationListComponent` (`frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.ts`):
  - Change `navigateToCreate()` to: `this.router.navigate(['/app/admin/organizaciones/new']);`
  - Change `navigateToEdit(organization)` to: `this.router.navigate(['/app/admin/organizaciones', organization.id, 'edit']);`
- [x] 2.2 Update `DepartmentListComponent` (`frontend/src/app/features/catalogs/departments/department-list/department-list.component.ts`):
  - Change `navigateToCreate()` to: `this.router.navigate(['/app/admin/departamentos/new']);`
  - Change `navigateToEdit(dept)` to: `this.router.navigate(['/app/admin/departamentos', dept.id, 'edit']);`
- [x] 2.3 Update `CategoryListComponent` (`frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts`):
  - Change `navigateToCreate()` to: `this.router.navigate(['/app/categorias/new']);`
  - Change `navigateToEdit(category)` to: `this.router.navigate(['/app/categorias', category.id, 'edit']);`
- [x] 2.4 Update `LocationListComponent` (`frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts`):
  - Change `navigateToCreate()` to: `this.router.navigate(['/app/ubicaciones/new']);`
  - Change `navigateToEdit(location)` to: `this.router.navigate(['/app/ubicaciones', location.id, 'edit']);`

---

## Phase 3: Template Link Repair (5 min)

- [x] 3.1 Update `UsersListComponent` template (`frontend/src/app/features/admin/users/users-list/users-list.component.html:142`):
  - Change `[routerLink]="['/app/organizaciones']"` to `[routerLink]="['/app/admin/organizaciones']"`

---

## Phase 4: Unit Test Coverage (15 min)

- [x] 4.1 Update / add tests in `organization-form.component.spec.ts` & `organization-list.component.spec.ts`:
  - Assert `goBack()` navigates to `['/app/admin/organizaciones']`.
  - Assert `navigateToCreate()` and `navigateToEdit()` navigate to canonical absolute routes.
- [x] 4.2 Update / add tests in `department-form.component.spec.ts` & `department-list.component.spec.ts`:
  - Assert `goBack()` navigates to `['/app/admin/departamentos']`.
  - Assert `navigateToCreate()` and `navigateToEdit()` navigate to canonical absolute routes.
- [x] 4.3 Update / add tests in `category-form.component.spec.ts` & `category-list.component.spec.ts`:
  - Assert `goBack()` navigates to `['/app/categorias']`.
  - Assert `navigateToCreate()` and `navigateToEdit()` navigate to canonical absolute routes.
- [x] 4.4 Update / add tests in `location-form.component.spec.ts` & `location-list.component.spec.ts`:
  - Assert `goBack()` navigates to `['/app/ubicaciones']`.
  - Assert `navigateToCreate()` and `navigateToEdit()` navigate to canonical absolute routes.
- [x] 4.5 Assert `users-list.component.spec.ts` verifies the organizations card routerLink.

---

## Phase 5: Verification & CI Gates (10 min)

- [x] 5.1 Run full frontend test suite: `pnpm test` (104 suites / 884 tests pass).
- [x] 5.2 Run frontend production build: `pnpm run build` (exit code 0).
- [x] 5.3 Verify git status clean of unexpected edits.
