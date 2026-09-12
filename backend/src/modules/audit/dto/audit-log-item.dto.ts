/**
 * F6 — response DTO for `GET /api/audit-logs`.
 *
 * CamelCase fields here are translated to snake_case by the global
 * `SnakeCaseResponseInterceptor` registered in `main.ts`. The CSV
 * endpoint bypasses the interceptor (uses `@Res()` directly) and
 * emits raw snake_case headers — the projection here mirrors that
 * column order so list and export stay in lockstep.
 *
 * `actorName` is `null` (NOT omitted) when the `users` row behind
 * the actor_id is missing — LEFT JOIN keeps the audit row and the
 * API surfaces that as an explicit null per spec scenario R1-S1.
 */
export class AuditLogItemDto {
  id!: string;
  actorId!: string;
  actorName!: string | null;
  action!: string;
  resourceType!: string;
  resourceId!: string | null;
  justification!: string | null;
  metadata!: Record<string, unknown>;
  createdAt!: Date;
}
