# Tasks: Form Navigation Routing Fix

**Change**: `2026-09-22-sc-form-navigation-routing-fix`  
**Total Effort**: ~30 min  
**Phase**: Single (Bug Fix)

---

## Phase 1: Fix & Verify (30 min)

### 1.1 Update CategoryFormComponent

- [ ] Open `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts`
- [ ] Locate `goBack()` method (line ~233)
- [ ] Change `navigate(['../../'], ...)` to `navigate(['../'], ...)`
- [ ] Save file

**Acceptance**: Method signature matches design D1; no other changes to the component.

---

### 1.2 Update LocationFormComponent

- [ ] Open `frontend/src/app/features/catalogs/locations/location-form/location-form.component.ts`
- [ ] Find `goBack()` method
- [ ] Change `navigate(['../../'], ...)` to `navigate(['../'], ...)`
- [ ] Save file

**Acceptance**: Method signature matches design D1.

---

### 1.3 Update DepartmentFormComponent

- [ ] Open `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts`
- [ ] Find `goBack()` method
- [ ] Change `navigate(['../../'], ...)` to `navigate(['../'], ...)`
- [ ] Save file

**Acceptance**: Method signature matches design D1.

---

### 1.4 Update OrganizationFormComponent

- [ ] Open `frontend/src/app/features/catalogs/organizations/organization-form/organization-form.component.ts`
- [ ] Find `goBack()` method
- [ ] Change `navigate(['../../'], ...)` to `navigate(['../'], ...)`
- [ ] Save file

**Acceptance**: Method signature matches design D1.

---

### 1.5 Verify No Other Navigation Patterns in Codebase

- [ ] Run: `grep -r "navigate\(\[.*\.\.\/" frontend/src --include="*.ts" | grep -v node_modules`
- [ ] For each match, verify it's either:
  - (a) One of the 4 updated components above (expected)
  - (b) A different routing context where `../../` is correct
- [ ] If found a pattern that looks wrong, open a follow-up ticket

**Acceptance**: Grep returns only the 4 expected files, or additional findings are documented as follow-up tickets.

---

### 1.6 Run Frontend Linting

- [ ] Run: `cd frontend && npm run lint`
- [ ] Verify no new linting errors introduced by the changes
- [ ] If errors: fix and re-run

**Acceptance**: `npm run lint` exits with code 0 (no errors).

---

### 1.7 Manual E2E Test: Category Create → Redirect

- [ ] Start dev server: `docker compose up -d`
- [ ] Navigate to `http://localhost:8083/app/categorias/new`
- [ ] Fill form: Name = "Test Category", Description = "Test"
- [ ] Click "Guardar"
- [ ] **Assert**: Browser URL changes to `http://localhost:8083/app/categorias`
- [ ] **Assert**: Category list is displayed
- [ ] **Assert**: Toast "Categoría creada correctamente" appears

**Acceptance**: All 3 assertions pass.

---

### 1.8 Manual E2E Test: Category Edit → Redirect

- [ ] From list view, click Edit on any category
- [ ] Modify the name field
- [ ] Click "Guardar"
- [ ] **Assert**: Browser URL is `http://localhost:8083/app/categorias`
- [ ] **Assert**: Category list is displayed with updated data
- [ ] **Assert**: Toast "Categoría actualizada correctamente" appears

**Acceptance**: All 3 assertions pass.

---

### 1.9 Manual E2E Test: Location Create → Redirect

- [ ] Navigate to `http://localhost:8083/app/ubicaciones/new`
- [ ] Fill form: Name = "Test Location"
- [ ] Click "Guardar"
- [ ] **Assert**: Browser URL changes to `http://localhost:8083/app/ubicaciones`
- [ ] **Assert**: Location list is displayed

**Acceptance**: All assertions pass.

---

### 1.10 Manual E2E Test: Department Create → Redirect

- [ ] Navigate to `http://localhost:8083/app/departamentos/new`
- [ ] Fill form: Name = "Test Department"
- [ ] Click "Guardar"
- [ ] **Assert**: Browser URL changes to `http://localhost:8083/app/departamentos`
- [ ] **Assert**: Department list is displayed

**Acceptance**: All assertions pass.

---

### 1.11 Manual E2E Test: Organization Create → Redirect

- [ ] Navigate to `http://localhost:8083/app/organizaciones/new`
- [ ] Fill form: Name = "Test Org"
- [ ] Click "Guardar"
- [ ] **Assert**: Browser URL changes to `http://localhost:8083/app/organizaciones`
- [ ] **Assert**: Organization list is displayed

**Acceptance**: All assertions pass.

---

### 1.12 Run Existing E2E Test Suite

- [ ] Run: `cd frontend && npm run test:e2e 2>&1 | grep -E "(PASS|FAIL|✓|✗)"`
- [ ] **Assert**: No new failures related to routing or navigation
- [ ] **Assert**: All existing e2e tests still pass

**Acceptance**: Test suite exits with code 0; no new failures.

---

### 1.13 Run Full Frontend Test Suite

- [ ] Run: `cd frontend && npm test`
- [ ] **Assert**: All unit tests pass
- [ ] **Assert**: No new failures

**Acceptance**: Test suite exits with code 0.

---

## Summary

**Total Manual Steps**: 13  
**Automation**: Covered by linting + existing test suite  
**Risk**: Low (1-line change, well-tested path)  
**Rollback**: Single commit revert
