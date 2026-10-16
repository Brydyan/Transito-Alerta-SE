# Spec: user-notification-preference

## Purpose

Stores a user's preferred notification channel (`email` or `telegram`) on the
user record. This is a preference only — no dispatch logic is included in this
change. The column is added via migration 0033.

## Requirements

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
