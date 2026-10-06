# Tasks: sc-337 — Menu Matrix 4 Permissions

**Change**: `2026-09-23-sc-menu-matrix-4-permisos`
**Story**: SC-337
**Working dir**: `backend` (backend tasks), `frontend` (frontend tasks)
**Dependency graph**: Tasks 1-2 (DB) → Tasks 3-5 (Backend) → Tasks 6-8 (Frontend) → Tasks 9-10 (Tests)

> **Strict TDD active**. Tests before or alongside implementation.

**400-line budget forecast**:
- Decision needed before apply: No
- Chained PRs recommended: No
- 400-line budget risk: Low (~80-120 lines total across all files)

---

## Phase A — Database

### Task 1 — Migration UP: add 3 columns to menu_option_roles

**File**: `database/migrations/0065_menu_option_roles_add_permissions.sql`

Create with this exact content:

```sql
-- 0065_menu_option_roles_add_permissions.sql
-- sc-337 — expand menu_option_roles from 2 to 5 permission columns.
--
-- Adds can_create, can_update, can_delete (all boolean NOT NULL DEFAULT false).
-- Existing rows default to false — no backfill needed.
-- can_read remains the sole sidebar visibility filter (getAccessibleOptions).
-- can_write is kept as-is (no rename/deprecation at this stage).
--
-- Requires: 0054 (menu_option_roles table creation)
-- DOWN: database/rollback/0065_menu_option_roles_add_permissions.DOWN.sql
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

ALTER TABLE menu_option_roles
  ADD COLUMN IF NOT EXISTS can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_update boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false;

INSERT INTO schema_migrations (version, name, checksum)
VALUES ('0065', '0065_menu_option_roles_add_permissions.sql', 'manual')
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify:
--   \d menu_option_roles
--   expected: can_create, can_update, can_delete columns present with default false
```

- [ ] **1.1** — Write `database/migrations/0065_menu_option_roles_add_permissions.sql` as above
- [ ] **1.2** — Record entry in `database/MIGRATION_LOG.md` (version 0065, date 2026-09-23, description)

---

### Task 2 — Migration DOWN: rollback drops the 3 columns

**File**: `database/rollback/0065_menu_option_roles_add_permissions.DOWN.sql`

```sql
-- 0065_menu_option_roles_add_permissions.DOWN.sql
-- Rollback for 0065: remove can_create, can_update, can_delete.
-- WARNING: Data loss — all can_create/update/delete grants are lost on rollback.

BEGIN;

ALTER TABLE menu_option_roles
  DROP COLUMN IF EXISTS can_create,
  DROP COLUMN IF EXISTS can_update,
  DROP COLUMN IF EXISTS can_delete;

DELETE FROM schema_migrations WHERE version = '0065';

COMMIT;
```

- [ ] **2.1** — Write `database/rollback/0065_menu_option_roles_add_permissions.DOWN.sql` as above

---

## Phase B — Backend

### Task 3 — Entity: add 3 @Column fields to MenuOptionRoleEntity

**File**: `backend/src/modules/menus/entities/menu-option-role.entity.ts`

Add after `canWrite`:

```typescript
@Column({ name: 'can_create', type: 'boolean', default: false })
canCreate!: boolean;

@Column({ name: 'can_update', type: 'boolean', default: false })
canUpdate!: boolean;

@Column({ name: 'can_delete', type: 'boolean', default: false })
canDelete!: boolean;
```

- [ ] **3.1** — Add the 3 columns to the entity

---

### Task 4 — DTO: add 3 optional fields to SetRoleAccessDto

**File**: `backend/src/modules/menus/dto/set-role-access.dto.ts`

Add `@IsOptional` + `@IsBoolean` imports and three new optional fields. Import
`IsOptional` from `class-validator`.

```typescript
import { IsBoolean, IsOptional } from 'class-validator';

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

- [ ] **4.1** — Update `set-role-access.dto.ts` as above

---

### Task 5 — Service: extend RoleMatrixEntry, getRoleMatrix(), setRoleAccess() validation

**File**: `backend/src/modules/menus/menu-options.service.ts`

Three changes:

**5a — RoleMatrixEntry interface** (add 3 fields):

```typescript
export interface RoleMatrixEntry {
  roleId: string;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}
