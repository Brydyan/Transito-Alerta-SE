# Design: User Account Status Toggle & Notification Channel Preference

## Technical Approach

Extend the existing `PATCH /api/users/:id` (`adminUpdate`) flow with two new optional fields: `is_active` (boolean toggle) and `preferred_notification_channel` (string preference). The backend already enforces `is_active` at the auth layer (`findAuthContextRow` filters `WHERE is_active = TRUE`), so deactivation takes effect on the next authenticated request. A new migration adds the `preferred_notification_channel` column. The frontend edit form gains a Master-only "Cuenta" section with both controls.

## Architecture Decisions

### D1: is_active in AdminUpdateUserDto

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add `is_active` to existing `AdminUpdateUserDto` | Minimal change, partial-update semantics already in place | **Chosen** |
| Separate `POST /users/:id/deactivate` endpoint | New route, new permission check, more API surface | Rejected — `adminUpdate` already handles partial updates |

**Rationale**: `@IsBoolean() @IsOptional() is_active?: boolean` follows the existing DTO pattern. The field name is snake_case matching other DTO fields (`role_id`, `first_name`).

### D2: Self-deactivation guard

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Guard in controller (pass `req.user.userId` to service) | Requires controller signature change | **Chosen** |
| Guard in service only (service resolves caller somehow) | Service has no access to request context | Rejected |

**Rationale**: The controller already has `@Req() req: AuthenticatedRequest`. Pass `req.user!.userId` as a third argument to `adminUpdate(id, dto, callerId)`. The service throws `ForbiddenException` when `dto.is_active === false && id === callerId`.

### D3: JWT guard behavior on deactivation (verified)

`auth-user.repository.ts:findAuthContextRow` uses `WHERE u.is_active = TRUE`. When `is_active` becomes `false`, `getAuthContextByUserId` returns `null`, and `JwtStrategy.validate` throws `UnauthorizedException`. Combined with `invalidatePermissionCache` (already called at line 510 of `adminUpdate`), the deactivated user's next request fails with 401. No additional work needed — the auth layer already enforces this.

Login is also blocked: `auth.service.ts:156` checks `user.isActive === false`.

### D4: Migration 0033 — preferred_notification_channel

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `VARCHAR(20) DEFAULT 'email' NOT NULL` | Simple, extensible for future channels | **Chosen** |
| PostgreSQL ENUM type | Requires `ALTER TYPE` for new channels, migration friction | Rejected |

### D5: Frontend confirmation dialog for deactivation

Uses the existing `ConfirmDialogService.confirm()` pattern (same as `onDelete` in `users-list.component.ts`). Only deactivation (toggle to `false`) triggers the dialog; reactivation proceeds directly.

### D6: Frontend Master-only visibility

The edit form's "Cuenta" section renders only when `authService.currentUser()?.roleName === 'master'`. Follows the existing `isAdminOrSuperadmin` computed pattern in `user-form.component.ts`.

### D7: Wire format — snake_case on the wire, camelCase in entity

The `SnakeCaseResponseInterceptor` converts entity camelCase to wire snake_case. Frontend `User` interface uses camelCase (`isActive`, `preferredNotificationChannel`) matching the entity shape after response mapping.

## Data Flow

    Frontend (user-form)
         │
         │  PATCH /api/users/:id  { is_active, preferred_notification_channel }
         ▼
    UsersController.adminUpdate(id, dto, callerId)
         │
         ├─ self-deactivation check (id !== callerId)
         ├─ apply is_active to target entity
         ├─ apply preferred_notification_channel to target entity
         ▼
    userRepo.save(target)
         │
         ├─ invalidatePermissionCache (existing)
         │     └─ clears Redis perm:v3:uid:{id}
         ▼
    Next request: JwtStrategy.validate → getAuthContextByUserId
         └─ WHERE is_active = TRUE → 401 if deactivated

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `database/migrations/0033_user_notification_channel.sql` | Create | Add `preferred_notification_channel VARCHAR(20) DEFAULT 'email' NOT NULL` + DOWN |
| `backend/src/modules/users/entities/user.entity.ts` | Modify | Add `preferredNotificationChannel` column mapping |
| `backend/src/modules/users/dto/admin-update-user.dto.ts` | Modify | Add `is_active?: boolean` and `preferred_notification_channel?: string` |
| `backend/src/modules/users/users.service.ts` | Modify | Apply both fields in `adminUpdate`; add self-deactivation guard |
| `backend/src/modules/users/users.controller.ts` | Modify | Pass `req.user!.userId` to `adminUpdate` |
| `frontend/.../models/user.interface.ts` | Modify | Add `preferredNotificationChannel` to `User`; add both fields to `UpdateUserPayload` |
| `frontend/.../user-form/user-form.component.ts` | Modify | Add Cuenta section logic, confirmation dialog, Master-only computed |
| `frontend/.../user-form/user-form.component.html` | Modify | Add Cuenta section with toggle + channel selector |
| `frontend/.../new-user-form/new-user-form.component.html` | Modify | Rename "Estado inicial" label to "Cuenta" |

## Interfaces / Contracts

```sql
-- 0033_user_notification_channel.sql
ALTER TABLE users
  ADD COLUMN preferred_notification_channel VARCHAR(20) NOT NULL DEFAULT 'email';

-- DOWN
ALTER TABLE users DROP COLUMN IF EXISTS preferred_notification_channel;
```

```typescript
// UserEntity addition
@Column({ name: 'preferred_notification_channel', type: 'varchar', length: 20, default: 'email' })
preferredNotificationChannel!: string;

// AdminUpdateUserDto additions
@IsOptional()
@IsBoolean()
is_active?: boolean;

@IsOptional()
@IsIn(['email', 'telegram'])
preferred_notification_channel?: string;

// Frontend User interface addition
preferredNotificationChannel?: string;

// Frontend UpdateUserPayload additions
isActive?: boolean;
preferredNotificationChannel?: string;
```

```typescript
// Service self-deactivation guard (in adminUpdate)
if (dto.is_active === false && id === callerId) {
  throw new ForbiddenException('Cannot deactivate your own account');
}
if (dto.is_active !== undefined) {
  target.isActive = dto.is_active;
}
if (dto.preferred_notification_channel !== undefined) {
  target.preferredNotificationChannel = dto.preferred_notification_channel;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Self-deactivation guard rejects | Mock service test |
| Unit | `is_active` and `preferred_notification_channel` applied to entity | Mock service test |
| Integration | PATCH with `is_active: false` returns updated user, next auth fails | E2E spec |
| Integration | PATCH with `preferred_notification_channel: 'telegram'` persists | E2E spec |
| Migration | 0033 UP + DOWN idempotent | Manual or CI |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

Single migration 0033. Backward-compatible: `DEFAULT 'email'` means existing rows get a sensible default. `is_active` column already exists — no migration needed for it. DOWN drops only the new column.

## Open Questions

- [x] Does JWT guard check `is_active`? **Yes** — `findAuthContextRow` filters `WHERE is_active = TRUE`.
- [ ] UserEntity has a merge conflict marker at line 128 (`<<<<<<< HEAD`) — must be resolved before apply.
