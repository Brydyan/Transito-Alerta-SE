# Proposal: User Account Status Toggle & Notification Channel Preference

## Intent

Admin users (Master role) cannot deactivate or reactivate staff accounts from the UI -- `is_active` is display-only. Additionally, there is no way to record a user's preferred notification channel for post-account system notifications. This change adds both capabilities to the admin user-edit form and the backend update endpoint, with a supporting migration for the new column.

## Scope

### In Scope
- Add `is_active?: boolean` to `AdminUpdateUserDto` and apply it in `adminUpdate()` -- Master role only
- Add `preferred_notification_channel` column to `users` table (migration 0033)
- Add `preferred_notification_channel?: 'email' | 'telegram'` to `AdminUpdateUserDto` and apply it in `adminUpdate()`
- Map new column in `UserEntity`
- Frontend: add active/inactive toggle and notification channel selector to user edit form (Master-only visibility)
- Frontend: rename "Estado inicial" label to "Cuenta" in new-user-form (label-only, no behavior change)
- Confirmation warning when toggling `is_active: false` (active sessions invalidated on next request)

### Out of Scope
- Changing `adminCreate()` behavior -- `isActive: false` MUST remain (shadow-user pattern is load-bearing for invitation flow)
- Telegram invitation for new users (bot cannot initiate; deep-link in email is the current correct approach)
- Actual notification dispatch logic (future work -- this only stores the preference)
- Self-service channel preference (citizen/reporter profile -- separate feature)

## Capabilities

### New Capabilities
- `user-notification-preference`: Stores and exposes `preferred_notification_channel` on user records

### Modified Capabilities
- `users-admin`: `adminUpdate` accepts `is_active` (Master-only toggle) and `preferred_notification_channel`
- `admin-user-creation-form`: Label rename "Estado inicial" to "Cuenta"; edit view gains active toggle and channel selector

## Approach

**D1 -- `is_active` toggle via existing `adminUpdate` endpoint.** The `PATCH /api/users/:id` route already requires `UPDATE users` permission via `@RequirePermission('UPDATE')`. No new permission is needed. The service will accept `is_active` from the DTO and apply it. Master-only enforcement happens at the frontend (form visibility) and optionally with a role check in the service for defense-in-depth.
- *Alternative rejected*: Separate endpoint (`POST /users/:id/deactivate`) -- unnecessary complexity; `adminUpdate` already handles partial updates.

**D2 -- `adminCreate` remains unchanged.** `isActive: false` is hardcoded because `findByClaimedEmail` in InvitationsService treats `is_active=true` as "claimed", returning 409. Exposing `is_active` in create would break the invitation flow.

**D3 -- New migration 0033 for `preferred_notification_channel`.** `VARCHAR(20) DEFAULT 'email'`, nullable. Aligns with existing `notificationChannel: 'email'` literal in the frontend interface.
- *Alternative rejected*: Enum type -- VARCHAR is simpler, consistent with other string columns in the schema, and avoids migration friction for future channel additions.

**D4 -- Frontend Master-only gating.** The toggle and channel selector render only when the authenticated user's role is `master`. Uses existing `*hasPermission` directive or direct role check in the component.

**D5 -- Session invalidation warning.** When toggling `is_active: false`, a confirmation dialog warns that active sessions will be invalidated. `adminUpdate` already calls `invalidatePermissionCache`, which handles cache busting. The JWT guard's next check against `is_active=false` will reject the session.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/migrations/0033_*.sql` | New | Add `preferred_notification_channel` column |
| `backend/src/modules/users/entities/user.entity.ts` | Modified | Map `preferredNotificationChannel` |
| `backend/src/modules/users/dto/admin-update-user.dto.ts` | Modified | Add `is_active`, `preferred_notification_channel` |
| `backend/src/modules/users/users.service.ts` | Modified | Apply both fields in `adminUpdate()` |
| `frontend/.../users/models/user.interface.ts` | Modified | Add `preferredNotificationChannel` to `User` |
| `frontend/.../users/user-form/` | Modified | Add toggle + channel selector (edit view, Master-only) |
| `frontend/.../users/new-user-form/` | Modified | Rename label only |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Master accidentally deactivates themselves | Low | Service rejects self-deactivation (guard: `target.id !== caller.id`) |
| Shadow-user pattern broken by exposing `is_active` in create | None | `adminCreate` is explicitly out of scope; DTO does not change |
| Migration 0033 number collision | Low | Verify latest migration number before creating |
| `preferred_notification_channel` unused until dispatch logic exists | Accepted | Storing preference now avoids a future migration; UI communicates it is a preference only |

## Rollback Plan

1. Revert backend DTO/service changes (remove `is_active` and `preferred_notification_channel` from `AdminUpdateUserDto` and `adminUpdate`)
2. Revert frontend form changes
3. Run `0033.DOWN.sql` to drop the `preferred_notification_channel` column
4. No data loss -- `is_active` column already exists; only the new column is dropped

## Dependencies

- `adminUpdate` controller must keep `@RequirePermission('UPDATE')` (verified: line 122 of `users.controller.ts`)
- `invalidatePermissionCache` must continue to be called after update (verified: line 510 of `users.service.ts`)
- JWT auth guard must check `is_active` on token validation (verify during spec phase)

## Success Criteria

- [ ] `PATCH /api/users/:id` with `{ is_active: false }` deactivates the target user
- [ ] `PATCH /api/users/:id` with `{ is_active: true }` reactivates the target user
- [ ] `POST /api/users` still hardcodes `isActive: false` (shadow-user pattern preserved)
- [ ] `PATCH /api/users/:id` with `{ preferred_notification_channel: 'telegram' }` persists the preference
- [ ] Migration 0033 applies and rolls back cleanly
- [ ] Frontend edit form shows active toggle and channel selector for Master role only
- [ ] Frontend edit form hides both controls for non-Master roles
- [ ] Deactivation toggle shows confirmation warning
- [ ] Label "Estado inicial" renamed to "Cuenta" in new-user-form
