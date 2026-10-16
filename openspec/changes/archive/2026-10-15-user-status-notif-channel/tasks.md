# Tasks: User Account Status Toggle & Notification Channel Preference

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180–220 (migration, entity, DTO, service, controller, 2 frontend components, tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All backend + frontend + tests | PR 1 | `cd backend && npm test && npm run test:e2e` | `PATCH /api/users/:id` with `is_active`/`preferred_notification_channel` | Revert service/DTO/controller/entity changes + run 0033 DOWN |

---

## Phase 1: Infrastructure (Migration + Entity)

- [x] 1.1 Create `database/migrations/0033_user_notification_channel.sql` with `ALTER TABLE users ADD COLUMN preferred_notification_channel VARCHAR(20) NOT NULL DEFAULT 'email';` and embedded `-- DOWN` block with `ALTER TABLE users DROP COLUMN IF EXISTS preferred_notification_channel;`
- [x] 1.2 Add entry for migration `0033` to `database/MIGRATION_LOG.md` (read-only reference: `database/migrations/` for numbering context)
- [x] 1.3 Add `@Column({ name: 'preferred_notification_channel', type: 'varchar', length: 20, default: 'email' }) preferredNotificationChannel!: string;` to `backend/src/modules/users/entities/user.entity.ts`

## Phase 2: Backend — DTO & Service & Controller

- [x] 2.1 **RED** — Write failing unit test in `backend/src/modules/users/users.service.spec.ts`: self-deactivation call throws `ForbiddenException` when `dto.is_active === false && id === callerId`
- [x] 2.2 Add `@IsOptional() @IsBoolean() is_active?: boolean;` and `@IsOptional() @IsIn(['email', 'telegram']) preferred_notification_channel?: string;` to `backend/src/modules/users/dto/admin-update-user.dto.ts`
- [x] 2.3 **GREEN** — Update `adminUpdate(id, dto, callerId, callerRole)` signature in `backend/src/modules/users/users.service.ts`: add self-deactivation guard (`ForbiddenException`), apply `dto.is_active` to `target.isActive` (Master-only), apply `dto.preferred_notification_channel` to `target.preferredNotificationChannel`
- [x] 2.4 Update `adminUpdate()` call in `backend/src/modules/users/users.controller.ts` to pass `req.user!.userId` AND `req.user!.roleName` to match the new 4-arg service signature

## Phase 3: Frontend

- [x] 3.1 Add `isActive?: boolean` and `preferredNotificationChannel?: string` to both `User` interface and `UpdateUserPayload` type in `frontend/src/app/features/users/models/user.interface.ts`
- [x] 3.2 Add Master-only `isMaster` computed signal, `ConfirmDialogService` injection, and `onToggleActive()` handler (opens confirmation dialog on deactivation, calls `PATCH` only on confirm) to `frontend/src/app/features/users/user-form/user-form.component.ts`
- [x] 3.3 Add "Cuenta" section to `frontend/src/app/features/users/user-form/user-form.component.html`: active/inactive toggle (rendered only when `isMaster()`), notification channel selector `email|telegram` (rendered only when `isMaster()`)
- [x] 3.4 Rename "Estado inicial" → "Cuenta" in `frontend/src/app/features/users/new-user-form/new-user-form.component.html` (label-only, no behavior change)

## Phase 4: Tests

- [x] 4.1 **RED** — Write failing e2e test in `backend/test/` (or existing users e2e spec): Master deactivates user → 200 + `is_active = false` in DB
- [x] 4.2 **GREEN** — Verify e2e test passes after Phase 2 changes are in place
- [x] 4.3 **RED** — Write failing e2e test: Master attempts self-deactivation → 403
- [x] 4.4 **GREEN** — Verify self-deactivation e2e test passes
- [x] 4.5 **RED** — Write failing e2e test: `PATCH` with `preferred_notification_channel: 'telegram'` → 200 + persisted value
- [x] 4.6 **GREEN** — Verify notification channel e2e test passes
- [x] 4.7 **RED** — Write failing e2e test: `PATCH` with `preferred_notification_channel: 'sms'` → 400 validation error
- [x] 4.8 **GREEN** — Verify invalid channel rejection test passes
- [x] 4.9 Run full suite: `cd backend && npm test && npm run test:e2e && npm run lint && npm run typecheck`
