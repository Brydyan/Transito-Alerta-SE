# Proposal: Fix Form Navigation Redirect Bug

**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Scope**: Frontend (Angular) — Routing & Navigation  
**Date**: 2026-09-22  
**Phase**: F6 (Bug Fix — Blocking)  
**Ticket**: TBD (Shortcut)

---

## Intent

When users create or edit an item in catalog forms (categories, locations, departments, organizations), the form incorrectly redirects to `/app/dashboard` after successful save, instead of returning to the catalog list (`/app/categorias`, `/app/ubicaciones`, etc.).

**Root Cause**: The `goBack()` method in form components uses `navigate(['../../'], { relativeTo: this.route })`, which navigates up 2 levels in the route tree. From `/app/categorias/new`, this climbs to `/app/`, which is configured to redirect to `dashboard`.

**Fix**: Change navigation to `navigate(['../'], { relativeTo: this.route })` to climb 1 level (back to the list).

---

## Scope

### In Scope (4 Form Components)

All catalog CRUD forms exhibit the same bug:

1. **CategoryFormComponent** (`/app/categorias/:id/edit`, `/app/categorias/new`)
   - File: `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts`
   - Current: Line 233 `navigate(['../../'])`
   - Fix: `navigate(['../'])`

2. **LocationFormComponent** (`/app/ubicaciones/:id/edit`, `/app/ubicaciones/new`)
   - File: `frontend/src/app/features/catalogs/locations/location-form/location-form.component.ts`
   - Current: `navigate(['../../'])`
   - Fix: `navigate(['../'])`

3. **DepartmentFormComponent** (`/app/departamentos/:id/edit`, `/app/departamentos/new`)
   - File: `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts`
   - Current: `navigate(['../../'])`
   - Fix: `navigate(['../'])`

4. **OrganizationFormComponent** (`/app/organizaciones/:id/edit`, `/app/organizaciones/new`)
   - File: `frontend/src/app/features/catalogs/organizations/organization-form/organization-form.component.ts`
   - Current: `navigate(['../../'])`
   - Fix: `navigate(['../'])`

### Out of Scope

- Other form components (user, role editors) — they may have different routing structures and need individual review.
- Route tree restructuring — this fix works within the current routing tree.

---

## Technical Context

### Routing Tree Structure

```
/app
  └─ /categorias
       ├─ (list, empty path)
       ├─ /new
       └─ /:id/edit
```

**Problem Navigation Trace**:
1. User at route: `/app/categorias/new`
2. Calls: `navigate(['../../'], { relativeTo: this.route })`
3. Resolves to: `/app/` (up 2 segments from `/new` → `/categorias` → `/app`)
4. `/app` has no explicit route; redirectTo handler kicks in
5. **Redirect**: `/app/` → `/app/dashboard` (defined in `app.routes.ts:424-427`)

**Correct Navigation Trace**:
1. User at route: `/app/categorias/new`
2. Calls: `navigate(['../'], { relativeTo: this.route })`
3. Resolves to: `/app/categorias/` (up 1 segment from `/new` → `/categorias`)
4. `/app/categorias` matches the list component ✓

---

## Database Changes

None.

---

## Permission Changes

None.

---

## Deliverables

1. Updated `goBack()` method in 4 form components
2. Unit tests updated (if any mock routing exists)
3. Manual e2e validation: Create/Edit → Save → Verify redirect to list

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Similar bug in other forms not caught | Minor UX break in other flows | Code review + grep for `navigate(['../../'])` across entire codebase |
| E2E tests not covering navigation | Regression on next save | Ensure all form save scenarios are covered in e2e |

---

## Success Criteria

- [ ] User creates category → Save → Redirects to `/app/categorias` (list) ✓
- [ ] User edits category → Save → Redirects to `/app/categorias` (list) ✓
- [ ] Same for locations, departments, organizations
- [ ] No regressions in other navigation flows
- [ ] E2E tests pass
