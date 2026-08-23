# Design: T5.1 Incident Workflow — Claim / Release + Available Operators + Status Catalog

Source: `proposal.md`. Migration **0019**.

## Architecture Overview

```
POST /api/incidents/:id/claim
POST /api/incidents/:id/release
GET  /api/incidents/:id/available-operators
GET  /api/incidents/statuses
       │
IncidentWorkflowController
       │  @RequirePermissions('CLAIM incidents')   [claim]
       │  @RequirePermissions('RELEASE incidents') [release]
       │  @RequirePermissions('READ incidents')    [available-operators]
       │  JwtAuthGuard only                        [statuses]
       ▼
IncidentWorkflowService
  ├── claim(incidentId, operatorUser) → IncidentEntity
  ├── release(incidentId, operatorUser) → IncidentEntity
  ├── availableOperators(incidentId, callerUser) → AvailableOperatorDto[]
  └── getStatuses() → string[]
       │
DataSource (raw SQL for atomicity)
       │
incidents table (claimed_by column — migration 0019)
organizations table (max_active_claims column — migration 0019)
```

## Architecture Decisions

| # | Decision | Why not the alternative |
|---|---|---|
| **D1** | Claim uses `UPDATE incidents SET claimed_by = :opId WHERE id = :id AND claimed_by IS NULL RETURNING *`. 0 rows = 409. | CAS-first avoids the TOCTOU race of SELECT-then-UPDATE. Consistent with T3.6's session rotation pattern. |
| **D2** | `max_active_claims` lives on `organizations` (default 5), not as an env var. | Per-org configurability is a GeoReporta requirement. Env vars can't be per-org. |
| **D3** | `IncidentWorkflowService` is a separate service class in the `incidents` module, not merged into `IncidentsService`. | `IncidentsService` handles CRUD; workflow is behavioral logic. Keeps `IncidentsService` focused and tests non-overlapping. |
| **D4** | `availableOperators` computes active claim count in a subquery (`SELECT COUNT(*) FROM incidents WHERE claimed_by = u.id AND status = 'in_progress'`), not via a separate service call. | One SQL round-trip; N+1 avoided. |
| **D5** | `GET /api/incidents/statuses` is a pure constant return — no DB read. | The IncidentStatus enum is code-defined; reading from DB would be a circular definition with no benefit. |

## TypeScript Contracts

```typescript
// DTOs

export class ClaimReleaseResponseDto {
  id!: string;
  title!: string;
  status!: IncidentStatus;
  priority!: IncidentPriority;
  claimedBy!: string | null;
  organizationId!: string | null;
  updatedAt!: Date;
}

export class AvailableOperatorDto {
  id!: string;
  name!: string;
  email!: string | null;
  activeClaimCount!: number;
}

export class StatusCatalogResponseDto {
  statuses!: string[];
}

// Error codes (incident-workflow.errors.ts)
export const INCIDENT_ALREADY_CLAIMED = 'INCIDENT_ALREADY_CLAIMED';
export const INCIDENT_NOT_CLAIMED     = 'INCIDENT_NOT_CLAIMED';
export const WRONG_ORGANIZATION       = 'WRONG_ORGANIZATION';
export const CLAIM_LIMIT_REACHED      = 'CLAIM_LIMIT_REACHED';
export const NOT_THE_CLAIMER          = 'NOT_THE_CLAIMER';

// Service interface
export interface IIncidentWorkflowService {
  claim(incidentId: string, operator: UserEntity): Promise<IncidentEntity>;
  release(incidentId: string, operator: UserEntity): Promise<IncidentEntity>;
  availableOperators(incidentId: string): Promise<AvailableOperatorDto[]>;
  getStatuses(): string[];
}
```

## TypeORM Entity Changes

### IncidentEntity (additive)

```typescript
// Add to backend/src/entities/incident.entity.ts

/** T5.1 — operator who claimed this incident. NULL = unclaimed. */
@Column({ name: 'claimed_by', type: 'uuid', nullable: true })
claimedBy!: string | null;
```

### OrganizationEntity (additive)

```typescript
// Add to backend/src/entities/organization.entity.ts

/** T5.1 — max simultaneous in_progress claims per operator. */
@Column({ name: 'max_active_claims', type: 'int', default: 5 })
maxActiveClaims!: number;
```

## Migration SQL (0019)

```sql
-- 0019_incident_claim.sql
BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_claimed_by ON incidents (claimed_by)
  WHERE claimed_by IS NOT NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_active_claims int NOT NULL DEFAULT 5
  CHECK (max_active_claims > 0);

-- Permission rows
INSERT INTO permissions (action, resource) VALUES
  ('CLAIM',   'incidents'),
  ('RELEASE', 'incidents')
ON CONFLICT DO NOTHING;

-- Grant to operator roles (adjust role names to match DB seed)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('operador_organizacion', 'operador_sistema')
  AND p.action IN ('CLAIM', 'RELEASE') AND p.resource = 'incidents'
ON CONFLICT DO NOTHING;

COMMIT;
```

## Raw SQL in Service (CAS pattern)

```typescript
// claim — CAS write
const [result] = await this.dataSource.query<IncidentEntity[]>(
  `UPDATE incidents
   SET claimed_by = $1, updated_at = now()
   WHERE id = $2 AND claimed_by IS NULL
   RETURNING *`,
  [operatorId, incidentId],
);
if (!result) throw new ConflictException(INCIDENT_ALREADY_CLAIMED);
return result;

// active claim count check
const [{ count }] = await this.dataSource.query<[{ count: string }]>(
  `SELECT COUNT(*)::int AS count FROM incidents
   WHERE claimed_by = $1 AND status = 'in_progress'`,
  [operatorId],
);
if (Number(count) >= maxActiveClaims) throw new HttpException(CLAIM_LIMIT_REACHED, 429);
```

## Deviations from Legacy

| Legacy behavior | NestJS design | Reason |
|---|---|---|
| `claimed_by` not present in NestJS schema at T5.1 start | Add via migration 0019 | The `assigned_to` column in NestJS is for admin assignment, a different concept |
| GeoReporta returns full `IncidentResource` (all fields) on claim/release | Return `ClaimReleaseResponseDto` (slim shape) | Avoids over-fetching; frontend needs confirmation fields, not full incident payload |
| `availableStatuses()` was on `StatusHistoryController` (unrelated controller) | Moved to `IncidentWorkflowController` as `GET /api/incidents/statuses` | Semantically belongs with incident workflow, not status history audit |
