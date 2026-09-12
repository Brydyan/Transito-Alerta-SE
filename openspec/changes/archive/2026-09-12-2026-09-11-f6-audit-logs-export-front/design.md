# Design: F6 — Audit Logs UI (Frontend)

## Technical Approach

New admin feature at `/app/admin/audit-logs`: standalone component with table,
filters (date range + actor), pagination, and CSV blob download. Follows existing
admin route patterns (roles sibling, lazy-load, permissionGuard). Depends on
backend `GET /api/audit-logs` and `GET /api/audit-logs/export.csv`.

## Architecture Decisions

### D1: Route — sibling under admin (no nested children)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Sibling `path: 'audit-logs'` under admin children | Same pattern as `roles`; single page, no sub-routes needed | **Chosen** |
| Nested children under `users` | Semantically wrong — audit-logs are system-wide, not per-user | Rejected |
| Parent with children (`audit-logs/`, `audit-logs/:id`) | No detail view in scope; unnecessary nesting | Rejected |

**Rationale**: The roles route is a direct sibling under admin with no children.
Audit-logs has the same topology: a single list page with filters. The route
uses `permissionGuard` with `data.permission = 'READ audit-logs'`, matching the
exact convention used by organizations/categories/locations routes.

### D2: Actor filter — dropdown from GET /api/users/form-data with UUID fallback

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Dropdown via `GET /api/users/form-data` (existing endpoint), fallback to UUID text input on 403 | Best UX for master users who already have READ users; graceful degradation | **Chosen** |
| UUID-only text input | Always works but poor UX — admins must know UUIDs | Rejected |
| New dedicated endpoint for actor names | Unnecessary — form-data already returns `{id, name}` for users | Rejected |

**Rationale**: `GET /api/users/form-data` already exists, is gated by
`READ users`, and returns the slim `{id, firstName, lastName}` shape needed for
a dropdown. Master users who have `READ audit-logs` also have `READ users`.
The component attempts the call on init; on 403, it replaces the dropdown with
a UUID text input. This is defensive, not speculative — it handles the case
where `READ audit-logs` is granted to a role without `READ users` (OD-2 future).

### D3: Date inputs — native `<input type="date">`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Native `<input type="date">` | Zero dependency, browser-native UX, consistent across the project | **Chosen** |
| Third-party date-picker (e.g. ng-bootstrap datepicker) | Better UX for complex ranges; adds a dependency the project does not use | Rejected |
| Custom date-picker component | Engineering effort not justified for two date inputs | Rejected |

**Rationale**: No date-picker library exists in the project dependencies. Native
inputs provide adequate UX for a simple from/to range filter. The `value`
attribute yields `YYYY-MM-DD` which maps directly to ISO 8601 query params.

### D4: CSV download — HttpClient blob (not window.open)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `HttpClient.get(url, { responseType: 'blob' })` + programmatic `<a>` download | Auth cookies included automatically; no navigation; filename from Content-Disposition | **Chosen** |
| `window.open(url)` | Simple but breaks auth (no cookies/JWT in new window context); causes navigation | Rejected |
| `<a href="url" download>` | Same auth problem as window.open | Rejected |

**Rationale**: The backend requires JWT authentication. `HttpClient` sends the
token via the existing interceptor. The blob response is converted to a
download via `URL.createObjectURL` + a temporary `<a>` element with `download`
attribute. Filename: `audit-logs-YYYY-MM-DD.csv` (from Content-Disposition or
constructed client-side).

## Data Flow

    User navigates to /app/admin/audit-logs
         │
    permissionGuard checks 'READ audit-logs'
         │ (blocked → redirect /app/dashboard)
         │
    AuditLogsComponent.ngOnInit()
         ├── AuditLogsService.getAuditLogs({ page: 1, limit: 20 })
         │        → GET /api/audit-logs?page=1&limit=20
         │        → { items, total } → table render
         │
         └── AuditLogsService.getUsers() (try)
                  → GET /api/users/form-data
                  → success: populate actor dropdown
                  → 403: show UUID text input fallback

    User applies filters (date_from, date_to, actor_id)
         │
    Reset page to 1 → AuditLogsService.getAuditLogs(filters)
         │
    Table re-renders with filtered results

    User clicks "Descargar CSV"
         │
    AuditLogsService.exportCsv(activeFilters)
         → GET /api/audit-logs/export.csv?<filters>
         → responseType: 'blob'
         → createObjectURL + <a download> trigger
         → browser download prompt

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` | Create | Standalone component: table, filters, pagination, CSV button |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.html` | Create | Template: filter bar (date inputs + actor dropdown/UUID) + table + app-pagination + CSV button |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.spec.ts` | Create | Unit tests: renders table, applies filters, downloads CSV |
| `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.ts` | Create | HTTP service: getAuditLogs(), exportCsv(), getUsers() |
| `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.spec.ts` | Create | Service unit tests |
| `frontend/src/app/app.routes.ts` | Modify | Add `audit-logs` sibling route under admin children |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | Modify | Replace `href="#"` with `[routerLink]="['/app/admin/audit-logs']"` |

## Interfaces / Contracts

```typescript
// audit-logs.service.ts
interface AuditLogItem {
  id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  justification: string | null;
  metadata: Record<string, unknown>;
  created_at: string; // ISO 8601
}

interface AuditLogsResponse {
  items: AuditLogItem[];
  total: number;
}

interface AuditLogFilters {
  date_from?: string;
  date_to?: string;
  actor_id?: string;
}

// Route definition in app.routes.ts
{
  path: 'audit-logs',
  data: { breadcrumb: 'Auditoría de Acceso', permission: 'READ audit-logs' },
  canActivate: [permissionGuard],
  loadComponent: () =>
    import('./features/admin/audit-logs/audit-logs.component')
      .then(m => m.AuditLogsComponent),
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | AuditLogsComponent renders table rows | TestBed + mock service |
| Unit | Filter application resets page to 1 | Component interaction test |
| Unit | CSV download calls service.exportCsv | Spy on service method |
| Unit | Actor dropdown fallback on 403 | Mock service to throw 403 |
| Unit | AuditLogsService HTTP calls | HttpClientTestingModule |
| Integration | Route guard blocks unauthorized | RouterTestingModule |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary.

## Migration / Rollout

No data migration. Deploy backend first (endpoints + permission migration 0053),
then frontend. The `routerLink` on the users-list card will 404 if frontend
deploys before backend, but the route guard will block unauthorized users
regardless.

## Open Questions

- None blocking. OD-F1 (actor filter approach) resolved as dropdown with
  fallback. OD-F2 (date picker) resolved as native input. OD-F3 (CSV download)
  resolved as HttpClient blob.
