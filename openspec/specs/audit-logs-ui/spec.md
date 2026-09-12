# Audit Logs UI Specification

## Purpose

Define the frontend feature that exposes the audit-logs read layer to `master`
users: a dedicated admin route, a data table with filters, and a CSV download
button. This is a new capability with no prior frontend spec for audit-logs.

---

## Requirements

### Requirement: Audit Logs Route

The application MUST register the route `/app/admin/audit-logs` under the admin
route tree. The route MUST be lazy-loaded and MUST be gated by `permissionGuard`
with the required permission `READ audit-logs`. A user without that permission
MUST be redirected to the appropriate access-denied or dashboard route before the
component loads.

#### Scenario: Route loads for authorized user

- GIVEN an authenticated `master` user with `READ audit-logs`
- WHEN the user navigates to `/app/admin/audit-logs`
- THEN `AuditLogsComponent` is rendered
- AND the breadcrumb reads `Administración > Auditoría de Acceso`

#### Scenario: Permission guard blocks unauthorized user

- GIVEN an authenticated user without `READ audit-logs`
- WHEN the user navigates to `/app/admin/audit-logs` directly
- THEN the guard redirects before `AuditLogsComponent` loads
- AND no audit data is fetched

#### Scenario: Breadcrumb shows correct path

- GIVEN an authorized user on `/app/admin/audit-logs`
- WHEN the page is rendered
- THEN the breadcrumb service renders `Administración > Auditoría de Acceso`
- AND the breadcrumb is visible without additional user interaction

---

### Requirement: Audit Logs Table

`AuditLogsComponent` MUST render a table displaying audit events returned by
`GET /api/audit-logs`. The table MUST include the columns: `Fecha`, `Usuario
(actor)`, `Acción`, `Recurso`, `Recurso ID`, `Justificación`. The table MUST
support pagination using the shared `app-pagination` component. The component
MUST call the API on init with default pagination (`page=1, limit=20`).

#### Scenario: Table renders on load

- GIVEN an authorized user landing on `/app/admin/audit-logs`
- WHEN the component initializes
- THEN `GET /api/audit-logs?page=1&limit=20` is called
- AND each returned item is displayed as a table row with all six columns populated

#### Scenario: Empty state

- GIVEN the API returns `{ items: [], total: 0 }`
- WHEN the table renders
- THEN an empty-state message is shown instead of an empty table body

#### Scenario: Pagination navigates pages

- GIVEN `total` exceeds `limit` (e.g. total=45, limit=20)
- WHEN the user navigates to page 2 via `app-pagination`
- THEN `GET /api/audit-logs?page=2&limit=20` is called
- AND the table reflects the new page of results

---

### Requirement: Audit Logs Filters

`AuditLogsComponent` MUST provide filter controls for `date_from`, `date_to`, and
`actor_id`. Applying filters MUST reset pagination to page 1 and call
`GET /api/audit-logs` with the active filter params. Clearing filters MUST restore
the unfiltered view.

#### Scenario: Date range filter narrows results

- GIVEN the user enters a `date_from` and `date_to` value
- WHEN the filter is applied
- THEN `GET /api/audit-logs?date_from=<val>&date_to=<val>&page=1&limit=20` is called
- AND the table reflects only events within that date range

#### Scenario: Actor filter narrows results

- GIVEN the user selects an actor from the dropdown (or enters a UUID)
- WHEN the filter is applied
- THEN `GET /api/audit-logs?actor_id=<uuid>&page=1&limit=20` is called
- AND the table shows only events for that actor

#### Scenario: Combined filters are sent together

- GIVEN the user sets both a date range and an actor_id filter
- WHEN the filter is applied
- THEN the request includes all active filter params combined

#### Scenario: Filters reset pagination

- GIVEN the user is on page 3 of unfiltered results
- WHEN a new filter is applied
- THEN `page` resets to 1 in the outgoing request

#### Scenario: Clearing filters restores unfiltered view

- GIVEN at least one active filter
- WHEN the user clears all filters
- THEN `GET /api/audit-logs?page=1&limit=20` is called with no filter params
- AND the table shows the full unfiltered result set

---

### Requirement: CSV Download Button

`AuditLogsComponent` MUST include a "Descargar CSV" button. Clicking it MUST
trigger a call to `GET /api/audit-logs/export.csv` with the currently active
filters applied. The response MUST be handled as a blob download via `HttpClient`
(not `window.open`) so that authentication cookies are included. The browser MUST
prompt a file download without navigating away.

#### Scenario: CSV download triggered

- GIVEN an authorized user with active filters applied
- WHEN the user clicks "Descargar CSV"
- THEN `GET /api/audit-logs/export.csv?<active-filters>` is called with credentials
- AND the browser starts a file download without a page navigation

#### Scenario: CSV download with no filters

- GIVEN no filters are active
- WHEN the user clicks "Descargar CSV"
- THEN `GET /api/audit-logs/export.csv` is called without filter params
- AND the download includes all audit events up to the 10,000-row cap

#### Scenario: CSV download uses blob, not window.open

- GIVEN the component's CSV download handler
- WHEN inspected
- THEN it uses `HttpClient` with `responseType: 'blob'`
- AND does NOT call `window.open()` or construct a plain `<a href>` with the API URL

---

### Requirement: Users List Card Links to Audit Logs Route

The "Auditoría de Acceso" card in `users-list.component.html` MUST replace its
`href="#"` placeholder with `[routerLink]="['/app/admin/audit-logs']"` so that the
card navigates to the new route.

#### Scenario: Card navigates to audit-logs

- GIVEN an authorized user on `/app/admin/users`
- WHEN the user clicks the "Auditoría de Acceso" card
- THEN the router navigates to `/app/admin/audit-logs`
- AND no full-page reload occurs (Angular router handles navigation)

#### Scenario: No stale href="#" in template

- GIVEN the updated `users-list.component.html`
- WHEN the template is inspected
- THEN no `href="#"` exists on the audit-logs card element
