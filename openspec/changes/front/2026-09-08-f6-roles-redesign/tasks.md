# Tasks: F6 Roles Redesign

- [ ] **R.1.1** Create folder `frontend/src/app/features/admin/roles/`
- [ ] **R.1.2** Generate RolesListComponent
- [ ] **R.1.3** Generate StatsCardsComponent (new)
- [ ] **R.1.4** Reuse SearchBarComponent, UiTableComponent, ActionMenuComponent from Users

- [ ] **R.2.1** Create `models/role.model.ts` (Role, RoleStats)
- [ ] **R.2.2** Add RoleService:
  - `getRoles(page, limit, search)`
  - `deleteRole(id)`
  - `getRoleStats()`
- [ ] **R.2.3** Unit test service

- [ ] **R.3.1** Implement StatsCardsComponent:
  - Input: stats { totalPermissions, protectedModules, assignedUsers }
  - Display 3 cards (1/3 width each)
  - Large numbers (2xl), small description text

- [ ] **R.4.1** Implement RolesListComponent:
  - Signals: roles, stats, loading, page, search
  - ngOnInit: load roles + stats (parallel)
  - Handlers: onSearch, onPageChange, onDelete

- [ ] **R.5.1** Template:
  - Search bar + filter + clean buttons
  - Table (NOMBRE | PERMISOS | ACCIONES)
  - Pagination
  - Stats cards at bottom

- [ ] **R.6.1** Create `frontend/e2e/roles-list.e2e.ts`:
  - S1: Load list, 5 roles visible
  - S2: Search filters by name
  - S3: Permission badges show counts (48, 32, etc.)
  - S4: Stats cards display (124, 12, 85)
  - S5: Delete works, refreshes

- [ ] **R.7.1** Unit tests:
  - `roles-list.component.spec.ts`
  - `stats-cards.component.spec.ts` (input → output)

- [ ] **R.8.1** Lint, build, test
- [ ] **R.8.2** Verify no regression (D1)

**Total Story Points**: ~12 pts (smaller scope than Users — reuses components)
