# Design: F6 — Audit Logs API (Backend)

## Technical Approach

Read layer for `audit_events` (migration 0045): paginated list endpoint and
buffered CSV export, gated by a new `READ audit-logs` permission added in
migration 0053. Follows existing controller/service patterns (IncidentsController
export, RequirePermission decorator, SnakeCaseResponseInterceptor).

## Architecture Decisions

### D1: Data source — audit_events (not user_sessions)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `audit_events` | Generic, covers all actions, has actor + action + resource; indexes on `(actor_id, created_at)` and `(resource_type, resource_id, created_at)` already exist | **Chosen** |
| `user_sessions` | Login-only, no `action` field, mixed concern with session management | Rejected |
| Both tables (UNION) | Complex schema merge, double N+1 risk, harder CSV | Rejected |

**Rationale**: `audit_events` is the dedicated audit table. `user_sessions` is
a session management table with different semantics. LOGIN recording in
`audit_events` is a separate future concern (OD-1, deferred).

### D2: CSV export — buffered with 10k cap (not streaming)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Buffered, 10k cap, `@Res()` pipe | Simple, prevents OOM, matches existing incident export pattern | **Chosen** |
| True streaming (cursor-based) | Better for huge datasets; more complexity, harder error handling | Deferred (OD-3) |

**Rationale**: Incident export uses the same pattern (`createCsvStream` +
`Readable` + `res.pipe`). 10k rows cap provides safety. Batch size 500 rows
(same as `IncidentExportService.BATCH_SIZE`).

### D3: Permission migration 0053 — denormalized RBAC propagation

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Migration updates `permissions` + `roles.permissions` + `users.permissions` + bumps `permission_version` | Three UPDATE statements, but matches the mandatory denormalization pattern | **Chosen** |
| Insert permission only, rely on admin UI to grant | Breaks new-install flow; permission not available until manual grant | Rejected |

**Rationale**: The RBAC pattern requires all three writes in a single
transaction. `permission_version` bump invalidates Redis `perm:v3:uid:*` cache
so active sessions see the new permission without re-login. This exact pattern
is documented in migration 0045/0047 and the proposal.

### D4: Query — LEFT JOIN users for actor_name

| Option | Tradeoff | Decision |
|--------|----------|----------|
| LEFT JOIN `users` on `actor_id` at query time | One query, actor_name resolved inline; LEFT JOIN handles deleted users (returns null) | **Chosen** |
| Separate query for user names (N+1) | Simpler initial query but O(N) lookups | Rejected |
| Denormalize actor_name into audit_events | Stale if user changes name; violates append-only semantics | Rejected |

**Rationale**: `idx_audit_actor (actor_id, created_at)` already exists. LEFT
JOIN is efficient and handles the edge case of deleted users (actor_name = null).

### D5: Response format — snake_case via existing interceptor

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `SnakeCaseResponseInterceptor` (global, already in main.ts) | Zero config, all camelCase properties auto-converted | **Chosen** |
| Manual snake_case DTOs | Duplicated naming, inconsistent with rest of API | Rejected |

**Rationale**: The interceptor is registered globally in `main.ts`. DTOs use
camelCase (TypeScript convention); the interceptor converts to snake_case in
the response. CSV bypasses the interceptor because it uses `@Res()` directly
(same as incident export).

## Data Flow

    Client ──GET /api/audit-logs──→ AuditController
                                        │
                                   JwtAuthGuard
                                   PermissionGuard
                                   @RequirePermission('READ', 'audit-logs')
                                        │
                                   AuditService.list(filters, page, limit)
                                        │
                                   QueryBuilder: audit_events
                                   LEFT JOIN users ON actor_id
                                   WHERE filters (AND logic)
                                   ORDER BY created_at DESC
                                   SKIP/TAKE pagination
                                        │
                                   SnakeCaseResponseInterceptor
                                        │
                                   { items: [...], total: N }

    Client ──GET /api/audit-logs/export.csv──→ AuditController
                                                   │
                                              Same guards
                                                   │
                                              AuditService.exportCsv(filters)
                                                   │
                                              QueryBuilder (no pagination, cap 10k)
                                              Readable stream, batch 500
                                                   │
                                              @Res() pipe (bypasses interceptor)
                                                   │
                                              text/csv + Content-Disposition

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/modules/audit/dto/audit-log-filter.dto.ts` | Create | Query params DTO: date_from, date_to, actor_id, action, resource_type, page, limit |
| `backend/src/modules/audit/dto/audit-log-item.dto.ts` | Create | Response DTO: id, actorId, actorName, action, resourceType, resourceId, justification, metadata, createdAt |
| `backend/src/modules/audit/audit.service.ts` | Modify | Add `list()` (paginated query + LEFT JOIN) and `exportCsv()` (batched Readable stream, 10k cap) |
| `backend/src/modules/audit/audit.controller.ts` | Create | `@Controller('audit-logs')`, two GET endpoints, guards |
| `backend/src/modules/audit/audit.module.ts` | Modify | Register `AuditController` in `controllers` array |
| `backend/src/app.module.ts` | Modify | Add `AuditModule` to imports |
| `database/migrations/0053_audit_logs_permission.sql` | Create | INSERT permission + grant to master + denormalize + bump version |
| `database/rollback/0053_audit_logs_permission.DOWN.sql` | Create | Reverse 0053 |
| `backend/src/modules/audit/audit.service.spec.ts` | Modify | Add specs for list() and exportCsv() |
| `backend/src/modules/audit/audit.controller.spec.ts` | Create | Guard and endpoint specs |

## Interfaces / Contracts

```typescript
// audit-log-filter.dto.ts
class AuditLogFilterDto {
  date_from?: string;   // ISO 8601
  date_to?: string;     // ISO 8601
  actor_id?: string;    // UUID
  action?: string;
  resource_type?: string;
  page?: number;        // default 1
  limit?: number;       // default 20, max 100
}

// audit-log-item.dto.ts (camelCase — interceptor converts to snake_case)
class AuditLogItemDto {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  justification: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// AuditController route: @Controller('audit-logs')
// @RequirePermission('READ', 'audit-logs') on each handler
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | AuditService.list() pagination, filters, LEFT JOIN | Mock repository, verify QueryBuilder calls |
| Unit | AuditService.exportCsv() batch streaming, 10k cap | Mock DataSource, verify Readable output |
| Unit | AuditController guard metadata | Reflector check for RequirePermission |
| Unit | AuditLogFilterDto validation | class-validator pipe |
| Integration | GET /api/audit-logs 200/401/403 | Supertest with seeded audit_events |
| Integration | GET /api/audit-logs/export.csv Content-Type | Supertest verify headers + CSV body |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary.

## Migration / Rollout

Migration 0053 is additive (INSERT permission, UPDATE roles/users). Rollback
removes the permission row and reverts roles/users denormalization. No schema
change to `audit_events`. Deploy backend before frontend.

## Open Questions

- None blocking. OD-1 (LOGIN recording), OD-2 (operador_sistema grant), and
  OD-3 (streaming CSV) are deferred per proposal.
