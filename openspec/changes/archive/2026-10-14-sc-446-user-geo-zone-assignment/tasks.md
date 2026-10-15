# Tasks: User Geo Zone Assignment (Alcance Territorial)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120–160 (6 files, surgical additions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend entity + DTO + service | Single PR | `rtk jest --testPathPattern=admin-create-user.dto\|users.service` | `POST /api/users` with geo_zone_id via curl/Postman | Revert 3 backend files; column stays nullable, no data lost |
| 2 | Frontend interfaces + component + template | Single PR | `rtk jest --testPathPattern=new-user-form.component` | Admin form at `/app/admin/usuarios/new`, select geo zone, submit | Revert 3 frontend files; form reverts to disabled state |

---

## Phase 1: Backend Foundation

- [x] 1.1 `backend/src/modules/users/entities/user.entity.ts` — add `@Column({ name: 'geo_zone_id', type: 'uuid', nullable: true, default: null }) geoZoneId!: string | null`
- [x] 1.2 `backend/src/modules/users/dto/admin-create-user.dto.ts` — add `@IsOptional() @IsUUID() geo_zone_id?: string`
- [x] 1.3 `backend/src/modules/users/users.service.ts` — in `adminCreate()`, pass `geoZoneId: dto.geo_zone_id ?? null` to `userRepo.create()` following the `organizationId`/`departmentId` pattern

## Phase 2: Frontend Foundation

- [x] 2.1 `frontend/src/app/features/admin/users/interfaces/user.interface.ts` — add `geoZoneId: string | null` to `NewUserFormData`, `geo_zone_id: string | null` to `CreateUserJsonPayload`, `geoZoneId: null` to `DEFAULT_NEW_USER_FORM`

## Phase 3: Frontend Core Implementation

- [x] 3.1 `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` — inject `GeoZoneService` (already `providedIn: 'root'`), declare `geoZones = signal<GeoZoneFormItem[]>([])`
- [x] 3.2 `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` — in `loadFormData()`, call `GeoZoneService.getFormData()` and assign `.parents` to `geoZones` signal (parallel with existing `UsersService.getFormData()` call)
- [x] 3.3 `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` — add `onGeoZoneChange(id: string | null)` handler that sets `formData.geoZoneId`
- [x] 3.4 `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` — include `geo_zone_id: this.formData.geoZoneId` in the submit payload mapped to `CreateUserJsonPayload`
- [x] 3.5 `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html` — remove `disabled` attribute and `title="Disponible en F7"` from the "Cantón / Parroquia Asignada" `<select>`, add `@for` loop over `geoZones()`, bind `[value]`, `(change)="onGeoZoneChange($event.target.value)"`, and keep `[disabled]` bound to `geoZones().length === 0`
- [x] 3.6 `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html` — confirm "Zona / Sector Operativo" input keeps its `disabled` attribute untouched

## Phase 4: Tests (TDD — RED then GREEN)

- [x] 4.1 RED — `backend/src/modules/users/dto/admin-create-user.dto.spec.ts`: write failing tests: valid UUID passes, `null` passes, absent field passes, non-UUID string fails with "geo_zone_id must be a UUID"
- [x] 4.2 GREEN — ensure 1.2 makes 4.1 tests pass
- [x] 4.3 RED — `backend/src/modules/users/users.service.spec.ts`: write failing test that `userRepo.create()` is called with `geoZoneId: '<uuid>'` when DTO includes `geo_zone_id`, and with `geoZoneId: null` when absent
- [x] 4.4 GREEN — ensure 1.3 makes 4.3 tests pass
- [x] 4.5 RED — `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.spec.ts`: write failing tests: `GeoZoneService.getFormData()` is called on init; `geoZones` signal is populated from `.parents`; submit payload includes `geo_zone_id: '<uuid>'` when selected; submit payload includes `geo_zone_id: null` when unselected; "Zona / Sector Operativo" input remains disabled
- [x] 4.6 GREEN — ensure phases 2–3 make 4.5 tests pass

## Phase 5: Verification

- [x] 5.1 Run `rtk jest --testPathPattern=admin-create-user.dto` — all scenarios from spec `admin-user-creation-form-backend` pass (7/7)
- [x] 5.2 Run `rtk jest --testPathPattern=users.service` — `adminCreate` geo zone pass-through scenarios pass (40/40)
- [x] 5.3 Run `rtk jest --testPathPattern=new-user-form.component` — all frontend scenarios pass (52/52)
- [ ] 5.4 Manual smoke: open `/app/admin/usuarios/new`, confirm geo zone dropdown is enabled and populated, select one, submit — verify `users.geo_zone_id` is set in DB
- [ ] 5.5 Manual smoke: submit without selecting geo zone — verify `users.geo_zone_id` is NULL and no error shown
- [ ] 5.6 Confirm "Zona / Sector Operativo" input remains disabled after all changes
