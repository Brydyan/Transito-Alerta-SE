# Tasks: F6 Usuarios Redesign

- [ ] **U.1.1** Create folder `frontend/src/app/features/admin/users/`
- [ ] **U.1.2** Generate UsersListComponent
- [ ] **U.1.3** Generate SearchBarComponent
- [ ] **U.1.4** Generate FilterBarComponent
- [ ] **U.1.5** Generate ActionMenuComponent
- [ ] **U.1.6** Reuse or create UiTableComponent (may be shared with Roles)

- [ ] **U.2.1** Create `models/user.model.ts` with types (User, UsersResponse)
- [ ] **U.2.2** Add UserService methods:
  - `getUsers(page, limit, search, role, org)`
  - `deleteUser(id)`
  - `getUserRoles()`
  - `getOrganizations()`
- [ ] **U.2.3** Unit test service methods (mock HTTP)

- [ ] **U.3.1** Implement SearchBarComponent:
  - Input binding for search term
  - Debounce (300ms) to parent
  - Clear button (X)
- [ ] **U.3.2** Implement FilterBarComponent:
  - Role dropdown (from API)
  - Organization dropdown (from API)
  - Reset filters button
- [ ] **U.3.3** Implement UiTableComponent (if new):
  - Input: columns[], rows[], selectable?
  - Output: rowAction (edit, delete, view)
  - Sticky header
  - Sortable columns (future)

- [ ] **U.4.1** Implement UsersListComponent:
  - Inject UserService
  - Signals: users, roles, orgs, loading, currentPage, searchTerm, selectedRole, selectedOrg
  - ngOnInit: load users (page 1, all filters)
  - Handlers: onSearch, onFilterChange, onPageChange, onDelete
- [ ] **U.4.2** Implement template:
  - Search bar + filter bar at top
  - Table with 7 columns (photo, name, email, role, org, status, actions)
  - Status badges: Activo (green), Pendiente (orange), Inactivo (red)
  - Pagination footer

- [ ] **U.5.1** Implement ActionMenuComponent:
  - Eye icon (view user)
  - Three-dot menu (edit, delete, etc.)
  - On delete: confirm dialog, call UserService.deleteUser()
- [ ] **U.5.2** Add error handling:
  - Delete 403 → Toast "No tienes permiso"
  - Delete 500 → Toast "Error al eliminar usuario"
  - List 500 → Error state UI + retry

- [ ] **U.6.1** Create `frontend/e2e/users-list.e2e.ts`:
  - S1: List loads, 7 users render
  - S2: Search filters locally
  - S3: Role filter loads new data
  - S4: Org filter loads new data
  - S5: Status badge colors correct
  - S6: Pagination works (click page 2)
  - S7: Delete button works, refreshes list
  - S8: Error state (500 endpoint)

- [ ] **U.7.1** Unit tests for all components:
  - `users-list.component.spec.ts` (signals, filters, pagination)
  - `search-bar.component.spec.ts` (debounce, clear)
  - `filter-bar.component.spec.ts` (dropdown, reset)
  - `action-menu.component.spec.ts` (delete confirm)

- [ ] **U.8.1** Lint: `pnpm run lint` — fix all errors
- [ ] **U.8.2** Build: `ng build` — no errors
- [ ] **U.8.3** Tests: `pnpm test` — all pass
- [ ] **U.8.4** Regression: Existing user specs still pass (D1)

**Total Story Points**: ~18 pts
