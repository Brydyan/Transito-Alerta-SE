# Apply Progress: T6 — GeoReporta Parity Gaps

**Change**: t6-georepota-parity
**Status**: COMPLETE
**Date closed**: 2026-08-24

## Summary

All 8 task groups (T6.1–T6.8) are implemented and fully tested. Backend code
(migrations 0025-0029, entities, services, controllers) was completed in a
prior session; this session wrote the remaining e2e test suite (7 new spec
files, ~40 test cases) and fixed 3 backend bugs surfaced by real-stack
(Testcontainers Postgres + Redis) execution that unit tests with mocked
repositories could not catch.

## Final verification (all green)

- `npm test` (unit): **823/823 passing**, 92/92 suites
- `npm run test:e2e`: **242/242 passing**, 29/29 suites
- `npm run typecheck`: clean
- `npm run build`: clean
- `npm run lint`: **0 errors** (19 pre-existing `no-explicit-any` warnings in
  spec files, out of scope for this change)

## E2E test files created this session

| File | Covers |
|---|---|
| `test/e2e/t6-notifications.e2e-spec.ts` | T6.1.A3 (unread-count), T6.7.B2 (SSE 410 tombstone) |
| `test/e2e/t6-organizations-notified.e2e-spec.ts` | T6.1.B6 (location_id / lat+lng / 400) |
| `test/e2e/t6-soft-deletes.e2e-spec.ts` | T6.2.D1 (incident soft delete), T6.2.D2 (assignment soft delete + re-assign), T6.4.A5 (assignment role/operator PATCH) |
| `test/e2e/t6-incident-metrics.e2e-spec.ts` | T6.3.D1 (claimed_at), T6.3.D2 (resolution_date) |
| `test/e2e/email-verification.e2e-spec.ts` | T6.5.D3 (OTP resend/verify/expiry/rate-limit/401) |
| `test/e2e/incident-images.e2e-spec.ts` | T6.6.D3 (upload/delete/MIME/ownership/limits) |
| `test/e2e/t6-export-feed.e2e-spec.ts` | T6.7.A5 (XLSX/CSV export + alias), T6.7.C6 (feed rebuild) |
| `test/e2e/t6-aliases-gdpr.e2e-spec.ts` | T6.8.A5 (path aliases), T6.8.D1 (GDPR soft delete), T6.8.D2 (register 410) |

Also updated `test/e2e/incident-workflow.e2e-spec.ts` — the pre-existing
`/incidents/statuses` test expected the old `{ statuses: string[] }` wrapper;
updated to expect the new `[{ id, label }]` array shape (T6.8.A4).

## Bugs found and fixed via e2e (real Postgres/Redis, not mocks)

1. **NestJS stacked `@Get` decorator collision.** Applying two `@Get('a')` /
   `@Get('b')` decorators to the same handler only registers the last-applied
   (outermost) one — `Reflect.defineMetadata` overwrites rather than merges.
   Affected `notifications.controller.ts` (`unread` vs `unread-count`),
   `incidents.controller.ts` (`export` vs `exportar`), `menus.controller.ts`
   (`` vs `my`). Fixed with array syntax: `@Get(['a', 'b'])`.

2. **Duplicate `GET /incidents/statuses` route across two controllers.**
   `IncidentWorkflowController` (T5.1) and `IncidentsController` (T6.8) both
   registered `@Get('statuses')` under `@Controller('incidents')`. The older
   T5.1 handler (`{ statuses: string[] }`) silently won over the newer T6.8
   handler (`[{ id, label }]`) due to the same decorator-collision behavior
   as above, but across controllers this time — NestJS's route table just
   uses whichever handler got registered, and module provider order made the
   old one win. Fixed by deleting the dead `getStatuses()` method (and its
   `@Get('statuses')` decorator) from `IncidentWorkflowController`, leaving
   the T6.8 version in `IncidentsController` as the single source of truth.