```

**5b — getRoleMatrix() mapping** (extend the `entry` object):

```typescript
const entry: RoleMatrixEntry = {
  roleId: role.id,
  roleName: role.name,
  canRead: access?.canRead ?? false,
  canWrite: access?.canWrite ?? false,
  canCreate: access?.canCreate ?? false,
  canUpdate: access?.canUpdate ?? false,
  canDelete: access?.canDelete ?? false,
};
```

**5c — setRoleAccess() validation** (add prerequisite check after the existing one):

```typescript
// Existing rule:
if (dto.canWrite && !dto.canRead) {
  throw new BadRequestException(
    'can_write requires can_read: you cannot write to something you cannot see',
  );
}
// New rule:
if ((dto.canCreate || dto.canUpdate || dto.canDelete) && !dto.canRead) {
  const field = dto.canCreate ? 'can_create' : dto.canUpdate ? 'can_update' : 'can_delete';
  throw new BadRequestException(
    `${field} requires can_read: you cannot act on something you cannot see`,
  );
}
```

**5d — setRoleAccess() persistence** (extend the create/update block to include 3 new fields):

```typescript
if (access) {
  access.canRead = dto.canRead;
  access.canWrite = dto.canWrite;
  access.canCreate = dto.canCreate ?? false;
  access.canUpdate = dto.canUpdate ?? false;
  access.canDelete = dto.canDelete ?? false;
} else {
  access = this.roleAccessRepo.create({
    menuOptionId: optionId,
    roleId,
    canRead: dto.canRead,
    canWrite: dto.canWrite,
    canCreate: dto.canCreate ?? false,
    canUpdate: dto.canUpdate ?? false,
    canDelete: dto.canDelete ?? false,
  });
}
```

- [ ] **5.1** — Update `RoleMatrixEntry` interface (5a)
- [ ] **5.2** — Update `getRoleMatrix()` mapping (5b)
- [ ] **5.3** — Update `setRoleAccess()` validation (5c)
- [ ] **5.4** — Update `setRoleAccess()` persistence block (5d)

---

## Phase C — Frontend

### Task 6 — Service: extend RoleMatrixEntry and SetRoleAccessPayload interfaces

**File**: `frontend/src/app/core/services/menu-option.service.ts`

Update `RoleMatrixEntry`:

```typescript
export interface RoleMatrixEntry {
  role_id: string;
  role_name: string;
  can_read: boolean;
  can_write: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}
```

Update `SetRoleAccessPayload`:

```typescript
export interface SetRoleAccessPayload {
  canRead: boolean;
  canWrite: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}
```

Update `setRoleAccess()` return type to include 5 booleans:

```typescript
setRoleAccess(
  optionId: string,
  roleId: string,
  payload: SetRoleAccessPayload,
): Observable<{ menuOptionId: string; roleId: string; canRead: boolean; canWrite: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }>
```

- [ ] **6.1** — Update `RoleMatrixEntry` interface (add 3 snake_case fields)
- [ ] **6.2** — Update `SetRoleAccessPayload` interface (add 3 optional camelCase fields)
- [ ] **6.3** — Update `setRoleAccess()` return type

---

### Task 7 — Component TS: extend toggleAccess and accessChanged output

**File**: `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.ts`

Update `accessChanged` output type:

```typescript
readonly accessChanged = output<{
  role_id: string;
  can_read: boolean;
  can_write: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}>();
