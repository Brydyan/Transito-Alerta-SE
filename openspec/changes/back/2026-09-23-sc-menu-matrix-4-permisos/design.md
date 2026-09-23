# Design: sc-337 — Menu Matrix 4 Permissions

**Change**: `2026-09-23-sc-menu-matrix-4-permisos`
**Date**: 2026-09-23

---

## Architecture Decisions

### D1 — Schema change: additive ALTER TABLE, default false, no backfill

Three new nullable-false boolean columns are added to `menu_option_roles` with
`DEFAULT false`. No backfill is needed: existing rows correctly default to
`can_create = false`, `can_update = false`, `can_delete = false`, which represents
"this role had no CRUD granularity configured before this migration". Admins will
explicitly grant the new bits as needed.

`can_write` is kept as-is. Renaming it to `can_update` would break existing data and
every consumer. Deprecation is deferred to a future decision.

```sql
-- 0065_menu_option_roles_add_permissions.sql
BEGIN;

ALTER TABLE menu_option_roles
  ADD COLUMN IF NOT EXISTS can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_update boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false;

INSERT INTO schema_migrations (version, name, checksum)
VALUES ('0065', '0065_menu_option_roles_add_permissions.sql', 'manual')
ON CONFLICT DO NOTHING;

COMMIT;
```

The composite PK `(menu_option_id, role_id)` is unchanged. No new index is
needed: the existing PK covers the only access pattern (single-row lookup by
both keys).

---

### D2 — DTO validation: @IsOptional with explicit default false in DB

`SetRoleAccessDto` adds three optional fields. This keeps the change backward-
compatible: callers that do not send the new fields get `false` from the DB
default. Callers that send them get the explicit value.

Contract example:

```typescript
// backend/src/modules/menus/dto/set-role-access.dto.ts
export class SetRoleAccessDto {
  @IsBoolean()
  canRead!: boolean;

  @IsBoolean()
  canWrite!: boolean;

  @IsOptional()
  @IsBoolean()
  canCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  canUpdate?: boolean;

  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;
}
```

Validation rule in `setRoleAccess()`:
1. Existing: `dto.canWrite && !dto.canRead` → 422 "can_write requires can_read"
2. New: `(dto.canCreate || dto.canUpdate || dto.canDelete) && !dto.canRead`
   → 422 "can_create/can_update/can_delete requires can_read"
   (single check, message names the first offending field)

Note: `can_create/update/delete` do NOT require `can_write`. Only `can_read` is
the prerequisite. This keeps the permission model flat and predictable.

---

### D3 — RoleMatrixEntry interface: add 3 fields, backward-compatible spread

Backend interface `RoleMatrixEntry` adds `canCreate`, `canUpdate`, `canDelete`.
The `getRoleMatrix()` mapping uses `access?.canCreate ?? false` (same pattern as
existing `canRead`/`canWrite`) so any row absent from `menu_option_roles` still
gets `false` for all fields.

Frontend interface `RoleMatrixEntry` adds `can_create`, `can_update`, `can_delete`
in snake_case (matching the global `SnakeCaseResponseInterceptor` wire shape).

Contract example:

```typescript
// frontend/src/app/core/services/menu-option.service.ts
export interface RoleMatrixEntry {
  role_id: string;
  role_name: string;
  can_read: boolean;
  can_write: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export interface SetRoleAccessPayload {
  canRead: boolean;
  canWrite: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}
```

---

### D4 — Frontend component: 4 new checkboxes, prerequisite mirrored client-side

`RoleMatrixComponent.toggleAccess()` is extended to handle
`'can_create' | 'can_update' | 'can_delete'` fields alongside the existing
`'can_read' | 'can_write'`.

Client-side guard mirrors the server rule: turning `can_read` off forces all
four downstream fields to `false`. Enabling `can_create/update/delete` is
prevented when `can_read` is false (checkbox disabled via `[disabled]` binding,
same pattern as the existing `can_write` checkbox).

The `accessChanged` output emits 5 fields:

```typescript
// Contract shape
output<{
  role_id: string;
  can_read: boolean;
  can_write: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}>()
```

`MenuOptionsComponent.onRoleAccessChange()` forwards all 5 fields to
`MenuOptionService.setRoleAccess()`.

Template pattern for the three new checkboxes (mirrors the existing `can_write`
checkbox disabled/aria pattern):

```html
<!-- Crear -->
<label
  class="flex items-center gap-2 text-xs cursor-pointer"
  [class.text-slate-400]="!role.can_read"
  [class.cursor-not-allowed]="!role.can_read"
>
  <input
    type="checkbox"
    [checked]="role.can_create"
    [disabled]="isDisabled() || !role.can_read"
    (change)="toggleAccess(role.role_id, 'can_create', $any($event.target).checked)"
    [attr.aria-label]="'Permiso de creación para ' + role.role_name"
    class="role-checkbox"
  />
  <span>Crear</span>
</label>
<!-- Actualizar and Eliminar follow the same pattern -->
```

---

### D5 — Cache invalidation: no changes

`setRoleAccess()` already calls `this.menusService.invalidateCache()` which
flushes `menu:v1:*` keys via `redis.keys('menu:v1:*')` + `redis.del(...)`.
This covers the new columns automatically — no change needed.

`getAccessibleOptions()` queries `mor.can_read = true` via a raw query builder
join. Adding columns to the table does not affect this query — no change needed.

---

### D6 — PermissionGuard and MenusService: zero changes

`PermissionGuard` checks `roles.permissions` (a JSONB UUID array on the `roles`
table). It has no relation to `menu_option_roles`. No change.

`MenusService.getAccessibleOptions()` joins `menu_option_roles` on
`mor.can_read = true`. It never reads `can_write`, `can_create`, `can_update`,
or `can_delete`. No change.

---

## Data Flow

```
PUT /api/menu-options/:id/roles/:roleId
  body: { canRead, canWrite, canCreate?, canUpdate?, canDelete? }
    ↓
  SetRoleAccessDto (validation)
    ↓
  setRoleAccess() — prerequisite guard
    ↓
  MenuOptionRoleEntity.save()
    ↓
  menusService.invalidateCache()   ← flushes menu:v1:* only

GET /api/menu-options/:id/roles
  ↓
  getRoleMatrix() — reads 5 fields via ORM
    ↓
  RoleMatrixEntry { canRead, canWrite, canCreate, canUpdate, canDelete }
    ↓ (SnakeCaseResponseInterceptor)
  { can_read, can_write, can_create, can_update, can_delete }

[Sidebar path — UNCHANGED]
getMenuForUser()
  ↓
  getAccessibleOptions() — WHERE mor.can_read = true
  (new columns not read here)
```