3. **PostgreSQL "inconsistent types deduced for parameter $2".**
   `IncidentsRepository.updateStatus()` reused the same `$2` (an
   `IncidentStatus` enum param) both in `SET status = $2` and inside
   `CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END` for
   `resolution_date`. Postgres could not reconcile the enum-typed usage with
   the implicit text comparison in the same statement, and a `::text` cast on
   the CASE branch did not resolve it either. Fixed by passing a separate
   pre-computed boolean parameter (`$3 = status === 'resolved'`) instead of
   re-deriving it in SQL from the shared enum param. Updated the unit test in
   `incidents.repository.spec.ts` to assert the new 3-param call signature.

4. **`ExportQueryDto` missing `format` field.** `ValidationPipe` runs with
   `forbidNonWhitelisted: true`; `GET /incidents/export?format=xlsx` was
   rejected with 400 because `format` was not a whitelisted DTO property
   (only inherited from `StatsQueryDto`, which has no `format`). Added
   `@IsOptional() @IsIn(['csv', 'xlsx']) format?: string` to
   `export-query.dto.ts`.

5. **Migration 0026 dropped the wrong UNIQUE constraint name**, leaving the
   original per-incident `uq_assignments_incident UNIQUE (incident_id)`
   constraint (from migration 0007) in place and blocking re-assignment after
   a soft-delete release. Fixed by adding
   `ALTER TABLE assignments DROP CONSTRAINT IF EXISTS uq_assignments_incident;`
   to migration 0026 (in addition to the incorrectly-named constraint it was
   already trying to drop).

6. **Migration 0029 referenced non-existent `permissions.description`
   column.** The `permissions` table (migration 0009) only has
   `id, resource, action`. Fixed the seed INSERT to use
   `INSERT INTO permissions (resource, action) VALUES (...) ON CONFLICT DO NOTHING`.

7. **`email-verification.controller.ts` imported `IsString` from
   `@nestjs/common`** instead of `class-validator` — TypeScript compile
   error. Fixed the import source.

8. **Two `require()`-style imports in spec files** (`no-require-imports`
   lint errors) in `email-verification.service.spec.ts` and
   `notifications.controller.spec.ts`. Converted to top-level ES imports.

## Files changed this session (beyond the 7 new e2e spec files)

- `backend/src/modules/incidents/incidents.repository.ts` — `updateStatus()` boolean param fix
- `backend/src/modules/incidents/incidents.repository.spec.ts` — updated param assertion
- `backend/src/modules/incidents/dto/export-query.dto.ts` — added `format` field
- `backend/src/modules/incidents/incident-workflow.controller.ts` — removed dead `getStatuses()`
- `backend/src/modules/notifications/notifications.controller.ts` — array `@Get` syntax
- `backend/src/modules/incidents/incidents.controller.ts` — array `@Get` syntax
- `backend/src/modules/menus/menus.controller.ts` — array `@Get` syntax
- `backend/src/modules/auth/email-verification.controller.ts` — fixed `IsString` import
- `backend/database/migrations/0026_assignments_soft_delete.sql` — added correct constraint drop
- `backend/database/migrations/0029_incident_images.sql` — fixed permissions INSERT
- `backend/test/e2e/incident-workflow.e2e-spec.ts` — updated statuses response shape assertion
- `backend/src/modules/auth/email-verification.service.spec.ts` — lint fix (require → import)
- `backend/src/modules/notifications/notifications.controller.spec.ts` — lint fix (require → import)

## Notes for verify phase

- Migrations 0025-0029 are still `⏳ Pending` in `MIGRATION_LOG.md` — they run
  automatically in the e2e Testcontainers harness but have not been applied
  to the real Supabase instance yet. That remains a manual deploy step
  outside this change's scope (per design.md).
- No deviations from `design.md` or `specs/` were needed — all fixes were
  implementation bugs, not spec-level surprises.
