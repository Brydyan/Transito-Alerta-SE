# Design: Departments Menu (Full-Stack CRUD UI + Backend Enrichment)

## Technical Approach

The backend controller, service, repository, module, and DTOs already exist (Phase A-C of `back/2026-09-15-departments-module`). This change adds the **frontend CRUD UI** following the `CategoryListComponent` / `CategoryFormComponent` pattern, enriches the backend `list()` query with `organization_name` + `user_count`, adds the menu-map entry, and registers the routes.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|----------|--------|----------|-----------|
| D1 | Frontend location | `features/catalogs/departments/` | `features/admin/departments/` | Every other catalog (categories, locations, organizations) lives under `catalogs/`; departments is a catalog, not an admin-only section. Routes still use `/app/departamentos` (same level as `/app/categorias`). |
| D2 | Enriched list query | Add `organization_name` + `user_count` in `DepartmentsRepository.list()` via LEFT JOIN | Separate queries per row | Single SQL join is O(1) queries vs O(n). The existing `list()` already does `SELECT ... FROM departments`; adding two JOINs keeps the pattern. |
| D3 | Route path | `/app/departamentos` (sibling of `organizaciones`, `categorias`) | `/app/admin/departments` | Spec says `/app/departamentos`. Catalogs live as direct children of `/app`, not nested under `/app/admin`. Follows `categorias`, `ubicaciones` precedent. |
| D4 | Debounce timing | 400ms (spec requirement) | 300ms (CategoryList uses 300ms) | Spec explicitly requires 400ms. Departments has fewer records than categories, so the slightly longer debounce reduces unnecessary calls. |
| D5 | Page size options | `[10, 20, 50]` (spec) | `[5, 10, 20]` (CategoryList) | Spec says 10/20/50. Backend `MAX_PAGE_SIZE = 100` accommodates all three. |
| D6 | Menu group placement | Group `CATÁLOGOS`, order 95 | Group `GESTION` | Departments is a catalog entity. Positioned between Categorias (90) and Ubicaciones (100) — after categories, before locations. |
| D7 | Duplicate name error | `409 ConflictException` | `400 BadRequestException` (current service code) | Spec requires 409 for duplicates. The service currently throws `BadRequestException` for this case; change to `ConflictException` to match spec. |
| D8 | Delete response | `200 { id, deleted_at }` (spec) | `204 No Content` (current controller) | Spec says `200 { id, deleted_at }`. Current controller uses `@HttpCode(204)` + `Promise<void>`. Change to return the deleted row with `deleted_at`. |
| D9 | Organization column visibility | Hide via `AuthService.currentUser().roleName` check | Server-side flag | Admin_org users only see their own org; showing the column is noise. Use client-side role check (`roleName !== 'master' && roleName !== 'operador_sistema'`), same as the backend `GLOBAL_ROLES` set. |

## Data Flow

```
Browser                     Angular                      NestJS                     PostgreSQL
  |                            |                            |                            |
  |-- navigate /departamentos->|                            |                            |
  |                            |-- GET /api/departments --->|                            |
  |                            |   ?page=1&perPage=10       |-- enriched SELECT -------->|
  |                            |                            |   d.*, o.name, COUNT(u.id) |
  |                            |<-- { items, total } -------|<-- rows -------------------|
  |<-- render table -----------|                            |                            |
  |                            |                            |                            |
  |-- click New -------------->|                            |                            |
  |                            |-- POST /api/departments -->|                            |
  |                            |   { name, description,     |-- INSERT + SELECT -------->|
  |                            |     organization_id }      |                            |
  |                            |<-- 201 { dept } -----------|<-- enriched row -----------|
  |<-- toast + redirect -------|                            |                            |
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/app/features/catalogs/departments/interfaces/idepartment.interface.ts` | Create | `IDepartment`, `ICreateDepartmentDto`, `IUpdateDepartmentDto`, `IDepartmentListParams`, `IDepartmentListResult` |
| `frontend/src/app/features/catalogs/departments/services/department.service.ts` | Create | `DepartmentService` — `list()`, `getById()`, `create()`, `update()`, `remove()` via `HttpService` |
| `frontend/src/app/features/catalogs/departments/department-list/department-list.component.ts` | Create | Signal-based list with 400ms debounce, pagination 10/20/50, delete confirm |
| `frontend/src/app/features/catalogs/departments/department-list/department-list.component.html` | Create | Table: Name, Description, Organization (D9: hidden for admin_org), Users, Created, Actions |
| `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts` | Create | Reactive form: name (required, max 255), description (optional, max 500), handles create/edit via `:id` param |
| `frontend/src/app/features/catalogs/departments/department-form/department-form.component.html` | Create | Form fields + validation errors + dirty-form guard |
| `frontend/src/app/app.routes.ts` | Modify | Add `departamentos` route tree (list, new, :id/edit) with `permissionGuard` |
| `backend/src/modules/menus/menu-map.ts` | Modify | Add `Departamentos` entry: route `/departamentos`, requires `READ departments`, group `CATALOGOS`, order 95 |
| `backend/src/modules/departments/departments.repository.ts` | Modify | Enrich `list()` SELECT with LEFT JOIN organizations + LEFT JOIN users for `organization_name` and `user_count`. Add `EnrichedDepartmentRow` interface. Return enriched rows. |
| `backend/src/modules/departments/departments.service.ts` | Modify | Change duplicate-name error from `BadRequestException` to `ConflictException` (D7) |
| `backend/src/modules/departments/departments.controller.ts` | Modify | Change `@Delete` from 204/void to 200 returning `{ id, deleted_at }` (D8) |

## Interfaces / Contracts

### Frontend — `IDepartment` (wire format, snake_case)

```typescript
export interface IDepartment {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  organization_name: string;   // enriched via JOIN
  user_count: number;           // enriched via COUNT
  created_at: string;
  updated_at: string;
}
```

### Backend — Enriched list query shape

```sql
SELECT d.id, d.name, d.description, d.organization_id,
       d.created_at, d.updated_at, d.deleted_at,
       o.name AS organization_name,
       COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) AS user_count
  FROM departments d
  LEFT JOIN organizations o ON o.id = d.organization_id
  LEFT JOIN users u ON u.department_id = d.id AND u.deleted_at IS NULL
 WHERE d.deleted_at IS NULL
   AND d.organization_id = $1
   [AND d.name ILIKE $2]
 GROUP BY d.id, o.name
 ORDER BY d.name ASC
 LIMIT $N OFFSET $M
```

### Backend — `EnrichedDepartmentRow` (extends `DepartmentRow`)

```typescript
export interface EnrichedDepartmentRow extends DepartmentRow {
  organization_name: string;
  user_count: number;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `DepartmentsService` — ConflictException on duplicate name | Jest mock of `DepartmentsRepository` |
| Unit | `DepartmentService` (frontend) — HTTP calls with correct params | `HttpService` spy |
| Unit | `DepartmentListComponent` — search debounce, pagination, delete flow | `TestBed` + signal assertions |
| Unit | `DepartmentFormComponent` — validation, create vs edit mode, dirty guard | `TestBed` + `ReactiveFormsModule` |
| Integration | `DepartmentsController` — enriched list with org_name + user_count | Existing controller spec pattern (mock service) |
| Integration | Menu-map — `Departamentos` entry present, gated by `READ departments` | Existing `menu-map.spec.ts` pattern |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No new migrations required. Migrations 0056 (departments table) and 0057 (permission catalog) are already applied on the current branch. The enriched query uses existing indexes (`idx_departments_org_deleted`, `idx_users_department`).

## Open Questions

- None. All decisions are grounded in existing codebase patterns and spec requirements.
