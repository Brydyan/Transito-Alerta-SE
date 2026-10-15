# Archive Report — 2026-10-14-sc-446-user-geo-zone-assignment

**Archived:** 2026-10-14
**Verdict:** PASS WITH WARNINGS → W1 fixed before archive
**Ticket:** sc-446 (follow-up deliverable)

## What was delivered

- `users.geo_zone_id uuid NULL REFERENCES geo_zones(id) ON DELETE SET NULL` — absorbed as section 7 into existing pending migration `0022_t7_schema_completeness.sql`. No new migration file.
- Backend: `UserEntity.geoZoneId`, `AdminCreateUserDto.geo_zone_id`, `UsersService.adminCreate()` pass-through.
- Frontend: `NewUserFormData.geoZoneId`, `CreateUserJsonPayload.geo_zone_id`, `GeoZoneService` injected into `NewUserFormComponent`, canton/parroquia select enabled with `@for` loop over `geoZones()` signal.
- "Zona / Sector Operativo" input intentionally left disabled (different concept, out of scope).

## Test results at archive

| Suite | Tests | Result |
|-------|-------|--------|
| backend users.service + dto | 56 | PASS |
| frontend new-user-form | 57 | PASS |
| backend typecheck | — | ok |
| frontend build | — | ok |

## Post-verify fix

W1 — `geoZoneId` added to `isFormDirty` computed in `new-user-form.component.ts:152`.

## Open follow-ups

- S1: Silent GeoZoneService failure — dropdown stays empty with no user message. Non-blocking; deferred to a future iteration.
- "Estado inicial" select: still `disabled`. Requires `users.status` column + invitation flow integration. Separate SDD.
- "Canal de notificaciones preferido" select: still `disabled`. Requires `notification_channel` preference on users. Separate SDD.
