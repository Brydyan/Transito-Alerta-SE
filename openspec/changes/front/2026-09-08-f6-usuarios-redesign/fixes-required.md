# Fixes Required — F6 Usuarios Redesign

**Status**: sdd-verify FAIL  
**Verdict**: 4 CRITICAL, 5 WARNING, 2 SUGGESTION issues must be resolved before archive

---

## CRITICAL Issues (must fix)

### C.1: Organización Column Hardcoded to `—`

**Issue**: Users table displays `—` in Organización column instead of resolving `user.organizationId` against the loaded `organizations()` signal.

**Location**: `frontend/src/app/features/admin/users/users-list/users-list.component.html:89`

**Current state**:
```html
<td>{{ '—' }}</td> <!-- Organization placeholder -->
```

**Expected**: Resolve from `organizations()` signal lookup by ID.

**Action**: Replace with:
```html
<td>{{ getOrganizationName(user.organizationId) }}</td>
```

Add helper to `users-list.component.ts`:
```typescript
getOrganizationName(orgId: string | undefined): string {
  if (!orgId) return '—';
  return this.organizations().find(o => o.id === orgId)?.name ?? '—';
}
```

Verify `organizations()` signal is populated via `UsersService.getOrganizations()` (already called in `ngOnInit()`).

---

### C.2: Role & Org Filters Non-Functional

**Issue**: `onFilterChange()` method stores filter values to signals but `UsersService.getUsers()` never receives them as query parameters. S3 e2e assertion will fail in CI.

**Location**: 
- `frontend/src/app/features/admin/users/users-list/users-list.component.ts:45-65` (`onFilterChange()`)
- `frontend/src/app/features/admin/users/services/users.service.ts:28` (`getUsers()`)

**Current state**:
```typescript
// Component
onFilterChange(filters: { role?: string; org?: string }) {
  this.selectedRole.set(filters.role);
  this.selectedOrg.set(filters.org);
  // NO REFETCH — filters are stored but never used
}

// Service
getUsers(page: number, limit: number): Observable<UserResponse> {
  return this.http.get<UserResponse>(`/users?page=${page}&limit=${limit}`);
  // Missing: ?search=..., ?role=..., ?org=...
}
```

**Action**:
1. **Component**: Call `refetch()` after setting filter signals:
```typescript
onFilterChange(filters: { role?: string; org?: string }) {
  this.selectedRole.set(filters.role);
  this.selectedOrg.set(filters.org);
  this.refetch(); // Reset to page 1, apply filters
}

private refetch() {
  this.currentPage.set(1);
  this.loadUsers();
}
```

2. **Service**: Update `getUsers()` to accept and use filter params:
```typescript
getUsers(page: number, limit: number, search?: string, role?: string, org?: string): Observable<UserResponse> {
  let params = `page=${page}&limit=${limit}`;
  if (search) params += `&search=${encodeURIComponent(search)}`;
  if (role) params += `&role=${role}`;
  if (org) params += `&org=${org}`;
  return this.http.get<UserResponse>(`/users?${params}`);
}
```

3. **Component**: Pass filters to service call:
```typescript
private loadUsers() {
  const search = this.searchTerm();
  const role = this.selectedRole();
  const org = this.selectedOrg();
  
  this.usersService.getUsers(this.currentPage(), 25, search, role, org).subscribe({
    next: (data) => this.users.set(data.users),
    error: (err) => this.error.set('Error cargando usuarios')
  });
}
```

**Verify**: S3 e2e test (`frontend/e2e/users-list.e2e.ts:S3`) filters by role and expects results to change. This must pass once live backend is available.

---

### C.3: Missing Bottom Cards Section

**Issue**: Spec.md requires 3 info cards at bottom of users list (Políticas de Seguridad, Gestión de Organizaciones, Auditoría de Acceso). Currently missing from HTML.

**Location**: `frontend/src/app/features/admin/users/users-list/users-list.component.html` (bottom section)

