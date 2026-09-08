# Tasks: F6 Roles Redesign

> Estado sincronizado con `apply-progress.md` tras el fix batch de
> `fixes-required.md` (C.1). Las desviaciones puntuales están anotadas
> inline; el detalle completo vive en `apply-progress.md`.

- [x] **R.1.1** Create folder `frontend/src/app/features/admin/roles/`
  — El path YA EXISTÍA; no se crea nuevo. La implementación reescribe
  los archivos del path existente.
- [x] **R.1.2** Generate RolesListComponent — **Desviación**: se
  reescribe `roles.component.ts` en el mismo archivo (mismo nombre de
  clase, mismo route), no se crea `roles-list/` aparte.
- [x] **R.1.3** Generate StatsCardsComponent (new) — 3 tarjetas con
  tokens de F0, 4 unit tests.
- [x] **R.1.4** Reuse SearchBarComponent, UiTableComponent,
  ActionMenuComponent from Users
  — SearchBar y ActionMenu reusados de `users-list/components/`.
  UiTable reusado de F0.

- [x] **R.2.1** Create `models/role.model.ts` (Role, RoleStats)
  — Extendido en `models/role-permission.interface.ts` (no archivo
  nuevo): `RoleStats` interface + opcionales en `RoleListItem`.
- [x] **R.2.2** Add RoleService:
  - `getRoles(page, limit, search)`
  - `deleteRole(id)`
  - `getRoleStats()`
  — **Desviación**: la clase es `RolesService` (plural) extendiendo
  el existente, no `RoleService` nuevo.
- [x] **R.2.3** Unit test service — `roles.service.spec.ts` dedicado
  con HttpTestingController (6 tests).

- [x] **R.3.1** Implement StatsCardsComponent:
  - Input: stats { totalPermissions, protectedModules, assignedUsers }
  - Display 3 cards via `auto-fit, minmax(15rem, 1fr)`
  - Large numbers (1.75rem, font-variant-numeric: tabular-nums)
  - 4 unit tests

- [x] **R.4.1** Implement RolesListComponent:
  - Signals: roles, stats, loading, currentPage, searchTerm, etc.
  - ngOnInit: load roles + stats (en paralelo, no forkJoin)
  - Handlers: onSearch (local), onPageChange, onView, onEdit, onDelete
  - 11 unit tests
  - D7: sin `*hasPermission`
  - **Desviación**: sin `forkJoin` — dos `subscribe` separados con
  `catchError` per-fuente (D5 más claro).

- [x] **R.5.1** Template:
  - Search bar (app-search-bar)
  - Table 3-col (NOMBRE | PERMISOS | ACCIONES)
  - Pagination (app-pagination)
  - Stats cards al pie (app-stats-cards)
  - Error banner con retry + table-skeleton mientras carga
  - Permission badge: gris con número tabular-nums
  - "Sistema" badge para roles built-in

- [x] **R.6.1** Create `frontend/e2e/roles-list.e2e.ts`:
  - S1-S5: lista, búsqueda, badges, stats, delete
  - 5 specs; skipean sin `BASE_URL`+`E2E_PASSWORD` (D4).

- [x] **R.7.1** Unit tests:
  - `roles.component.spec.ts` — 11 tests
  - `stats-cards.component.spec.ts` — 4 tests
  - `roles.service.spec.ts` — 6 tests

- [x] **R.8.1** Lint, build, test
  — `pnpm run lint`: 0 errors, 65 warnings preexistentes.
  `pnpm test`: 69/69 suites, 481/481 tests. `pnpm run build`:
  verde.
- [x] **R.8.2** Verify no regression (D1)
  — `roles.component.spec.ts` actualizado con mocks de los nuevos
  servicios inyectados; la aserción `expect(component).toBeTruthy()`
  se preserva. Sin regresión en otros specs.

**Total Story Points**: ~12 pts (reusa componentes de la fase
`usuarios-redesign`).

---

## Fix batch aplicado (`fixes-required.md`, post sdd-verify)

- **C.1** `tasks.md` — 14/14 marcadas `[x]`, desviaciones anotadas
  inline.
- **C.2** `apply-progress.md` — restaurado (se había escrito pero
  el commit original lo omitió por sync del filesystem; este
  batch lo re-incluye).
- **W.1** S3 unit test — el conteo de permisos se verifica en
  `roles.component.spec.ts` con un test específico que renderiza
  la tabla y cuenta `.permission-badge`.
- **W.2** `roles.service.spec.ts` dedicado — 6 tests con
  `HttpTestingController`: `getRoles` (envía params), `getRoles`
  sin search, `getRoles` aplana envelope, `getRoleStats` (flattena
  envelope), fallback a ceros, `deleteRole`.
- **W.3** `design.md` — sección "Search Strategy" agregada (search
  hybrid local + param); decisiones nuevas documentadas (sin
  forkJoin, RolesService extendido).
- **W.4** no aplicado — la spec original no tiene un botón
  "Limpiar" separado (search tiene su propio clear).
- **S.1/S.2** parcialmente — S.2 cubierto en design.md
  (decisiones). S.1 no aplicado (la label la renderiza
  `app-pagination` primitivo).
