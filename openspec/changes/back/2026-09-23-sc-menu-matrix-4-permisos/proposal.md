# Proposal: sc-337 — Menu Matrix 4 Permissions

**Change**: `2026-09-23-sc-menu-matrix-4-permisos`
**Scope**: Backend (NestJS) + Frontend (Angular)
**Date**: 2026-09-23
**Depends on**: migration 0064 (latest applied)
**Story**: SC-337

---

## Intent

Expand `menu_option_roles` from 2 permission columns (`can_read`, `can_write`) to 4
(`can_read`, `can_create`, `can_update`, `can_delete`), giving the admin role matrix full
CRUD granularity per role per menu option.

`can_write` is too coarse to signal individual action availability to UI components (e.g.
a "Crear" button, an "Editar" row action, a "Eliminar" confirm). The 4-column model
maps directly to standard CRUD verbs without inventing a custom encoding.

---

## Scope

### In Scope

- DB: `ALTER TABLE menu_option_roles ADD COLUMN can_create / can_update / can_delete`
  (default false, no backfill needed — existing rows keep all new fields false)
- Backend entity `MenuOptionRoleEntity` — 3 new `@Column` fields
- Backend DTO `SetRoleAccessDto` — 3 new `@IsOptional @IsBoolean` fields
- Backend service — `RoleMatrixEntry` interface + `getRoleMatrix()` mapping +
  `setRoleAccess()` validation rule updated
- Frontend service — `RoleMatrixEntry` and `SetRoleAccessPayload` interfaces extended
- Frontend component `RoleMatrixComponent` — 3 additional checkboxes per role row,
  `accessChanged` output extended to 4 permission fields
- Unit tests for the new validation rule
- E2E scenario: admin sets `can_create` for a role on Departamentos, sidebar unaffected

### Out of Scope

- `PermissionGuard` — uses `roles.permissions` (UUID-based), zero changes
- `MenusService.getAccessibleOptions()` — filters only `can_read`, zero changes
- `menus.service.ts` sidebar logic — unchanged
- Consumer UI components that render action buttons (button visibility is a future
  feature; this change only persists and exposes the permission bits)
- Any other module outside `menus`

---

## Key Decisions

| Decision | Chosen | Rejected alternatives |
|----------|--------|-----------------------|
| New column count | 4 (read, create, update, delete) | 8 (add execute, approve…) — over-engineering |
| Prerequisite rule | `can_create/update/delete` requires `can_read` only | Requiring `can_write` — unnecessary coupling |
| `can_write` fate | Keep as-is (no rename, no deprecation) | Rename to `can_update` — would break existing DB data and consumers |
| Backfill | None — default false | Inherit from `can_write` — would silently grant permissions on upgrade |
| DTO breaking change mitigation | `@IsOptional()` + DB default false | Hard required — breaks callers that haven't been updated yet |

---

## DB Changes

Migration: `database/migrations/0065_menu_option_roles_add_permissions.sql`

```sql
ALTER TABLE menu_option_roles
  ADD COLUMN IF NOT EXISTS can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_update boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false;
```

Rollback: `database/rollback/0065_menu_option_roles_add_permissions.DOWN.sql`

```sql
ALTER TABLE menu_option_roles
  DROP COLUMN IF EXISTS can_create,
  DROP COLUMN IF EXISTS can_update,
  DROP COLUMN IF EXISTS can_delete;
```

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `database/migrations/0065_menu_option_roles_add_permissions.sql` | create | ALTER TABLE + schema_migrations record |
| `database/rollback/0065_menu_option_roles_add_permissions.DOWN.sql` | create | Rollback: DROP COLUMNs |
| `backend/src/modules/menus/entities/menu-option-role.entity.ts` | modify | Add `canCreate`, `canUpdate`, `canDelete` columns |
| `backend/src/modules/menus/dto/set-role-access.dto.ts` | modify | Add 3 optional boolean fields |
| `backend/src/modules/menus/menu-options.service.ts` | modify | `RoleMatrixEntry` + `getRoleMatrix()` + `setRoleAccess()` |
| `frontend/src/app/core/services/menu-option.service.ts` | modify | `RoleMatrixEntry` + `SetRoleAccessPayload` |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.ts` | modify | `accessChanged` output + `toggleAccess()` |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.html` | modify | 3 new checkboxes per role row |
| `backend/src/modules/menus/menu-options.service.spec.ts` | modify | New validation tests |
| `frontend/.../role-matrix.component.spec.ts` | modify | New checkbox rendering + emit tests |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `SetRoleAccessDto` breaking change | Low | `@IsOptional()` + DB default false keeps old callers working |
| DOWN migration removes data | Low | New columns default false — rollback loses only explicitly-set create/update/delete grants |
| Sidebar behavior change | None | `getAccessibleOptions()` queries only `can_read`, unchanged |
| PermissionGuard behavior change | None | Uses `roles.permissions` UUID array, no relation to `menu_option_roles` |
| Cache stale after migration | None | Any `setRoleAccess()` call already invalidates `menu:v1:*` |

---

## Success Criteria

- [ ] `npm run typecheck` clean (backend + frontend)
- [ ] `npm run lint` clean (backend + frontend)
- [ ] `npm test` green (backend unit suite including new validation cases)
- [ ] Admin matrix shows 4 checkboxes per role row
- [ ] PUT with `canCreate: true, canRead: false` → 422
- [ ] PUT with `canCreate: true, canRead: true` → 200, persisted
- [ ] Sidebar unchanged after granting `canCreate` to a role (no new item appears)
- [ ] PermissionGuard unchanged (existing E2E coverage stays green)
