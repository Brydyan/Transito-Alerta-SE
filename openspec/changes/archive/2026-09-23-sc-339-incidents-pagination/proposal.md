# Proposal: Server-Side Pagination for Incident List API and UI Integration

## Intent

`GET /api/incidents` currently executes raw SQL with a hardcoded `LIMIT 1000` and returns a flat array without pagination metadata or query parameter support. The frontend currently fakes pagination over the full dataset. This causes performance issues on large datasets and blocks mobile card grid pagination ("Ver más datos") defined in change `front/2026-09-15-responsive-design-tables`. This change introduces true server-side pagination with an `{items, total}` envelope, mirroring the Users module pattern.

## Scope

### In Scope
- Backend `GET /api/incidents` query parameter support for `page` (default 1) and `limit` (default 20, max 100).
- Controller, Service, and Repository refactoring to run SQL take/skip + `COUNT(*)` queries returning `{items, total}`.
- Redis cache key expansion to incorporate `page` and `limit` (`incidents:list:{zone}:{status}:{scope}:{page}:{limit}`).
- Frontend `IncidentService.getIncidents()` update to pass real query params and parse `{items, total}` envelope.
- Frontend `IncidentListComponent` activation of real pagination and load-more controls driven by backend `total`.
- Unit and integration tests for modified backend and frontend components.

### Out of Scope
- Database schema changes or new migrations (existing `incidents` schema is sufficient).
- Changes to other incident endpoints or workflow transitions.
- Modifications to `front/2026-09-15-responsive-design-tables` specs or design (read-only reference).

## Capabilities

### New Capabilities
- `incidents-pagination-api`: Backend server-side pagination for `GET /api/incidents` returning `{items, total}`, `page`/`limit` parameter validation, and pagination-aware Redis caching.

### Modified Capabilities
- `frontend-incidents`: Frontend incident list consumption updated to handle paginated `{items, total}` envelope and enable real pagination / load-more controls.

## Approach

Mirror the established `Users` pagination pattern (`UsersController.list()` / `UsersService.list()`):
1. **Controller & DTO**: Accept `page` (min 1, default 1) and `limit` (min 1, max 100, default 20) in list query parameters.
2. **Service & Repository**: Execute paginated SQL query with `LIMIT` / `OFFSET` and total count query, returning `{items: IncidentRow[], total: number}`.
3. **Caching**: Expand Redis cache key to `incidents:list:{zone}:{status}:{scope}:{page}:{limit}`.
4. **Frontend**: Update `IncidentService.getIncidents()` to forward `page` / `per_page` and unwrap `{items, total}`. Update `IncidentListComponent` computed signal `shouldShowPagination` based on `total`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/incidents/incidents.controller.ts` | Modified | Add `page` and `limit` query parameters with defaults and validation. |
| `backend/src/modules/incidents/incidents.service.ts` | Modified | Update `findAll` to return `{items, total}` and include page/limit in cache keys. |
| `backend/src/modules/incidents/incidents.repository.ts` | Modified | Replace hardcoded `LIMIT 1000` with SQL `LIMIT` / `OFFSET` and `COUNT(*)`. |
| `frontend/src/app/core/services/incident.service.ts` | Modified | Pass real `page`/`per_page` params and handle `{items, total}` envelope. |
| `frontend/src/app/features/incidents/incident-list/incident-list.component.ts` | Modified | Enable pagination/load-more state driven by real `total`. |
| `backend/src/modules/incidents/**/*.spec.ts & frontend/src/app/**/*.spec.ts` | Modified | Update tests for controller, service, repository, and UI component. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale or mismatched cache entries | Low | Include `page` and `limit` in cache keys and ensure wildcard key invalidation on incident updates. |
| Client contract mismatch | Low | Frontend service updated simultaneously; `IncidentListResult` model already supports `{items, total}` structure. |

## Rollback Plan

Revert backend controller, service, repository, and frontend `IncidentService` commits. Re-deploy prior build and flush Redis cache key pattern `incidents:list:*`.

## Dependencies

- **Prerequisites / Unblocks**: Unblocks `front/2026-09-15-responsive-design-tables` requirement S3.2/S3.5 ("Ver más datos" load-more in mobile card grid).
- **Permissions**: Retains existing `READ incidents` permission gate.
- **Database**: No schema migrations required.

## Success Criteria

- [ ] `GET /api/incidents?page=1&limit=20` returns status 200 with envelope `{items: IncidentRow[], total: number}`.
- [ ] Query parameter validation enforces `page` ≥ 1 (default 1) and `limit` 1–100 (default 20).
- [ ] Redis cache key includes `page` and `limit` params and invalidates cleanly on incident updates.
- [ ] Frontend `IncidentService.getIncidents()` forwards `page` / `per_page` and returns real total count.
- [ ] Frontend `IncidentListComponent` displays correct pagination / "Ver más datos" controls based on real total.
- [ ] Unit and integration test suites in backend and frontend pass with 100% success.
