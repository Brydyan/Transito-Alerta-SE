# Fixes Required — F6 Roles Redesign

**Status**: sdd-verify PASS WITH WARNINGS  
**Verdict**: 2 CRITICAL, 4 WARNING, 2 SUGGESTION issues must be addressed

---

## CRITICAL Issues (must fix)

### C.1: tasks.md Never Updated

**Issue**: `tasks.md` has 0/15 tasks marked `[x]` despite full implementation completion and commit `4c7415dbc`.

**Location**: `openspec/changes/front/2026-09-08-f6-roles-redesign/tasks.md`

**Expected**: All 15 tasks marked `[x]` with any deviations documented (R.1.1 through R.8.2).

**Action**: Update `tasks.md` to mark all tasks done:

```markdown
- [x] **R.1.1** Create folder structure
- [x] **R.1.2** Generate RolesListComponent
- [x] **R.1.3** Reuse SearchBarComponent from usuarios change
- [x] **R.1.4** Reuse FilterBarComponent (simple, no org filter)
- [x] **R.1.5** Reuse UiTableComponent (ui-table from F0)
- [x] **R.1.6** Reuse ActionMenuComponent from usuarios
- [x] **R.2.1** Create RoleService (separate, not merged with existing)
- [x] **R.2.2** Create RolePermissionInterface
- [x] **R.3.1** Implement RolesListComponent with stats cards
- [x] **R.3.2** Implement role-permission-badge component
- [x] **R.4.1** Add unit tests (roles.component.spec.ts, stats-cards.component.spec.ts)
- [x] **R.5.1** Create e2e tests (5 scenarios: S1-S5)
- [x] **R.6.1** Lint & build verification
- [x] **R.7.1** Test compliance matrix
- [x] **R.8.1** Final verification (tags for deviations)
  — **Desviación**: `roles.service.ts` is separate file, not `RolesService` injected into component directly; uses `HttpClient` for `/roles` endpoint.
  — **Desviación**: Component reuses SearchBar, FilterBar, UiTable, ActionMenu from usuarios change (no new implementations).
  — **Desviación**: `role-permission-badge.component` is inline display-only; no edit capability (spec-compliant).
```

---

### C.2: apply-progress Artifact Never Persisted

**Issue**: Hybrid mode requires persist to both Engram and filesystem. `apply-progress.md` was never created or saved to Engram despite commit message referencing it.

**Location**: 
- Should exist: `openspec/changes/front/2026-09-08-f6-roles-redesign/apply-progress.md`
- Should be saved: Engram `sdd/2026-09-08-f6-roles-redesign/apply-progress`

**Action**: Create `apply-progress.md`:

```markdown
# Apply Progress — F6 Roles Redesign

**Change**: 2026-09-08-f6-roles-redesign
**Branch**: brydyan/sc-328-f6-roles
**Commit**: 4c7415dbc (roles implementation complete)

## Implementation Summary

All 15 tasks completed. Component tree:
- RolesListComponent (container) → stats cards, table, search/filter bar
- StatsCardsComponent (3 cards: Total Permisos, Módulos Protegidos, Usuarios Asignados)
- Reused: SearchBarComponent, FilterBarComponent, UiTableComponent, ActionMenuComponent (from usuarios change)
- RoleService (separate service, handles `/roles` endpoint)

## Deviations from Design

1. **RoleService naming**: Design suggested "update existing RolesService", but created separate RoleService file to avoid cross-module conflicts. Justified.
2. **Badge display-only**: role-permission-badge is display component, no edit capability (spec-compliant per R3.2).
3. **Search local**: Design says "search local", but component also sends `?search=` param to backend (hybrid approach).

## Test Results

- Unit: 13/13 tests pass (roles.component, stats-cards.component, role.service mocked)
- E2E: 5/5 skipped locally (expected per D4, runs in CI with BASE_URL/E2E_PASSWORD)
- Build: ng build pass (3.2s)
- Lint: 0 errors

## Known Gaps

- S3 (permission badge counts) only covered by e2e test (skipped locally)
- No dedicated roles.service.spec.ts (service mocked in component tests)

## Ready for

Archive once tasks.md and this apply-progress.md are committed.
```

Save to Engram: `sdd/2026-09-08-f6-roles-redesign/apply-progress` (topic_key).

---

## WARNING Issues (should address)

### W.1: S3 Permission Badge Counts Untested at Unit Level

**Issue**: Scenario S3 (permission badge counts display) only covered by e2e test (skipped locally). No unit test assertion.

**Location**: `frontend/src/app/features/admin/roles/components/role-permission-badge.component.spec.ts`

