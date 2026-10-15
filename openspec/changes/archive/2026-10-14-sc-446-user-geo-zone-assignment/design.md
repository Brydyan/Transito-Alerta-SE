# Design: User Geo Zone Assignment (Alcance Territorial)

## Technical Approach

Vertical wiring of `users.geo_zone_id` through the existing admin new-user form. Backend: add column mapping to `UserEntity`, optional DTO field, pass-through in `adminCreate()`. Frontend: inject `GeoZoneService` (already `providedIn: 'root'`), load `getFormData().parents` into a `geoZones` signal, bind the disabled "Alcance Territorial" dropdown. Follows the identical pattern used for `departmentId` (2026-10-11 change).

## Architecture Decisions

| ID | Decision | Alternative rejected | Rationale |
|----|----------|---------------------|-----------|
| D1 | Absorb column into pending migration 0022 (section 7) | New migration 0032 | Server runs all from scratch; 0020-0031 are pending; keeps chain at 31 files. `ADD COLUMN IF NOT EXISTS` for idempotency |
| D2 | `GET /api/geo-zones/form-data` for dropdown data | Extend `GET /api/users/form-data` | Lighter payload (no polygon), `GeoZoneService.getFormData()` already exists, avoids coupling geo catalog to users endpoint |
| D3 | Flat `geoZones` signal, no org filter | `computed` filter by `organization_id` | `geo_zones` table has no `organization_id` FK; filtering is not possible |
| D4 | `geo_zone_id` optional on all roles | Required for sectional roles | No business rule mandates territorial assignment; DB column nullable, DTO `@IsOptional()` |
| D5 | No new permissions | New `geo-zones:ASSIGN` permission | Roles that create users already hold `geo-zones:READ` (migration 0013) |
| D6 | SnakeCaseResponseInterceptor handles casing | Manual casing in DTOs | Follows existing project convention: entity camelCase, wire snake_case |
| D7 | Inject `GeoZoneService` directly into component | Route through `UsersService.getFormData()` | Service is `providedIn: 'root'`; extending users form-data couples geo catalog unnecessarily |
| D8 | "Zona / Sector Operativo" stays disabled | Enable as alias | Different concept (free-text descriptor, not FK); out of scope |

## Data Flow

```
Admin Form Load:
  NewUserFormComponent.ngOnInit()
    |-- UsersService.getFormData()     --> roles, orgs, departments
    |-- GeoZoneService.getFormData()   --> { levels, parents[] }
    |                                      (only parents used)
    v
  geoZones signal <-- parents.map({id, name, code, level})

Admin Form Submit:
  formData.geoZoneId ----> CreateUserJsonPayload.geo_zone_id
    --> POST /api/users { ..., geo_zone_id: uuid|null }
      --> AdminCreateUserDto.geo_zone_id (@IsOptional @IsUUID)
        --> UsersService.adminCreate()
          --> userRepo.create({ ..., geoZoneId })
            --> INSERT users (..., geo_zone_id)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `database/migrations/0022_t7_schema_completeness.sql` | Already done | Section 7: `ADD COLUMN IF NOT EXISTS geo_zone_id` + partial index |
| `database/rollback/0022_t7_schema_completeness.DOWN.sql` | Already done | `DROP COLUMN IF EXISTS geo_zone_id` |
| `backend/src/modules/users/entities/user.entity.ts` | Modify | Add `geoZoneId` column mapping (`@Column`, nullable uuid) |
| `backend/src/modules/users/dto/admin-create-user.dto.ts` | Modify | Add `@IsOptional() @IsUUID() geo_zone_id?: string` |
| `backend/src/modules/users/users.service.ts` | Modify | Pass `dto.geo_zone_id ?? null` to `userRepo.create()` in `adminCreate()` |
| `frontend/.../models/user.interface.ts` | Modify | Add `geoZoneId` to `NewUserFormData`, `DEFAULT_NEW_USER_FORM`, and `geo_zone_id` to `CreateUserJsonPayload` |
| `frontend/.../new-user-form/new-user-form.component.ts` | Modify | Inject `GeoZoneService`, add `geoZones` signal, load in `ngOnInit`, add `onGeoZoneChange()`, wire `geo_zone_id` in submit payload |
| `frontend/.../new-user-form/new-user-form.component.html` | Modify | Enable Alcance Territorial `<select>`, bind `@for` over `geoZones()`, bind change handler |

## Interfaces / Contracts

```typescript
// backend/src/modules/users/entities/user.entity.ts (new column)
@Column({ name: 'geo_zone_id', type: 'uuid', nullable: true, default: null })
geoZoneId!: string | null;

// backend/src/modules/users/dto/admin-create-user.dto.ts (new field)
@IsOptional()
@IsUUID()
geo_zone_id?: string;

// frontend models/user.interface.ts (additions)
interface NewUserFormData {
  // ... existing fields ...
  geoZoneId: string | null;        // new
}

interface CreateUserJsonPayload {
  // ... existing fields ...
  geo_zone_id: string | null;      // new
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `AdminCreateUserDto` accepts/rejects `geo_zone_id` | Extend `admin-create-user.dto.spec.ts`: valid UUID passes, invalid string fails, absent field passes |
| Unit | `adminCreate()` passes `geoZoneId` to entity | Extend `users.service.spec.ts`: verify `userRepo.create()` call includes `geoZoneId` |
| Unit | `NewUserFormComponent` loads geo zones, submits with `geo_zone_id` | Extend `new-user-form.component.spec.ts`: mock `GeoZoneService.getFormData()`, verify signal populated, verify payload shape |

## Threat Matrix

N/A -- no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required beyond what is already in 0022 section 7. Column is nullable with no default constraint; existing users retain `geo_zone_id = NULL`. No feature flag needed; the dropdown simply appears enabled once deployed.

## Open Questions

None -- all decisions are resolved.
