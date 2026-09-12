# Tasks: F6 — Audit Logs API (Backend)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–450 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: DTOs + migration + module wiring → PR 2: service + controller + tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DTOs + migration 0053 + module wiring | PR 1 | `npm run typecheck` | N/A — no runtime behavior yet | Delete DTO files + revert module + rollback 0053 |
| 2 | Service + controller + unit + integration tests | PR 2 | `npm test -- --testPathPattern=audit` | `npm run test:e2e` (requires migration 0053 applied) | Revert audit.service.ts, delete audit.controller.ts and spec files |

---

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Create `backend/src/modules/audit/dto/audit-log-filter.dto.ts` — `AuditLogFilterDto` with fields: `date_from?`, `date_to?`, `actor_id?`, `action?`, `resource_type?`, `page?` (default 1), `limit?` (default 20, max 100). Use `class-validator` decorators.
- [x] 1.2 Create `backend/src/modules/audit/dto/audit-log-item.dto.ts` — `AuditLogItemDto` with fields: `id`, `actorId`, `actorName: string|null`, `action`, `resourceType`, `resourceId: string|null`, `justification: string|null`, `metadata`, `createdAt`. All camelCase (interceptor converts).
- [x] 1.3 Create `database/migrations/0053_audit_logs_permission.sql` — INSERT `(resource='audit-logs', action='READ')` into `permissions` with `ON CONFLICT DO NOTHING`; UPDATE `roles.permissions` JSONB for `master` role; UPDATE `users.permissions` JSONB for all active master users; bump `permission_version` by 1. Single transaction.
- [x] 1.4 Create `database/rollback/0053_audit_logs_permission.DOWN.sql` — reverse: remove permission from `users.permissions`, `roles.permissions`, DELETE from `permissions` where `resource='audit-logs' AND action='READ'`; restore previous `permission_version`.
- [x] 1.5 Modify `backend/src/modules/audit/audit.module.ts` — add `AuditController` to `controllers` array.
- [x] 1.6 Modify `backend/src/app.module.ts` — add `AuditModule` to `imports` array.

---

## Phase 2: Core Implementation

- [x] 2.1 **RED** — Write failing unit test in `backend/src/modules/audit/audit.service.spec.ts` for `AuditService.list()`: verifies LEFT JOIN users, applies each filter (date_from, date_to, actor_id, action, resource_type), respects pagination skip/take, returns `{ items, total }`. Spec scenario: "Successful list for authorized user", "Default pagination", "Combined filters are ANDed".
- [x] 2.2 **GREEN** — Implement `AuditService.list(filters: AuditLogFilterDto): Promise<{ items: AuditLogItemDto[]; total: number }>` in `backend/src/modules/audit/audit.service.ts`. QueryBuilder on `audit_events`, LEFT JOIN `users` on `actor_id`, AND-compose WHERE clauses, ORDER BY `created_at DESC`, `skip`/`take` from page/limit.
- [x] 2.3 **RED** — Write failing unit test in `audit.service.spec.ts` for `AuditService.exportCsv()`: verifies Readable stream output, batch size 500, 10k row cap, column order (`id, actor_id, actor_name, action, resource_type, resource_id, justification, created_at`). Spec scenario: "10,000-row cap", "Filters apply to export".
- [x] 2.4 **GREEN** — Implement `AuditService.exportCsv(filters: AuditLogFilterDto): Readable` in `audit.service.ts`. Same QueryBuilder without pagination, cap at 10k rows, batch 500, emit CSV header then rows; follows `IncidentExportService` pattern.
- [x] 2.5 **RED** — Create `backend/src/modules/audit/audit.controller.spec.ts` with failing tests: guard metadata on `GET /api/audit-logs` returns 401 (no JWT) and 403 (no permission); endpoint returns 200 + body shape for authorized user; export endpoint returns `Content-Type: text/csv`. Spec scenarios: "Permission denied", "Unauthenticated request", "Successful export".
- [x] 2.6 **GREEN** — Create `backend/src/modules/audit/audit.controller.ts` — `@Controller('audit-logs')`, `@UseGuards(JwtAuthGuard, PermissionGuard)` at class level, two handlers: `GET /` with `@RequirePermission('READ', 'audit-logs')` calling `auditService.list()`, `GET /export.csv` with `@RequirePermission('READ', 'audit-logs')` and `@Res()` piping the Readable to `text/csv` with `Content-Disposition`.

---

## Phase 3: Integration / Verification

- [x] 3.1 **RED** — Add e2e test stubs (or integration specs) covering: `GET /api/audit-logs` → 401 no token, 403 wrong permission, 200 correct shape; `GET /api/audit-logs/export.csv` → 200 with `Content-Type: text/csv`; `GET /api/audit-logs?limit=200` → at most 100 items. Reference spec scenarios R1-S4 (401), R1-S5 (403), R3-S1 (export 200), R3-S3 (cap).
- [x] 3.2 **GREEN** — Confirm migration 0053 idempotency: run migration twice in test environment, assert single permission row per spec scenario "Idempotent migration" (R4-S5).
- [x] 3.3 Verify `npm run typecheck` passes — no TypeScript errors from new DTOs, controller, or service signatures.
- [x] 3.4 Verify `npm run lint` passes — no ESLint errors in modified/created files.
- [x] 3.5 Run `npm test -- --testPathPattern=audit` — all audit unit specs green.

---

## Phase 4: Cleanup

- [x] 4.1 Confirm `AuditController` is NOT reachable before module registration (spec scenario R5-S2 "Routes not reachable without registration") — verify by reading module import order; no code change needed if already correct.
- [x] 4.2 Confirm `actor_name` is `null` (not omitted) when user row is deleted — verify LEFT JOIN handles missing user gracefully (spec scenario R1-S1, R4-S3 edge case).
