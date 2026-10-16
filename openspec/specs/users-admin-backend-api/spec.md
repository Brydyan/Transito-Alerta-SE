# Spec: Users Admin — Backend API

> **Scope**: Backend API endpoints for admin user management  
> **Endpoints affected**: `PATCH /api/users/:id` (adminUpdate)

---

## Purpose

Specification for the backend API endpoints used by admin user management features.
This includes the `PATCH /api/users/:id` (adminUpdate) endpoint and related requirements.

---

## Requirements

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

## Purpose

Stores a user's preferred notification channel (`email` or `telegram`) on the
user record. This is a preference only — no dispatch logic is included in this
change. The column is added via migration 0033.

### Requirement: Persist Preferred Notification Channel

The system MUST store a `preferred_notification_channel` field on each user
record with the allowed values `'email'` and `'telegram'`. The field MUST
default to `'email'` at the database level. The `PATCH /api/users/:id`
endpoint MUST accept and persist the field when supplied.

#### Scenario: Master sets preferred_notification_channel to telegram

- GIVEN a master-role caller authenticated via JWT
- AND a target user identified by `:id`
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "preferred_notification_channel": "telegram" }`
- THEN the server responds `200 OK`
- AND the target user record has `preferred_notification_channel = 'telegram'` in the database

#### Scenario: Master sets preferred_notification_channel to email

- GIVEN a master-role caller authenticated via JWT
- AND a target user with `preferred_notification_channel = 'telegram'`
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "preferred_notification_channel": "email" }`
- THEN the server responds `200 OK`
- AND the target user record has `preferred_notification_channel = 'email'` in the database

#### Scenario: Invalid channel value is rejected

- GIVEN any authenticated caller
- WHEN the caller sends `PATCH /api/users/:id` with body `{ "preferred_notification_channel": "sms" }`
- THEN the server responds `400 Bad Request`
- AND the response body contains a validation error identifying `preferred_notification_channel` as invalid

#### Scenario: Field absent from PATCH body leaves value unchanged

- GIVEN a target user with `preferred_notification_channel = 'telegram'`
- WHEN the caller sends `PATCH /api/users/:id` with a body that does not include `preferred_notification_channel`
- THEN the server responds `200 OK`
- AND the target user record still has `preferred_notification_channel = 'telegram'`

### Requirement: Migration 0033 Adds Column

The system MUST include a reversible SQL migration (0033) that adds the
`preferred_notification_channel` column (`VARCHAR(20) DEFAULT 'email'`,
nullable) to the `users` table. The migration MUST include a `.DOWN.sql`
that drops the column.

#### Scenario: Migration applies cleanly

- GIVEN the database is at migration 0032
- WHEN migration 0033 is applied
- THEN the `users` table has a `preferred_notification_channel` column
- AND existing rows have the column value `'email'` (default)

#### Scenario: Migration rolls back cleanly

- GIVEN the database is at migration 0033
- WHEN the 0033 DOWN migration is applied
- THEN the `preferred_notification_channel` column is removed from `users`
- AND no other columns or data are affected
