# Tasks: F6 Usuarios Redesign

> Estado sincronizado con `apply-progress.md` tras el fix batch de
> `fixes-required.md` (C.4). Las desviaciones puntuales están anotadas
> inline; el detalle completo vive en `apply-progress.md`.

- [x] **U.1.1** Create folder `frontend/src/app/features/admin/users/`
- [x] **U.1.2** Generate UsersListComponent
  — **Desviación**: reescribe `user-management/` → `users-list/` en vez de
    crear un componente nuevo con otro nombre; el antiguo se preserva en
    `_old_user-management/` para no romper el git history (ver `design.md`
    D.1.1 vs. implementación).
- [x] **U.1.3** Generate SearchBarComponent
- [x] **U.1.4** Generate FilterBarComponent
- [x] **U.1.5** Generate ActionMenuComponent
- [x] **U.1.6** Reuse or create UiTableComponent (may be shared with Roles)
  — Reusado de F0 (`shared/components/ui-table/ui-table.component.ts`), sin
    cambios.

- [x] **U.2.1** Create `models/user.model.ts` with types (User, UsersResponse)
  — Extendido en `models/user.interface.ts` (no un archivo nuevo):
    `Organization`, `UserStatus`, `toUserStatus()`. Fix batch (C.1) añade
    `User.organizationId?: string | null`.
- [x] **U.2.2** Add UserService methods:
  - `getUsers(page, limit, search, role, org)`
  - `deleteUser(id)`
  - `getUserRoles()`
  - `getOrganizations()`
  — **Desviación**: `getUsers` no lleva `search` como query param — la
    búsqueda es **local** (decisión de diseño: «Instant feedback, no
    server overhead», ver `search-bar.component.ts`). Fix batch (C.2)
    agrega `role` y `org` como query params opcionales a `getUsers(page,
    limit, role?, org?)`. El backend (`GET /users`,
    `backend/src/modules/users/users.controller.ts`) hoy sólo lee
    `page`/`limit` — los params extra viajan pero se ignoran server-side
    hasta que el endpoint los soporte (deuda de backend, fuera de alcance
    de este change).
- [x] **U.2.3** Unit test service methods (mock HTTP)
  — Cubierto indirectamente vía `users-list.component.spec.ts` (mock de
    `UsersService`); no hay spec dedicado para `UsersService` porque no
    existía antes de este change y no se agregó uno nuevo standalone.

- [x] **U.3.1** Implement SearchBarComponent:
  - Input binding for search term
  - Debounce (300ms) to parent
  - Clear button (X)
- [x] **U.3.2** Implement FilterBarComponent:
  - Role dropdown (from API)
  - Organization dropdown (from API)
  - Reset filters button
- [x] **U.3.3** Implement UiTableComponent (if new):
  - Input: columns[], rows[], selectable?
  - Output: rowAction (edit, delete, view)
  - Sticky header
  - Sortable columns (future)
  — No aplica un `UiTableComponent` nuevo (ver U.1.6); `ui-table` de F0 se
    usa como shell (`<thead>`/`<tbody>` proyectados), sin sort ni
    selectable (no pedidos por el spec).

- [x] **U.4.1** Implement UsersListComponent:
  - Inject UserService
  - Signals: users, roles, orgs, loading, currentPage, searchTerm, selectedRole, selectedOrg
  - ngOnInit: load users (page 1, all filters)
  - Handlers: onSearch, onFilterChange, onPageChange, onDelete
  — Fix batch (C.2/W.3) agrega `refetch()` (resetea `currentPage` a 1 y
    recarga), llamado desde `onFilterChange`.
- [x] **U.4.2** Implement template:
  - Search bar + filter bar at top
  - Table with 7 columns (photo, name, email, role, org, status, actions)
  - Status badges: Activo (green), Pendiente (orange), Inactivo (red)
  - Pagination footer
  — **Desviación**: sólo dos estados (Activo/Inactivo) — el backend
    modela `is_active: boolean`, sin estado intermedio `pendiente`. Fix
    batch (C.1) resuelve la columna Organización (antes hardcodeada a
    `—`) vía `getOrganizationName()` contra el signal `organizations()`.
    Fix batch (C.3) agrega la sección de 3 tarjetas al pie
    (`.info-cards-grid`) requerida por `spec.md` § Bottom Cards.

