# Apply progress — F6 Roles Redesign

**Change**: `2026-09-08-f6-roles-redesign`
**Branch**: `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil`
**Commits**: `4c7415d` (implementación) → `9bfb3f7` (fixes v1) → `f6d9a40` (fixes v2)

> **Estado del archivo:** esta es la versión restaurada del
> `apply-progress.md` — el commit `9bfb3f7` incluyó una copia
> corrupta del archivo (un mensaje de error de `git show` que se
> redirigió a stderr cuando se restauró desde un commit que no
> lo contenía). El contenido real de la implementación está en
> `tasks.md` y en el diff de los commits; este archivo los
> consolida en una vista legible.

## Implementation Summary

`RolesListComponent` rediseñado (mismo path, mismo nombre de
clase, mismo route — `frontend/src/app/features/admin/roles/roles.component.{ts,html,css}`):

- **`ui-page-header`** + **`app-search-bar`** (reusado de
  `users-list/components/`) + **`ui-table`** (F0) +
  **`app-pagination`** (F0) + **`app-stats-cards`** (nuevo) +
  **`app-empty-state`** (F0) + **`app-table-skeleton`** (F0).
- 3 columnas en `ui-table`: NOMBRE | PERMISOS | ACCIONES. Mock 04-01
  cumplido: 5 roles, badges de permisos con conteo del backend, 3
  stats cards al pie.
- **Signals**: `roles`, `stats`, `total`, `isLoading`,
  `errorMessage`, `currentPage`, `pageSize`, `searchTerm`. Computed
  `visibleRoles` (filtro local, case-insensitive) y `pageRange`.
- **Carga paralela en `ngOnInit`**: `loadRoles()` + `loadStats()`.
  Cada uno con su propio `catchError` (D5: la falla de un endpoint
  no aborta al otro). **No `forkJoin`** — la spec lo mencionaba
  pero la implementación opta por dos `subscribe` separados porque
  la resiliencia per-fuente es más clara con menos código.
- **Handlers**: `onSearch` (refetch + reset a página 1), `onPageChange`,
  `onView` (a `/app/admin/roles/:id`), `onEdit` (a
  `/app/admin/roles/:id/edit`), `onDelete` (ConfirmDialogService
  con `isDanger: true` + 403 → toast específico).
- **D7**: sin `*hasPermission` (universal para admins).

**`StatsCardsComponent`** (nuevo):
- 3 tarjetas: Total Permisos, Módulos Protegidos, Usuarios Asignados.
- Tokens de F0 (`--color-brand-primary-soft`, `--color-slate-600`).
- 4 unit tests (render, orden, labels, reactividad).

## Service — `RolesService` (extendido, no `RoleService` nuevo)

`frontend/src/app/features/admin/roles/services/roles.service.ts`:

- `getRoles(page=1, limit=25, search?)` — antes: sin params. Ahora
  acepta page/limit/search opcionales, flattena envelope
  `{ data, meta }` a `RoleListItem[]`.
- `getRoleStats()` — nuevo. `GET /api/roles/stats` con fallback a
  ceros (D5) si la respuesta no trae `data`.
- `deleteRole(id)` — nuevo. `DELETE /api/roles/{id}` con
  `withCredentials`.

## Verification Status

See `verify-report.md` for sdd-verify coverage details.

Para auditar los cambios:
- `git show 4c7415d` — implementación original (R.1-R.7).
- `git show 9bfb3f7` — fix batch v1 (C.1, C.2, W.1, W.2, W.3).
- `git show f6d9a40` — fix batch v2 (este commit, restaura
  `apply-progress.md` y limpia el conteo de tasks).

## Test Results

| Test suite | Count | Status |
|------------|-------|--------|
| `roles.component.spec.ts` | 11 | ✅ PASS |
| `stats-cards.component.spec.ts` | 4 | ✅ PASS |
| `roles.service.spec.ts` | 6 | ✅ PASS |
| **Total unit** | **21** | **✅ PASS** |
| Full repo (pnpm test) | 481 | ✅ PASS |
| Build (pnpm run build) | — | ✅ PASS |
| Lint (pnpm run lint) | — | ✅ 0 errors, 65 preexistentes |
| E2E (playwright test roles-list) | 5 | ⚠️ SKIP (sin `BASE_URL`+`E2E_PASSWORD`) |

## Pendientes fuera de alcance

- `/api/roles/stats` endpoint no existe en el backend.
- Backend `getRoles` no acepta `search` query param.
- Ruta `/app/admin/roles/:id` no implementada.
- Stats cards sin `*hasPermission`-gated (D7).
- S.1 (pagination label) N/A.