**Action**: Add unit test:

```typescript
it('S3: should display permission count badge', () => {
  const role: Role = { id: '1', name: 'Admin', permissionCount: 42 };
  component.role = role;
  fixture.detectChanges();
  
  const badge = fixture.debugElement.query(By.css('.permission-badge'));
  expect(badge.nativeElement.textContent).toContain('42');
});
```

---

### W.2: Missing RoleService Unit Tests

**Issue**: `RoleService` is mocked in component tests but has no dedicated `roles.service.spec.ts`.

**Action**: Create `frontend/src/app/features/admin/roles/services/roles.service.spec.ts` with basic tests:

```typescript
describe('RolesService', () => {
  let service: RolesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [RolesService]
    });
    service = TestBed.inject(RolesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should fetch roles', () => {
    service.getRoles(1, 25).subscribe((data) => {
      expect(data.roles.length).toBeGreaterThan(0);
    });
    const req = httpMock.expectOne('/roles?page=1&limit=25');
    expect(req.request.method).toBe('GET');
    req.flush({ roles: [{ id: '1', name: 'Admin' }] });
  });
});
```

---

### W.3: Search Design Mismatch

**Issue**: `design.md` says "search local" but implementation sends `?search=` query param to backend (hybrid approach).

**Action**: Update `design.md` to clarify:

```markdown
## Search Strategy

Search is hybrid:
- Local filtering on the loaded roles array (fast for <100 roles)
- Backend param `?search=` sent for server-side filtering (compatible with future server-side pagination)
```

---

### W.4: Filtro/Limpiar Buttons Not Independently Confirmed

**Issue**: E2E test for filter clear button (Limpiar) is skipped. No unit assertion for button functionality.

**Action**: Verify in `roles.component.spec.ts`:

```typescript
it('should clear filters on Limpiar click', () => {
  component.filterRole.set('admin');
  fixture.detectChanges();
  
  const limpiarBtn = fixture.debugElement.query(By.css('button[aria-label="Limpiar"]'));
  limpiarBtn.nativeElement.click();
  
  expect(component.filterRole()).toBe('');
});
```

---

## SUGGESTION Issues (nice to have)

### S.1: Pagination Label Text Unasserted

**Issue**: "Mostrando 1-25 de 25 roles" text not asserted in any test.

**Action**: Add assertion to e2e or component test.

---

### S.2: Document RoleService Reuse Decision in design.md

**Issue**: `design.md` mentions "update existing RolesService" but implementation created new `RoleService`.

**Action**: Add decision rationale to `design.md`:

```markdown
## Service Decisions

**RoleService** (separate, not reused from existing codebase):
- Rationale: Creates a clean boundary for roles management; avoids cross-module dependencies.
- Methods: `getRoles()`, `deleteRole()`, `getStats()`, `searchRoles()`
```

---

## Summary Table

| Issue | Type | Effort | Must Fix | File(s) |
|-------|------|--------|----------|---------|
| tasks.md unchecked | CRITICAL | 10min | YES | `tasks.md` |
| apply-progress missing | CRITICAL | 15min | YES | `apply-progress.md` (new) |
| S3 unit test | WARNING | 15min | Recommended | `.spec.ts` |
| RoleService tests | WARNING | 20min | Recommended | `roles.service.spec.ts` (new) |
| Search design clarify | WARNING | 5min | Recommended | `design.md` |
| Filtro/Limpiar test | WARNING | 10min | Recommended | `.spec.ts` |
| Pagination label | SUGGESTION | 5min | NO | test file |
| Document decision | SUGGESTION | 5min | NO | `design.md` |

**Total effort**: ~60min (CRITICAL + WARNINGS)

---

## Next Steps for Minimax

1. Mark all 15 tasks done in `tasks.md` with deviations noted
2. Create `apply-progress.md` and save to Engram
3. Add S3 permission badge unit test
4. Create `roles.service.spec.ts` with basic coverage
5. Update `design.md` search strategy clarification
6. Add Limpiar button test
7. Run full suite:
   ```bash
   pnpm run lint     # must exit 0
   pnpm test         # must pass all
   ng build          # must succeed
   pnpm test:e2e     # skips locally (expected)
   ```
8. Commit: `"fix(roles): tasks.md sync, apply-progress, S3 unit test, service tests"`
9. Push to `brydyan/sc-328-f6-roles`

---

**Owner**: Minimax  
**Change**: `2026-09-08-f6-roles-redesign`  
**Target branch**: `brydyan/sc-328-f6-roles`  
**Re-verify after**: Run `sdd-verify` again to confirm PASS (no warnings blocking archive)
