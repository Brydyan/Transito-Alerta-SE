# Specification: operator-tracking

## Purpose

Define the behavioral contract for operator GPS ping, active-location map query, and
operator-specific dashboard. Scenarios derived from GeoReporta controllers and service behavior.

## Scope Summary

**In scope**: `POST /api/operator/location`, `GET /api/operator/locations`,
`GET /api/operator/dashboard`.

**Not additive to schema** — locations live in Redis; dashboard reads from existing `incidents`.

## Requirements

### R1 — Location Ping (POST)

Only users with operator roles (`operador_organizacion`, `operador_sistema`) OR `admin_sistema`
MAY call this endpoint. All others MUST receive 403.

`lat` MUST be between -90 and 90 (inclusive). `lng` MUST be between -180 and 180 (inclusive).
Invalid values return 422.

A successful ping MUST write a Redis entry that expires after 5 minutes of inactivity.
The entry MUST include `userId`, `organizationId`, `lat`, `lng`, `updated_at`.

### R2 — Location Query (GET)

Callers: operators, org-admins, system admins. Regular users (ciudadanos) MUST receive 403.

`admin_sistema` MUST see positions from all organizations.

`admin_organizacion` and `operador_organizacion`/`operador_sistema` MUST see only positions
in their own organization.

Only non-expired entries are returned. Expired entries are silently omitted.

### R3 — Operator Dashboard (GET)

Only operators (`operador_organizacion`, `operador_sistema`) with `READ dashboard` permission
MAY access this endpoint. Other roles MUST receive 403 (not just 401).

The dashboard MUST return:
- `stats`: `{total_assigned: int, in_progress: int, resolved_today: int}`
- `incidents`: paginated list (max 50/page) of incidents where `claimed_by = operator.id` OR
  `assigned_to = operator.id`, with category name included.
- `pagination`: standard meta (`page`, `per_page`, `total`, `last_page`).

Optional filters: `inicio`, `fin` (YYYY-MM-DD), `location_id`.

## Scenarios

### POST /api/operator/location

**Scenario 1: Operator successfully pings location**
```
Given an authenticated operador_organizacion user of org-X
When POST /api/operator/location is sent with {lat: -31.4, lng: -64.1}
Then the response status is 200
  And the response body is {status: "ok"}
  And a Redis entry exists for the operator with the provided coordinates
  And the Redis entry has a TTL of approximately 300 seconds
```

**Scenario 2: Non-operator (citizen) gets 403**
```
Given an authenticated usuario (citizen) with no operator role
When POST /api/operator/location is sent
Then the response status is 403
```

**Scenario 3: Invalid lat/lng returns 422**
```
Given an authenticated operator
When POST /api/operator/location is sent with {lat: 95, lng: 0}
Then the response status is 422
  And the error references the lat field
```

**Scenario 4: Location ping updates TTL on repeat calls**
```
Given an operator who previously pinged 4 minutes ago
When the operator sends POST /api/operator/location again
Then the Redis entry TTL is reset to ~300 seconds
```

### GET /api/operator/locations

**Scenario 1: Org-admin sees locations in their organization only**
```
Given operator A in org-X recently pinged
  And operator B in org-Y recently pinged
  And an admin_organizacion of org-X is authenticated
When GET /api/operator/locations is called
Then the response status is 200
  And the response includes operator A's position
  And the response does NOT include operator B's position
```

**Scenario 2: System admin sees all active locations**
```
Given operators in org-X and org-Y both have non-expired pings
  And an admin_sistema is authenticated
When GET /api/operator/locations is called
Then the response includes positions from both organizations
```

**Scenario 3: Expired locations are not returned**
```
Given an operator pinged 6 minutes ago (TTL expired)
When GET /api/operator/locations is called
Then the response does not include the expired operator's position
```

**Scenario 4: Ciudadano gets 403**
```
Given an authenticated usuario (citizen role)
When GET /api/operator/locations is called
Then the response status is 403
```

### GET /api/operator/dashboard

**Scenario 1: Operator sees their own incidents and stats**
```
Given an authenticated operador_organizacion with READ dashboard permission
  And 2 incidents claimed by this operator (in_progress)
  And 1 incident resolved today claimed by this operator
When GET /api/operator/dashboard is called
Then the response status is 200
  And stats.total_assigned >= 3
  And stats.in_progress = 2
  And stats.resolved_today = 1
  And incidents array contains the operator's incidents
```

**Scenario 2: Date filter narrows incident list**
```
Given an operator with incidents from 2026-07-01 and 2026-08-01
When GET /api/operator/dashboard?inicio=2026-08-01&fin=2026-08-31 is called
Then only August incidents appear in the incidents array
```

**Scenario 3: Non-operator gets 403**
```
Given an authenticated admin_organizacion (not an operator role)
When GET /api/operator/dashboard is called
Then the response status is 403
```

**Scenario 4: Operator without READ dashboard permission gets 403**
```
Given an operator user without the READ dashboard permission
When GET /api/operator/dashboard is called
Then the response status is 403
```
