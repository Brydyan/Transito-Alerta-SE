# Delta for users-admin — S1: is_active Toggle

## MODIFIED Requirements

### Requirement: Admin Update User

The `PATCH /api/users/:id` endpoint MUST accept `is_active: boolean` when
the caller has the `master` role. The service MUST apply the field to the
target user record and invalidate the permission cache for that user after
a successful update. Self-deactivation MUST be rejected regardless of role.
A non-master caller sending `is_active` MUST have the field silently ignored
(it is not part of their exposed DTO surface).

(Previously: `adminUpdate` did not accept `is_active`; the field was display-only.)

#### Scenario: Master deactivates an active user

- GIVEN a master-role caller authenticated via JWT
- AND a target user with `is_active = true` and `id !== caller.id`
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "is_active": false }`
- THEN the server responds `200 OK`
- AND the target user record has `is_active = false` in the database
- AND the permission cache for the target user is invalidated

#### Scenario: Master reactivates an inactive user

- GIVEN a master-role caller authenticated via JWT
- AND a target user with `is_active = false`
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "is_active": true }`
- THEN the server responds `200 OK`
- AND the target user record has `is_active = true` in the database

#### Scenario: Master attempts to deactivate themselves

- GIVEN a master-role caller authenticated via JWT
- AND the target `id` equals the caller's own `id`
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "is_active": false }`
- THEN the server responds `400` or `403`
- AND the caller's `is_active` value remains unchanged in the database

#### Scenario: Non-master sends is_active field (field ignored)

- GIVEN a caller with a role other than `master` (e.g. `admin_org`) authenticated via JWT
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "is_active": false }`
- THEN the server responds `200 OK` (or appropriate 2xx for partial update)
- AND the target user's `is_active` value is NOT changed
- AND no error is returned for the unexpected field

#### Scenario: Deactivated user attempts to use the API

- GIVEN a user whose `is_active = false`
- WHEN the user sends any authenticated request with a valid JWT
- THEN the server responds `401 Unauthorized`
- AND the response indicates the account is inactive or the session is invalid

#### Scenario: POST /api/users with is_active field in body

- GIVEN a master-role caller creates a new user via `POST /api/users`
- AND the request body includes any value for `is_active`
- WHEN the server processes the request
- THEN the created user record has `is_active = false` (shadow-user pattern enforced)
- AND the supplied `is_active` value is NOT used
