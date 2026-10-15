# Delta for Admin User Creation — Backend Enhancements

## MODIFIED Requirements

### Requirement: Geolocation Fields Rejected (F7+)

The DTO MUST accept the optional `geo_zone_id` (UUID) field and pass it
through `adminCreate()`. All other geographic field names (`canton`,
`parroquia`, `zona`, `geo_*` except `geo_zone_id`) MUST still be rejected.

(Previously: all geo-related fields including `geo_zone_id` were rejected;
the column existed in the DB but the DTO blocked it)

#### Scenario: geo_zone_id valid UUID is accepted

- GIVEN a POST to `/api/users` with `{ email, geo_zone_id: "<valid-uuid>" }`
- WHEN `AdminCreateUserDto` validates the payload
- THEN validation passes
- AND the service persists `users.geo_zone_id = "<valid-uuid>"`

#### Scenario: geo_zone_id null is accepted

- GIVEN a POST to `/api/users` with `{ email, geo_zone_id: null }`
- WHEN `AdminCreateUserDto` validates the payload
- THEN validation passes
- AND the service persists `users.geo_zone_id = NULL`

#### Scenario: geo_zone_id absent defaults to null

- GIVEN a POST to `/api/users` with `{ email }` and no `geo_zone_id` field
- WHEN `AdminCreateUserDto` validates the payload
- THEN validation passes
- AND the service persists `users.geo_zone_id = NULL`
  (backward compatible with existing callers)

#### Scenario: geo_zone_id non-UUID string is rejected

- GIVEN a POST to `/api/users` with `{ email, geo_zone_id: "not-a-uuid" }`
- WHEN `AdminCreateUserDto` validates the payload
- THEN validation fails with 400 and message containing "geo_zone_id must be
  a UUID"

#### Scenario: canton / parroquia / zona still rejected

- GIVEN a POST to `/api/users` with `{ email, canton: "Guayaquil" }`
- WHEN the DTO is validated
- THEN `canton` is stripped silently (whitelist: true)
- AND the user is created without that data

## ADDED Requirements

### Requirement: adminCreate Persists geo_zone_id

The service MUST persist `dto.geo_zone_id` in `users.geo_zone_id` when the
field is present, following the existing `organizationId` / `departmentId`
pass-through pattern. No existence check is required on create (FK
`ON DELETE SET NULL` covers stale references).

#### Scenario: User created with geo_zone_id

- GIVEN `adminCreate({ email, geo_zone_id: "<uuid>" })`
- WHEN the service executes
- THEN `user.geoZoneId = "<uuid>"`
- AND the response serializes `geo_zone_id: "<uuid>"`

#### Scenario: User created without geo_zone_id

- GIVEN `adminCreate({ email })` with no `geo_zone_id`
- WHEN the service executes
- THEN `user.geoZoneId = null`
- AND the response serializes `geo_zone_id: null`
- AND existing behavior for `phone`, `role_id`, `organization_id` is unchanged
