# Dashboard statistics

The executive dashboard consumes two authenticated endpoints:

- `GET /api/incidents/stats` exposes the total count; counts by status and priority; incidents created during the last seven days; distinct incident locations; average resolution time; period-over-period trends; resolution rate; and the five categories with the most incidents, split into resolved and unresolved counts.
- `GET /api/incidents/weekly-stats` exposes one entry per day with received and resolved incident volumes. Without an explicit range, it returns the rolling ten-day window ending today.

Known status and priority keys are always present in the aggregate response, even when their value is zero. Average resolution time is `null` when the selected dataset has no resolved incidents.

## Filters

Both endpoints accept the same optional query parameters:

| Parameter | Format | Behavior |
| --- | --- | --- |
| `inicio` | `YYYY-MM-DD` | Includes incidents created on or after this date. |
| `fin` | `YYYY-MM-DD` | Includes incidents created on or before this date and must not precede `inicio`. |
| `tipo_id` | Category ID | Restricts results to one incident category. |
| `pais_id` | Location ID | Includes the country and all descendant provinces and cities. |
| `provincia_id` | Location ID | Includes the province and all descendant cities. |
| `ciudad_id` | Location ID | Restricts results to the selected city. |

Filters compose with AND semantics. For example, a category, province, and date range return only incidents satisfying all three conditions. Organization scope is applied in addition to these filters and cannot be overridden by request parameters.

## Authorization and organization scope

Both endpoints require an authenticated user with the `dashboard.view` permission. Requests without that permission return HTTP 403.

System administrators see data from every organization. Organization administrators and organization operators see only incidents belonging to their organization. Regular users do not receive incident aggregates.

## Cache strategy

Both endpoints cache the complete filtered response for 3,600 seconds using Laravel's configured cache store. Cache keys include:

- the endpoint;
- the caller's organization scope or system scope;
- a hash of the validated filters.

Entries share the `incident-stats` cache tag. Incident create, update, and delete events flush that tag through `RedisIncidentSync`, so dashboard data is refreshed after incident mutations while repeated reads remain inexpensive. The production cache store is Redis; tests use Laravel's array cache store.