**Expected per spec.md**:
```
3 cards (1/3 width each):
├── Icon (shield) + "POLÍTICAS DE SEGURIDAD" + "Actualiza las políticas de contraseña y autenticación."
├── Icon (organization) + "GESTIÓN DE ORGANIZACIONES" + "Administra organizaciones y sus permisos."
└── Icon (audit) + "AUDITORÍA DE ACCESO" + "Revisa logs de acceso de usuarios."
```

**Action**: Add after table (`</table>`):
```html
<div class="info-cards-grid">
  <div class="info-card">
    <icon-component name="shield" class="icon"></icon-component>
    <h3>POLÍTICAS DE SEGURIDAD</h3>
    <p>Actualiza las políticas de contraseña y autenticación.</p>
    <a href="#">Configurar políticas...</a>
  </div>
  <div class="info-card">
    <icon-component name="organization" class="icon"></icon-component>
    <h3>GESTIÓN DE ORGANIZACIONES</h3>
    <p>Administra organizaciones y sus permisos.</p>
    <a href="#">Gestionar organizaciones...</a>
  </div>
  <div class="info-card">
    <icon-component name="audit-log" class="icon"></icon-component>
    <h3>AUDITORÍA DE ACCESO</h3>
    <p>Revisa logs de acceso de usuarios.</p>
    <a href="#">Ver auditoría...</a>
  </div>
</div>
```

Add CSS to `users-list.component.scss`:
```scss
.info-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--color-border);
}

.info-card {
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: 0.5rem;
  text-align: center;

  .icon {
    font-size: 2rem;
    color: var(--color-primary);
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  p {
    margin: 0.5rem 0 1rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  a {
    color: var(--color-primary);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }
  }
}
```

---

### C.4: tasks.md Out of Sync

**Issue**: `tasks.md` has 0/22 tasks marked `[x]` but `apply-progress.md` claims all 22 complete. Source of truth (`tasks.md`) was never updated.

**Action**: Update `tasks.md` to mark all tasks complete with deviations noted (like dashboard did).

Current sections to mark `[x]`:
- U.1.1 - U.1.5 (Component scaffolding)
- U.2.1 - U.2.3 (Services)
- U.3.1 - U.3.3 (SearchBar)
- U.4.1 - U.4.3 (FilterBar)
- U.5.1 - U.5.3 (Table + ActionMenu)
- U.6.1 - U.6.3 (Main component)
- U.7.1 - U.7.8 (E2E tests)
- U.8.1 - U.8.2 (Lint + testing)

Add deviations noted in `apply-progress.md` (e.g., ActionMenu reused from Roles/Perfil specs, SearchBar debounce logic, etc.).

Example:
```markdown
- [x] **U.1.1** Create folder structure
- [x] **U.2.2** Create/update `UsersService`
  — **Desviación**: No se agregaron parámetros `search`, `role`, `org` a `getUsers()` hasta Fix Batch C.2 (ahora incluido).
```

---

## WARNING Issues (should fix before archive)

### W.1: S3 & S4 E2E Not Tested at Runtime

**Issue**: S3 (filter by role) and S4 (filter by org) e2e assertions exist but are masked locally due to skip (expected per D4).

**Note**: Will fail in CI against staging backend if filters are not functional (C.2 fixes this).

**Action**: No immediate action; C.2 fix + CI run will expose any gaps.

---

### W.2: Search Not Implemented

**Issue**: SearchBar component accepts `onSearch()` callback, but `users-list.component.ts` may not be wiring it.

**Location**: `frontend/src/app/features/admin/users/users-list/users-list.component.ts`

**Action**: Verify search wiring:
```typescript
onSearch(term: string) {
  this.searchTerm.set(term);
  this.refetch();
}
```

Confirm called from template:
```html
<app-search-bar (onSearch)="onSearch($event)"></app-search-bar>
```

---

