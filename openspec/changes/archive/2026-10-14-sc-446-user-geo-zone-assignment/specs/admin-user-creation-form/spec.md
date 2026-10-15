# Delta for Admin — User Creation Form (Frontend)

## MODIFIED Requirements

### Requirement: Geographic Location Fields (OUT OF SCOPE F7)

The system MUST render the "Cantón / Parroquia Asignada" select populated
from `GeoZoneService.getFormData().parents` and allow the admin to optionally
pick one geo zone. The "Zona / Sector Operativo" text input MUST remain
disabled (different concept, future scope).

(Reason: Promote from F7 to F6: "Cantón / Parroquia Asignada" (Geo Zone Assignment) is now enabled and functional; "Zona / Sector Operativo" remains disabled.)

#### Scenario: Geo zone dropdown loads on form open

- GIVEN the admin navigates to `/app/admin/usuarios/new`
- WHEN the form finishes initializing
- THEN `GET /api/geo-zones/form-data` is called
- AND the "Cantón / Parroquia Asignada" select is enabled and populated with
  the returned parent geo zones (`{ id, name, code, level }`)
- AND the "Zona / Sector Operativo" input remains disabled

#### Scenario: Admin selects a geo zone

- GIVEN the "Cantón / Parroquia Asignada" dropdown has entries loaded
- WHEN the admin selects one entry (e.g. "Quito")
- THEN the form state reflects `geoZoneId = <selected-uuid>`
- AND the selected entry is visually highlighted in the dropdown

#### Scenario: Admin leaves geo zone unselected

- GIVEN the dropdown is shown with the default placeholder
- WHEN the admin submits the form without selecting a geo zone
- THEN the form submits with `geo_zone_id: null` in the payload
- AND no validation error is shown (field is optional)

#### Scenario: Geo zone list fails to load

- GIVEN `GET /api/geo-zones/form-data` returns 5xx
- WHEN the form finishes initializing
- THEN the "Cantón / Parroquia Asignada" select remains empty
- AND form submission is NOT blocked (geo zone is optional)
- AND an inline warning MAY be shown on the geo zone section

#### Scenario: Zona / Sector Operativo stays disabled

- GIVEN the form is fully loaded including a populated geo zone dropdown
- WHEN the admin interacts with the "Zona / Sector Operativo" input
- THEN the input is disabled (no interaction is possible)

## ADDED Requirements

### Requirement: Geo Zone Included in Create User Payload

The system MUST include `geo_zone_id` in the `POST /api/users` payload when
a geo zone is selected, and MUST send `geo_zone_id: null` (or omit the field)
when no geo zone is selected.

#### Scenario: Payload includes geo_zone_id when selected

- GIVEN the admin has filled all required fields and selected a geo zone
- WHEN the admin clicks "Guardar Usuario"
- THEN `POST /api/users` is called with `geo_zone_id: "<uuid>"` in the body
- AND the server returns 201
- AND the user is created with that geo zone assigned

#### Scenario: Payload omits or nulls geo_zone_id when not selected

- GIVEN the admin has filled all required fields and left geo zone unselected
- WHEN the admin clicks "Guardar Usuario"
- THEN `POST /api/users` is called with `geo_zone_id: null` or without the field
- AND the server returns 201
- AND the user is created with `geo_zone_id = NULL`
