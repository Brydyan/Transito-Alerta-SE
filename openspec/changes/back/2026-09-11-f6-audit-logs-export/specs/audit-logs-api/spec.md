# Audit Logs API Specification

## Purpose

Define the read layer for `audit_events`: paginated list endpoint, filter support,
CSV export, and the RBAC permission (`READ audit-logs`) that gates both endpoints.
The write/record layer is covered by `openspec/specs/audit-trail/spec.md`; this
spec adds only reading capability.

---

## Requirements

### Requirement: Audit Logs List Endpoint

The system MUST expose `GET /api/audit-logs` returning a paginated list of audit
events. The endpoint MUST require the `READ audit-logs` permission and MUST be
protected by both `JwtAuthGuard` and `PermissionGuard`.

Response shape MUST be `{ items: AuditLogItem[], total: number }` where each item
includes `id`, `actor_id`, `actor_name`, `action`, `resource_type`, `resource_id`,
`justification`, `metadata`, and `created_at`.

#### Scenario: Successful list for authorized user

- GIVEN an authenticated `master` user with `READ audit-logs` permission
- WHEN `GET /api/audit-logs` is called with no filters
- THEN the response status is 200
- AND the body contains `{ items: [...], total: N }` with `items.length <= 20`
- AND each item contains `actor_name` resolved from the `users` table

#### Scenario: Default pagination

- GIVEN no `page` or `limit` query params
- WHEN `GET /api/audit-logs` is called
- THEN `page` defaults to 1 and `limit` defaults to 20
- AND only the first 20 records are returned

#### Scenario: Custom pagination within bounds

- GIVEN `?page=2&limit=50`
- WHEN `GET /api/audit-logs` is called
- THEN records 51–100 are returned (if they exist)
- AND `limit` is capped at 100; a request for `limit=200` returns at most 100 items

#### Scenario: Permission denied

- GIVEN an authenticated user whose role does NOT include `READ audit-logs`
- WHEN `GET /api/audit-logs` is called
- THEN the response status is 403
- AND the body contains no audit data

#### Scenario: Unauthenticated request

- GIVEN a request with no valid JWT
- WHEN `GET /api/audit-logs` is called
- THEN the response status is 401

---

### Requirement: Audit Logs Filter Support

The list endpoint MUST narrow results when any of the following optional query
parameters are present: `date_from` (ISO 8601), `date_to` (ISO 8601), `actor_id`
(UUID), `action` (string), `resource_type` (string). Filters are applied with AND
logic. The `total` field in the response MUST reflect the filtered count, not the
full table count.

#### Scenario: Date range filter narrows results

- GIVEN audit events spanning multiple days
- WHEN `?date_from=2026-09-01T00:00:00Z&date_to=2026-09-01T23:59:59Z` is applied
- THEN only events with `created_at` between those bounds are returned
- AND `total` reflects the filtered count

#### Scenario: Actor filter narrows results

- GIVEN multiple actors with audit events
- WHEN `?actor_id=<uuid>` is applied
- THEN only events where `actor_id` equals the given UUID are returned

#### Scenario: Action filter narrows results

- GIVEN events with different `action` values
- WHEN `?action=REVEAL` is applied
- THEN only events with `action = 'REVEAL'` are returned

#### Scenario: Combined filters are ANDed

- GIVEN `?actor_id=<uuid>&date_from=<ts>&action=REVEAL`
- WHEN the request is made
- THEN only events matching ALL three conditions are returned

#### Scenario: Filter with no matching records

- GIVEN a `date_from`/`date_to` window that contains no events
- WHEN the request is made
- THEN the response is 200 with `{ items: [], total: 0 }`

---

### Requirement: CSV Export Endpoint

The system MUST expose `GET /api/audit-logs/export.csv` that returns all matching
audit events in CSV format. The endpoint MUST accept the same filter params as the
list endpoint. The response MUST use `Content-Type: text/csv` and
`Content-Disposition: attachment; filename="audit-logs-{YYYY-MM-DD}.csv"`.
The export MUST be capped at 10,000 rows; when the filtered result set exceeds
this cap, the response MUST include only the first 10,000 rows ordered by
`created_at ASC` and MUST NOT return an error.

CSV columns (in order): `id`, `actor_id`, `actor_name`, `action`, `resource_type`,
`resource_id`, `justification`, `created_at`.

#### Scenario: Successful export

- GIVEN an authenticated `master` user with `READ audit-logs`
- WHEN `GET /api/audit-logs/export.csv` is called with no filters
- THEN the response status is 200
- AND `Content-Type` is `text/csv`
- AND `Content-Disposition` contains `attachment; filename="audit-logs-`
- AND the body is a valid CSV with a header row matching the defined column order

#### Scenario: Filters apply to export

- GIVEN `?date_from=<ts>&date_to=<ts>` query params
- WHEN the export endpoint is called
- THEN only events within the date range appear in the CSV

#### Scenario: 10,000-row cap

- GIVEN a dataset with more than 10,000 matching events
- WHEN the export endpoint is called
- THEN the CSV contains exactly 10,000 rows (excluding header)
- AND no error is returned; the response is 200

#### Scenario: Export permission denied

- GIVEN an authenticated user without `READ audit-logs`
- WHEN `GET /api/audit-logs/export.csv` is called
- THEN the response status is 403

---

### Requirement: READ audit-logs Permission

Migration 0053 MUST insert the permission `(resource='audit-logs', action='READ')`
into the `permissions` table. It MUST grant this permission to the `master` role by
updating `roles.permissions`. It MUST denormalize the grant to `users.permissions`
for all active `master` users and MUST bump `permission_version` to invalidate
`perm:v3:uid:*` Redis cache entries.

#### Scenario: Permission row exists after migration

- GIVEN migration 0053 has been applied
- WHEN `SELECT * FROM permissions WHERE resource='audit-logs' AND action='READ'` is run
- THEN exactly one row exists

#### Scenario: Master role includes permission

- GIVEN migration 0053 has been applied
- WHEN the `master` role's `permissions` JSONB is inspected
- THEN it contains the `audit-logs / READ` permission ID

#### Scenario: Active master users have denormalized permission

- GIVEN an active `master` user existing before migration 0053
- WHEN migration 0053 is applied
- THEN `users.permissions` for that user includes the `audit-logs / READ` ID
- AND `users.permission_version` is incremented by 1

#### Scenario: Redis cache invalidated without re-login

- GIVEN a `master` user with an active session before migration 0053
- WHEN migration 0053 is applied and the user makes a subsequent API request
- THEN the request sees the new `READ audit-logs` permission without requiring re-login

#### Scenario: Idempotent migration

- GIVEN migration 0053 is run twice
- WHEN `ON CONFLICT (resource, action) DO NOTHING` applies
- THEN no duplicate rows are inserted into `permissions`

---

### Requirement: AuditModule Registered in AppModule

`AuditModule` MUST import `AuditController` and be imported by `AppModule` so that
`GET /api/audit-logs` and `GET /api/audit-logs/export.csv` are reachable. Until
this registration exists, both routes return 404 regardless of auth or permissions.

#### Scenario: Endpoints reachable after registration

- GIVEN `AuditModule` imported in `AppModule` with `AuditController` registered
- WHEN `GET /api/audit-logs` is called with valid auth
- THEN the response status is NOT 404

#### Scenario: Routes not reachable without registration

- GIVEN `AuditModule` not imported in `AppModule`
- WHEN `GET /api/audit-logs` is called
- THEN the response status is 404