### W.3: Pagination May Not Reset on Filter

**Issue**: When filters change, pagination should reset to page 1 (handled by `refetch()` in C.2, but verify it's called).

**Action**: Confirm C.2's `refetch()` method sets `currentPage.set(1)` before refetch.

---

### W.4: Error Handling Weak

**Issue**: `loadUsers()` error path only sets `error` signal; no user-facing toast.

**Action**: Add toast notification on error:
```typescript
error: (err) => {
  this.error.set('Error cargando usuarios');
  this.toastr.error('No se pudieron cargar los usuarios. Intenta nuevamente.');
}
```

---

### W.5: Delete Confirmation Dialog Missing Content

**Issue**: Delete user e2e test expects a confirm dialog, but dialog implementation may lack proper title/message.

**Location**: `frontend/src/app/features/admin/users/users-list/users-list.component.ts` (delete handler)

**Action**: Verify dialog config:
```typescript
const dialogRef = this.dialog.open(ConfirmDialogComponent, {
  data: {
    title: '¿Eliminar usuario?',
    message: `¿Estás seguro que deseas eliminar a ${user.firstName}? Esta acción no puede deshacerse.`,
    confirmText: 'Eliminar',
    cancelText: 'Cancelar'
  }
});
```

---

## SUGGESTION Issues (nice to have)

### S.1: Keyboard Navigation for Table

**Issue**: Table doesn't support Tab navigation through action buttons.

**Action**: Add `tabindex="0"` to action buttons in `ActionMenuComponent`.

---

### S.2: Responsive Breakpoint for Table

**Issue**: Table may not stack properly on mobile.

**Action**: Add media query in `users-list.component.scss`:
```scss
@media (max-width: 768px) {
  .users-table {
    font-size: 0.75rem;
  }
}
```

---

## Summary Table

| Issue | Type | Effort | Must Fix | File(s) |
|-------|------|--------|----------|---------|
| Org column hardcoded | CRITICAL | 15min | YES | `.html`, `.ts` |
| Filters non-functional | CRITICAL | 30min | YES | `.ts` (2 files) |
| Bottom cards missing | CRITICAL | 20min | YES | `.html`, `.scss` |
| tasks.md unsynced | CRITICAL | 10min | YES | `tasks.md` |
| S3/S4 e2e masked | WARNING | — | NO | (expected) |
| Search wiring | WARNING | 5min | Recommended | `.ts`, `.html` |
| Pagination reset | WARNING | 5min | Recommended | `.ts` |
| Error toast | WARNING | 10min | Recommended | `.ts` |
| Delete dialog | WARNING | 5min | Recommended | `.ts` |
| Keyboard nav | SUGGESTION | 5min | NO | `.ts` |
| Responsive | SUGGESTION | 10min | NO | `.scss` |

**Total effort**: ~90min (all CRITICAL + WARNING)

---

## Next Steps for Minimax

1. **Fix org column** (C.1) — add helper, update template
2. **Wire filters** (C.2) — service params + component refetch
3. **Add bottom cards** (C.3) — HTML + CSS
4. **Update tasks.md** (C.4) — mark all done, note deviations
5. **Wire search** (W.2) — confirm `onSearch()` callback
6. **Add error toast** (W.4) — toastr notification
7. **Verify delete dialog** (W.5) — check config
8. **Run full suite**:
   ```bash
   pnpm run lint     # must exit 0
   pnpm test         # must pass all
   ng build          # must succeed
   pnpm test:e2e     # skips locally (expected)
   ```
9. **Commit**: `"fix(usuarios): org column, filters wiring, bottom cards, tasks.md sync"`
10. **Push** to `brydyan/sc-328-f6-usuarios`

---

**Owner**: Minimax  
**Change**: `2026-09-08-f6-usuarios-redesign`  
**Target branch**: `brydyan/sc-328-f6-usuarios`  
**Re-verify after**: Run `sdd-verify` again to confirm PASS
