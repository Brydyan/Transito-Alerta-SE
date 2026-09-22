# Design: Form Navigation Routing Fix

**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Status**: DESIGN  
**Last Updated**: 2026-09-22

---

## Overview

Fix the `goBack()` navigation method in 4 catalog form components to correctly return to the catalog list after create/edit save, instead of redirecting to the dashboard.

**Change Vector**: 4 lines of code (1 per component)

---

## D1: Navigation Strategy

**Decision**: Use relative route navigation (1 level up) within the form component's routing context.

**Why**: The form component is nested under the catalog list in the route tree. Using `relativeTo: this.route` with a single `../` segment naturally maps to the parent (list) route without hard-coding absolute paths.

**Alternative Rejected**: Use absolute path `navigate(['/app/categorias'])`. Hard-coded paths create maintenance burden: moving forms to different routes would require code updates. Relative navigation is DRY and survives route restructuring.

**Alternative Rejected**: Use route history API (`location.back()`). Unreliable: users might arrive at the form from external links, not necessarily the list. The back button could send them to an unrelated page. Best to be explicit about the destination.

---

## D2: Route Tree Assumption

**Decision**: Assume the route tree for all 4 catalogs follows the pattern:

```
/app/[catalog-name]
  ├─ (empty path) → List component
  ├─ /new → Form component (create mode)
  └─ /:id/edit → Form component (edit mode)
```

**Why**: Verified in `app.routes.ts` for all 4 affected routes (categorias, ubicaciones, departamentos, organizaciones). They are siblings at `/app/[catalog-name]` level.

**Assumption Validity**: This routing structure is enforced by Angular's router at build time. No runtime check needed.

---

## D3: Single Code Pattern

**Decision**: Apply the same fix to all 4 components identically.

```typescript
goBack(): void {
  this.router.navigate(['../'], { relativeTo: this.route });
}
```

**Why**: The components share identical routing context and intent. Applying different patterns would create confusion and risk inconsistency on future edits.

**Alternative Rejected**: Create a base class or shared utility for navigation. Overkill: this is a 1-line fix repeated 4 times. A base class adds coupling and indirection where none is needed. The 4 components already inherit behavior divergently (categories handle trees, departments have org filtering, etc.). Keep them independent.

---

## D4: Test Strategy

**Decision**: Verify navigation via e2e tests, not unit tests.

**Why**: The routing fix is an integration point (template → component → router → route tree). Unit tests can mock `Router.navigate()`, but that defeats the purpose — they'd only verify the mock was called, not that the route tree actually resolves correctly. E2e tests load the real router and verify the actual destination.

**Implementation**:
- Test: Create category → Fill form → Click save → Assert URL is `/app/categorias`
- Test: Edit category → Fill form → Click save → Assert URL is `/app/categorias`
- Repeat for locations, departments, organizations
- Existing e2e tests may already cover this; verify they pass after the fix

---

## D5: Error Handling (Not in Scope)

**Decision**: No changes to error handling in this fix.

**Why**: Error paths don't navigate away; they display toast messages in place. The bug only manifests on success. If future work adds error-handling edge cases, they get their own ticket.

---

## Affected Components

### 1. CategoryFormComponent

**File**: `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts`

**Current** (line 233):
```typescript
goBack(): void {
  this.router.navigate(['../../'], { relativeTo: this.route });
}
```

**After**:
```typescript
goBack(): void {
  this.router.navigate(['../'], { relativeTo: this.route });
}
```

**Usage**: Called after successful create/edit, and on cancel if form is clean.

---

### 2. LocationFormComponent

**File**: `frontend/src/app/features/catalogs/locations/location-form/location-form.component.ts`

**Change**: Same pattern, line TBD (find via grep).

---

### 3. DepartmentFormComponent

**File**: `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts`

**Change**: Same pattern, line TBD (find via grep).

---

### 4. OrganizationFormComponent

**File**: `frontend/src/app/features/catalogs/organizations/organization-form/organization-form.component.ts`

**Change**: Same pattern, line TBD (find via grep).

---

## No Schema Changes

Database, migrations, DTOs, API contracts — none affected. This is a front-end routing fix only.

---

## No Permission Changes

No RBAC changes needed. The forms already guard access via `permissionGuard` on the route.

---

## Verification Checklist

- [ ] All 4 components have `goBack()` methods updated
- [ ] No other calls to `navigate(['../../'])` remain in the codebase (verify with grep)
- [ ] E2E tests for form save scenarios pass
- [ ] Manual test: Create category → Verify URL is `/app/categorias` after save
- [ ] Manual test: Create location → Verify URL is `/app/ubicaciones` after save
- [ ] Manual test: Create department → Verify URL is `/app/departamentos` after save
- [ ] Manual test: Create organization → Verify URL is `/app/organizaciones` after save
