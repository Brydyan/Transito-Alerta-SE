# Specification: incident-analytics

## Purpose

Define the behavioral contract for aggregate stats, time-series daily stats, unified map/citizen
feed, and CSV export. Scenarios derived from GeoReporta controllers.

## Scope Summary

**In scope**: `GET /api/incidents/stats`, `GET /api/incidents/weekly-stats`,
`GET /api/incidents/feed`, `GET /api/incidents/export`.

**Not additive to schema** — pure read-side services on existing tables.

## Requirements

### R1 — Stats Aggregation

The system MUST require `READ dashboard` permission for stats access.

Stats MUST be org-scoped: `admin_sistema` sees all incidents; `admin_organizacion` and operators
see only incidents where `organization_id = caller.organization_id`.

The response MUST always include all known status/priority keys even when count is 0
(zero-filled shape).

The response MUST include `trends` comparing current period vs previous equal-length period
(`total_pct`, `pendientes_pct`, `resolution_rate_pct`).

Results MUST be cached in Redis for 1 hour keyed by org scope + filter hash.

### R2 — Weekly Stats (Daily Series)

Default window: last 10 days (when no `inicio`/`fin` provided).

Each day in the series MUST include `date` (YYYY-MM-DD), `label` (day-of-week abbreviation in
Spanish), `recibidas` (incidents created that day), `resueltas` (incidents resolved that day).

Days with no activity MUST still appear in the series with `recibidas: 0, resueltas: 0`.

Same `READ dashboard` permission gate and org scoping as R1.

### R3 — Feed (Unified Map)

Auth is mandatory — 401 for unauthenticated requests.

Staff roles (`admin_sistema`, `admin_organizacion`, `operador_organizacion`, `operador_sistema`)
MUST use the live Postgres path with `READ incidents` permission and org scoping.

Citizen role (`usuario`) MUST use the Redis read model with `READ feed` permission.

Both paths MUST return the same slim item shape:
`{id, incident_category_id, organization_id, user_id, location_id, title, status, priority,
resolution_date, created_at, updated_at, geom, category{id,name}, organization{id,name},
user{id,name?}, location{id,name}}`.

For the staff bbox path (`bbox` query param), the result set MUST be capped at 500 items.

### R4 — CSV Export

`READ dashboard` permission required.

The export MUST stream a CSV file (not buffered in memory).

`Content-Disposition: attachment; filename=incidencias-{YYYY-MM-DD-HHmmss}.csv` MUST be set.

When row count > hard cap (5000), the response MUST include:
- `X-Report-Truncated: true`
- `X-Report-Original-Total: {n}`
- `X-Report-Exported: {cap}`

Same filters as stats (`inicio`, `fin`, `tipo_id`, `ciudad_id`, `provincia_id`, `pais_id`).

## Scenarios

### GET /api/incidents/stats

**Scenario 1: Admin_sistema sees stats for all organizations**
```
Given an authenticated admin_sistema user with READ dashboard permission
  And incidents from org-A and org-B both exist
When GET /api/incidents/stats is called without org filter
Then the response status is 200
  And total includes incidents from both organizations
  And by_status keys include pending, in_progress, resolved (even if some are 0)
  And by_priority keys include low, medium, high, critical
  And trends object is present with total_pct, pendientes_pct, resolution_rate_pct
```

**Scenario 2: Org-admin sees only their org's stats**
```
Given an authenticated admin_organizacion of org-A
  And incidents exist in org-A and org-B
When GET /api/incidents/stats is called
Then the response total only counts org-A incidents
  And org-B incidents are not reflected in any field
```

**Scenario 3: Stats are cached; second identical call is served from Redis**
```
Given a first call to GET /api/incidents/stats for a given user and filters
When the exact same request is made a second time
Then the second response time is significantly lower (cache hit)
  And the response body is identical
```

**Scenario 4: Caller without READ dashboard permission gets 403**
```
Given an authenticated user without READ dashboard permission
When GET /api/incidents/stats is called
Then the response status is 403
```

### GET /api/incidents/weekly-stats

**Scenario 1: Returns 10 days by default**
```
Given no inicio or fin query params
When GET /api/incidents/weekly-stats is called
Then the response contains a days array with exactly 10 entries
  And each entry has date, label, recibidas, resueltas
  And dates span from (today - 9 days) to today inclusive
```

**Scenario 2: Days with no activity are zero-filled**
```
Given a date range with no incidents on day 3
When GET /api/incidents/weekly-stats?inicio=2026-08-01&fin=2026-08-07 is called
Then day 3 appears in the response with recibidas: 0, resueltas: 0
```

**Scenario 3: fin before inicio returns 422**
```
When GET /api/incidents/weekly-stats?inicio=2026-08-10&fin=2026-08-01 is called
Then the response status is 422
```

### GET /api/incidents/feed

**Scenario 1: Staff user receives live Postgres data**
```
Given an authenticated operador_organizacion with READ incidents permission
When GET /api/incidents/feed is called
Then the response status is 200
  And incidents are org-scoped to the operator's organization
  And meta includes current_page, per_page, total, last_page
```

**Scenario 2: Citizen user receives Redis feed**
```
Given an authenticated usuario (citizen) with READ feed permission
When GET /api/incidents/feed?page=1&per_page=12 is called
Then the response status is 200
  And data items match the citizen feed shape (not org-scoped)
```

**Scenario 3: Staff bbox query caps at 500 items**
```
Given more than 500 incidents exist in the staff's org
When GET /api/incidents/feed?bbox=-68,-33,-66,-31 is called
Then the response data array has at most 500 items
```

**Scenario 4: Unauthenticated request returns 401**
```
Given no Authorization header
When GET /api/incidents/feed is called
Then the response status is 401
```

### GET /api/incidents/export

**Scenario 1: Streams CSV with correct headers**
```
Given an authenticated user with READ dashboard permission
  And 50 incidents matching no filter
When GET /api/incidents/export is called
Then the response Content-Type is text/csv
  And Content-Disposition contains attachment; filename=incidencias-
  And the response body is valid CSV with a header row + 50 data rows
```

**Scenario 2: Truncation headers present when > 5000 rows**
```
Given 6000 incidents matching the applied filters
When GET /api/incidents/export is called
Then the response contains header X-Report-Truncated: true
  And X-Report-Original-Total: 6000
  And X-Report-Exported: 5000
  And the CSV body contains exactly 5000 data rows
```

**Scenario 3: Caller without READ dashboard gets 403**
```
Given a usuario (citizen) without READ dashboard permission
When GET /api/incidents/export is called
Then the response status is 403
```
