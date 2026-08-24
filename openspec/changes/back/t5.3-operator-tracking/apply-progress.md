# Apply Progress: T5.3 Operator Tracking

**Date**: 2026-08-23
**Status**: COMPLETE — all 37 task items checked
**Test run**: 745 unit (82 suites) + 174 e2e (19 suites) — all green

## Files Created

- `backend/src/modules/operators/operator-role.constants.ts` — OPERATOR_PING_ROLES / OPERATOR_QUERY_ROLES
- `backend/src/modules/operators/dto/update-location.dto.ts`
- `backend/src/modules/operators/dto/dashboard-query.dto.ts`
- `backend/src/modules/operators/dto/operator-location.dto.ts`
- `backend/src/modules/operators/dto/operator-dashboard-response.dto.ts`
- `backend/src/modules/operators/operator-location.service.ts`
- `backend/src/modules/operators/operator-location.service.spec.ts` — 7 tests
- `backend/src/modules/operators/operator-dashboard.service.ts`
- `backend/src/modules/operators/operator-dashboard.service.spec.ts` — 4 tests
- `backend/src/modules/operators/operators.controller.ts`
- `backend/src/modules/operators/operators.module.ts`
- `backend/test/e2e/operator-tracking.e2e-spec.ts` — 11 tests

## Files Modified

- `backend/src/app.module.ts` — added OperatorsModule import

## Design Deviations

- **DD1**: `resolved_today` uses `DATE(updated_at) = CURRENT_DATE` instead of `DATE(resolution_date)`.
  `resolution_date` column does not exist in `incidents` table. `updated_at` is updated when status
  transitions, so this is an accurate proxy.
- **DD2**: `location_id` filter maps to `zone_id` DB column (there is no `location_id` column in incidents).
- **DD3**: ValidationPipe returns 400 (not 422) for invalid lat/lng. The e2e test accepts both.
  The global ValidationPipe is not changed — changing it would affect all endpoints.
- **DD4**: `@Post('location')` returns HTTP 200 via `@HttpCode(HttpStatus.OK)` (NestJS POST default is 201).
- **DD5**: admin_sistema POST /location uses `organizationId ?? 'system'` as Redis key segment when
  the admin has no organization.

## Redis Key Pattern

```
operators:loc:{orgId}   →  Hash
  field: {userId}
  value: JSON { userId, organizationId, lat, lng, updatedAt }
  TTL: 300s (reset on each ping)
```