```

Update `toggleAccess()` to handle all 5 fields with prerequisite guard:

```typescript
toggleAccess(
  roleId: string,
  field: 'can_read' | 'can_write' | 'can_create' | 'can_update' | 'can_delete',
  value: boolean,
): void {
  // ... existing lookup for entry ...
  const newCanRead = field === 'can_read' ? value : entry.can_read;
  let newCanWrite = field === 'can_write' ? value : entry.can_write;
  let newCanCreate = field === 'can_create' ? value : entry.can_create;
  let newCanUpdate = field === 'can_update' ? value : entry.can_update;
  let newCanDelete = field === 'can_delete' ? value : entry.can_delete;

  // Prerequisite: turning Read off clears all downstream permissions
  if (!newCanRead) {
    newCanWrite = false;
    newCanCreate = false;
    newCanUpdate = false;
    newCanDelete = false;
  }

  // Guard: cannot set any CRUD flag to true when can_read is false
  if (!newCanRead && (field === 'can_write' || field === 'can_create' ||
      field === 'can_update' || field === 'can_delete') && value) {
    return;
  }

  this.accessChanged.emit({
    role_id: roleId,
    can_read: newCanRead,
    can_write: newCanWrite,
    can_create: newCanCreate,
    can_update: newCanUpdate,
    can_delete: newCanDelete,
  });
}
```

Update `MenuOptionsComponent.onRoleAccessChange()` to forward all 5 fields:

```typescript
onRoleAccessChange(event: {
  role_id: string;
  can_read: boolean;
  can_write: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}): void {
  // ...
  this.menuOptionService.setRoleAccess(optionId, event.role_id, {
    canRead: event.can_read,
    canWrite: event.can_write,
    canCreate: event.can_create,
    canUpdate: event.can_update,
    canDelete: event.can_delete,
  })
  // ...
}
```

- [ ] **7.1** — Update `accessChanged` output type (5 fields)
- [ ] **7.2** — Update `toggleAccess()` to handle 5 fields with prerequisite guard
- [ ] **7.3** — Update `MenuOptionsComponent.onRoleAccessChange()` to forward 5 fields

---

### Task 8 — Component HTML: add 3 checkboxes per role row

**File**: `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.html`

After the existing "Escritura" `<label>` block, add three more identical blocks for
Crear, Actualizar, Eliminar. Each follows the same disabled/aria pattern as the
existing Escritura checkbox:

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

<!-- Actualizar -->
<label
  class="flex items-center gap-2 text-xs cursor-pointer"
  [class.text-slate-400]="!role.can_read"
  [class.cursor-not-allowed]="!role.can_read"
>
  <input
    type="checkbox"
    [checked]="role.can_update"
    [disabled]="isDisabled() || !role.can_read"
    (change)="toggleAccess(role.role_id, 'can_update', $any($event.target).checked)"
    [attr.aria-label]="'Permiso de actualización para ' + role.role_name"
    class="role-checkbox"
  />
  <span>Actualizar</span>
</label>

<!-- Eliminar -->
<label
  class="flex items-center gap-2 text-xs cursor-pointer"
  [class.text-slate-400]="!role.can_read"
  [class.cursor-not-allowed]="!role.can_read"
>
  <input
    type="checkbox"
    [checked]="role.can_delete"
    [disabled]="isDisabled() || !role.can_read"
    (change)="toggleAccess(role.role_id, 'can_delete', $any($event.target).checked)"
    [attr.aria-label]="'Permiso de eliminación para ' + role.role_name"
    class="role-checkbox"
  />
  <span>Eliminar</span>
</label>
```

- [ ] **8.1** — Add the 3 checkbox blocks after the existing Escritura block

---

## Phase D — Tests

### Task 9 — Backend unit tests: new validation cases

**File**: `backend/src/modules/menus/menu-options.service.spec.ts`

Add a new `describe` block alongside the existing `can_write without can_read` block:

```typescript
describe('can_create/update/delete without can_read validation', () => {
  it('rejects canCreate=true with canRead=false (422)', async () => {
    await expect(
      service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
        canRead: false, canWrite: false, canCreate: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects canUpdate=true with canRead=false (422)', async () => {
    await expect(
      service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
        canRead: false, canWrite: false, canUpdate: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects canDelete=true with canRead=false (422)', async () => {
    await expect(
      service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
        canRead: false, canWrite: false, canDelete: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows canCreate=true with canRead=true (no canWrite required)', async () => {
    roleRepo.findOne.mockResolvedValue(makeRole({ id: ROLE_MASTER_ID }));
    optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
    roleAccessRepo.findOne.mockResolvedValue(null);
    roleAccessRepo.save.mockImplementation((e) => Promise.resolve(e));

    const result = await service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
      canRead: true, canWrite: false, canCreate: true,
    });

    expect(result).toBeDefined();
    expect(result.canCreate).toBe(true);
    expect(result.canWrite).toBe(false);
  });

  it('persists all 5 permission fields when all are true', async () => {
    roleRepo.findOne.mockResolvedValue(makeRole({ id: ROLE_MASTER_ID }));
    optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
    roleAccessRepo.findOne.mockResolvedValue(null);
    roleAccessRepo.save.mockImplementation((e) => Promise.resolve(e));

    const result = await service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
      canRead: true, canWrite: true, canCreate: true, canUpdate: true, canDelete: true,
    });

    expect(result.canRead).toBe(true);
    expect(result.canWrite).toBe(true);
    expect(result.canCreate).toBe(true);
    expect(result.canUpdate).toBe(true);
    expect(result.canDelete).toBe(true);
  });
});
```

