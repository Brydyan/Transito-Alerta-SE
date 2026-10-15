# Proposal: User Geo Zone Assignment (Alcance Territorial)

## Intent

The admin new-user form (mock 03-02) includes an "Alcance Territorial" section with a canton/parroquia dropdown, currently disabled with a "Disponible en F7" tooltip. The DB column `users.geo_zone_id` already exists (migration 0022, section 7). This change wires the full vertical: backend entity/DTO/service and frontend form UI, so admins can optionally assign a geo zone jurisdiction when creating a user.

## Scope

### In Scope
- Backend entity: add `geoZoneId` column mapping to `user.entity.ts`
- Backend DTO: add optional `geo_zone_id` to `AdminCreateUserDto`
- Backend service: pass `geo_zone_id` through `adminCreate()`
- Frontend interfaces: extend `NewUserFormData`, `CreateUserJsonPayload`, `DEFAULT_NEW_USER_FORM`
- Frontend component: inject `GeoZoneService`, load parents, wire dropdown
- Frontend template: enable the "Alcance Territorial" select, bind `@for` loop

### Out of Scope
- "Zona / Sector Operativo" text input (different concept, stays disabled)
- Geo zone filtering by organization (no FK exists)
- New permissions (all user-creating roles already hold `geo-zones:READ`)
- Editing geo zone on existing users (future scope)
- Geo zone cascade effects on incident visibility

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `admin-user-creation-form`: enable the Alcance Territorial dropdown (was disabled for F7)
- `admin-user-creation-form-backend`: accept and persist optional `geo_zone_id`

## Approach

Follow existing form patterns: `GeoZoneService.getFormData().parents` provides `{ id, name, code, level }` without polygon data. Load in `loadFormData()` into a `geoZones` signal. The dropdown uses the flat list directly (no org-based filtering). Backend adds one nullable UUID column mapping and one optional DTO field. The `adminCreate()` method passes it through to the entity insert, matching the existing `organizationId`/`departmentId` pattern.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/users/entities/user.entity.ts` | Modified | Add `geoZoneId` column |
| `backend/src/modules/users/dto/admin-create-user.dto.ts` | Modified | Add optional `geo_zone_id` |
| `backend/src/modules/users/users.service.ts` | Modified | Pass `geo_zone_id` in `adminCreate()` |
| `frontend/.../interfaces/user.interface.ts` | Modified | Extend form/payload types |
| `frontend/.../new-user-form.component.ts` | Modified | Inject service, load geo zones, add handler |
| `frontend/.../new-user-form.component.html` | Modified | Enable dropdown, wire data binding |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale geo zone ID submitted after zone deletion | Low | FK `ON DELETE SET NULL` already handles this |
| Large geo zone list slows form load | Low | `getFormData().parents` excludes polygons; list is bounded |

## Rollback Plan

Revert the 7 file changes. The DB column persists harmlessly as nullable; no data migration needed. Existing users unaffected (column defaults to NULL).

## Dependencies

- Migration 0022 section 7 (`users.geo_zone_id`) — already applied
- `GeoZoneService.getFormData()` — already implemented

## Success Criteria

- [ ] Admin can select a geo zone from the dropdown when creating a user
- [ ] Submitting with a geo zone persists `users.geo_zone_id` in the database
- [ ] Submitting without a geo zone leaves `geo_zone_id` as NULL
- [ ] "Zona / Sector Operativo" input remains disabled
- [ ] Existing user creation (without geo zone) continues working unchanged