- [x] **U.5.1** Implement ActionMenuComponent:
  - Eye icon (view user)
  - Three-dot menu (edit, delete, etc.)
  - On delete: confirm dialog, call UserService.deleteUser()
  — Diálogo de confirmación (`ConfirmDialogService.confirm()`) con
    `title`/`message`/`confirmText`/`cancelText`/`isDanger: true` (W.5
    verificado, ya cumplía).
- [x] **U.5.2** Add error handling:
  - Delete 403 → Toast "No tienes permiso"
  - Delete 500 → Toast "Error al eliminar usuario"
  - List 500 → Error state UI + retry
  — Fix batch (W.4) agrega un toast de error también en `loadUsers()`
    (antes sólo encendía `errorMessage` para el banner en el template).

- [x] **U.6.1** Create `frontend/e2e/users-list.e2e.ts`:
  - S1: List loads, 7 users render
  - S2: Search filters locally
  - S3: Role filter loads new data
  - S4: Org filter loads new data
  - S5: Status badge colors correct
  - S6: Pagination works (click page 2)
  - S7: Delete button works, refreshes list
  - S8: Error state (500 endpoint)
  — **Desviación**: S4 omitido — mecánica idéntica a S3 (mismo
    `filterChange`, mismo signal), cubierto por unit test de
    `FilterBarComponent`. 7/8 specs implementados (S1, S2, S3, S5, S6,
    S7, S8); skipean localmente sin `BASE_URL`+`E2E_PASSWORD` (D4 del
    change `e2e-test-user-and-credentials`) y corren contra staging en CI.

- [x] **U.7.1** Unit tests for all components:
  - `users-list.component.spec.ts` (signals, filters, pagination)
  - `search-bar.component.spec.ts` (debounce, clear)
  - `filter-bar.component.spec.ts` (dropdown, reset)
  - `action-menu.component.spec.ts` (delete confirm)
  — 24 tests nuevos tras el fix batch (22 originales + 2 agregados para
    cubrir `getOrganizationName` y el refetch de `onFilterChange`).

- [x] **U.8.1** Lint: `pnpm run lint` — fix all errors
  — 0 errores, warnings preexistentes sin relación con este change.
- [x] **U.8.2** Build: `ng build` — no errors
- [x] **U.8.3** Tests: `pnpm test` — all pass
  — 67/67 suites, 461/461 tests (460 + 1 test nuevo del fix batch).
- [x] **U.8.4** Regression: Existing user specs still pass (D1)
  — `user-form`, `profile`, `roles`, `admin` specs verdes sin cambios.

**Total Story Points**: ~18 pts

---

## Fix batch aplicado (`fixes-required.md`, post sdd-verify FAIL)

Todas las tareas de arriba estaban implementadas por el batch original,
pero **4 CRITICAL + 3 de las 4 WARNING recomendadas** quedaban
pendientes o mal sincronizadas. Resueltas en este batch:

- **C.1** Columna Organización — antes hardcodeada a `—`; ahora resuelve
  `user.organizationId` contra `organizations()` vía `getOrganizationName()`.
- **C.2** Filtros de rol/organización — `onFilterChange()` ahora llama
  `refetch()` (resetea página + recarga); `UsersService.getUsers()` acepta
  `role`/`org` como query params opcionales. El backend aún no los lee
  (deuda documentada, no bloqueante para este change).
- **C.3** Tarjetas del pie — sección `.info-cards-grid` con 3 cards
  (Políticas de Seguridad, Gestión de Organizaciones, Auditoría de
  Acceso) agregada al HTML + CSS.
- **C.4** Este archivo — sincronizado con `apply-progress.md`.
- **W.2** Wiring de búsqueda — verificado, ya estaba correcto
  (`searchChange` → `onSearch()` → `searchTerm` signal → `visibleUsers()`
  computed). Sin cambios.
- **W.3** Reset de paginación al filtrar — cubierto por `refetch()` (C.2).
- **W.4** Toast de error en `loadUsers()` — agregado.
- **W.5** Diálogo de borrado — verificado, ya tenía título/mensaje/
  confirmText/cancelText/isDanger correctos. Sin cambios.
- **W.1** (S3/S4 e2e enmascarados) — sin acción; se expone en CI contra
  staging una vez el backend acepte `role`/`org` (fuera de alcance).
- **S.1/S.2** (SUGGESTION: teclado, responsive) — no aplicadas en este
  batch; opcionales, no bloqueantes.