Also add to the getRoleMatrix tests a case verifying the 3 new fields are
present with correct defaults:

```typescript
it('includes canCreate/Update/Delete fields, defaulting to false when row absent', async () => {
  optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
  roleRepo.find.mockResolvedValue([makeRole({ id: ROLE_MASTER_ID, scope: 'platform' })]);
  roleAccessRepo.find.mockResolvedValue([]); // no row → all false

  const matrix = await service.getRoleMatrix(OPT_A);

  expect(matrix.platform[0].canCreate).toBe(false);
  expect(matrix.platform[0].canUpdate).toBe(false);
  expect(matrix.platform[0].canDelete).toBe(false);
});
```

- [ ] **9.1** — Add the 3 single-field rejection tests
- [ ] **9.2** — Add the `canCreate without canWrite → 200` test
- [ ] **9.3** — Add the all-5-fields persistence test
- [ ] **9.4** — Add the getRoleMatrix default-false test

---

### Task 10 — Frontend unit tests: checkbox rendering and emit

**File**: `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.spec.ts`

Add tests for:

```typescript
it('renders 5 checkboxes per role row when matrix is loaded', () => {
  fixture.componentRef.setInput('matrix', mockMatrix);
  fixture.detectChanges();
  const checkboxes = fixture.nativeElement.querySelectorAll('.role-checkbox');
  const roleCount = mockMatrix.platform.length + mockMatrix.organization.length + mockMatrix.public.length;
  expect(checkboxes.length).toBe(roleCount * 5);
});

it('disables can_create checkbox when can_read is false', () => {
  const matrixWithReadFalse: RoleMatrix = {
    platform: [{ role_id: 'r1', role_name: 'master', can_read: false, can_write: false,
                 can_create: false, can_update: false, can_delete: false }],
    organization: [],
    public: [],
  };
  fixture.componentRef.setInput('matrix', matrixWithReadFalse);
  fixture.detectChanges();
  const createCheckbox = fixture.nativeElement.querySelector('[aria-label*="creación"]');
  expect(createCheckbox.disabled).toBe(true);
});

it('emits 5 fields when toggleAccess fires for can_create', () => {
  const matrix: RoleMatrix = {
    platform: [{ role_id: 'r1', role_name: 'master', can_read: true, can_write: false,
                 can_create: false, can_update: false, can_delete: false }],
    organization: [],
    public: [],
  };
  fixture.componentRef.setInput('matrix', matrix);
  fixture.detectChanges();
  let emitted: unknown;
  component.accessChanged.subscribe((e) => (emitted = e));

  component.toggleAccess('r1', 'can_create', true);

  expect(emitted).toMatchObject({
    role_id: 'r1',
    can_read: true,
    can_create: true,
    can_write: false,
    can_update: false,
    can_delete: false,
  });
});

it('turning can_read off clears can_create/update/delete in emit', () => {
  const matrix: RoleMatrix = {
    platform: [{ role_id: 'r1', role_name: 'master', can_read: true, can_write: false,
                 can_create: true, can_update: true, can_delete: true }],
    organization: [],
    public: [],
  };
  fixture.componentRef.setInput('matrix', matrix);
  let emitted: unknown;
  component.accessChanged.subscribe((e) => (emitted = e));

  component.toggleAccess('r1', 'can_read', false);

  expect(emitted).toMatchObject({
    can_read: false,
    can_write: false,
    can_create: false,
    can_update: false,
    can_delete: false,
  });
});
```

Note: `mockMatrix` in the spec file needs to be updated to include the 3 new
fields in every entry.

- [ ] **10.1** — Update `mockMatrix` in spec to include `can_create`, `can_update`, `can_delete` (all false)
- [ ] **10.2** — Add "5 checkboxes per role row" rendering test
- [ ] **10.3** — Add "can_create disabled when can_read false" test
- [ ] **10.4** — Add "emits 5 fields" test
- [ ] **10.5** — Add "turning can_read off clears all" test

---

## Verification

```bash
# Backend
cd backend
npm run typecheck
npm run lint
npm test -- --testPathPattern=menu-options.service.spec

# Frontend
cd frontend
npm run typecheck
npm run lint
npm test -- --include="**/role-matrix.component.spec*"
```

All existing tests in `menu-options.service.spec.ts` and
`role-matrix.component.spec.ts` must continue to pass. No regression
on sidebar behavior or PermissionGuard tests.
