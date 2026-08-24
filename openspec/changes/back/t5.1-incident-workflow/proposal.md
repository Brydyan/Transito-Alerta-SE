# Proposal: T5.1 Incident Workflow — Claim / Release + Available Operators + Status Catalog

Port reference: `GeoReporta/backend/app/Domains/Incidents/Http/IncidentWorkflowController.php`,
`GeoReporta/backend/app/Domains/Incidents/Services/IncidentClaimService.php`,
`GeoReporta/backend/app/StatusHistory/Interfaces/StatusHistoryController.php`.
Next free migration: **0019**.

## Intent

Operators in GeoReporta can "claim" an incident (take responsibility for it) and later "release"
it. This pattern is absent from the NestJS backend today — the `incidents.assigned_to` column
exists for admin assignment but there is no operator-driven claim/release workflow, no claim limit
enforcement, and no status catalog endpoint.

T5.1 introduces the operator claim lifecycle as a self-contained capability on top of the existing
`incidents` module.

## Scope

### In Scope

- Migration `0019_incident_claim.sql` — adds `claimed_by uuid REFERENCES users(id)` to `incidents`,
  adds a `max_active_claims` column to `organizations` (default 5), and inserts RBAC permission
  rows for `CLAIM incidents` and `RELEASE incidents`. `+ .DOWN.sql`.
- `IncidentEntity`: add `claimedBy: string | null` column.
- `OrganizationEntity`: add `maxActiveClaims: number` column.
- `IncidentWorkflowService` in the existing `incidents` module — `claim(incidentId, operator)`,
  `release(incidentId, operator)`, `availableOperators(incident)`.
- `IncidentWorkflowController`: four endpoints:
  - `POST /api/incidents/:id/claim`
  - `POST /api/incidents/:id/release`
  - `GET /api/incidents/:id/available-operators`
  - `GET /api/incidents/statuses` (status catalog, no auth guard — or require `READ incidents`)
- Unit tests for `IncidentWorkflowService` (all guard conditions).
- E2e tests: claim happy path, double-claim conflict, release wrong operator, max claim limit.

### Out of Scope

- Status transitions (updating `status` field) — that is a separate workflow concern.
- WebSocket real-time notifications when a claim changes.
- Any frontend work.

## Capabilities

### New Capabilities
- `incident-workflow`: claim/release lifecycle + available-operators query + status catalog.

### Modified Capabilities
- `incidents` (existing module): `IncidentEntity` gains `claimedBy` column.
- `organizations` (existing module): `OrganizationEntity` gains `maxActiveClaims` column.

## Approach

`IncidentWorkflowService` mirrors `IncidentClaimService` from GeoReporta:

1. **Claim** — validate incident exists (404), validate not already claimed (409), validate operator
   belongs to incident's organization (403), validate operator's active claim count < org limit (429),
   then `UPDATE incidents SET claimed_by = :operatorId WHERE id = :id RETURNING *`.
2. **Release** — validate incident exists (404), validate caller is the current claimer (403), then
   `UPDATE incidents SET claimed_by = NULL WHERE id = :id RETURNING *`.
3. **Available operators** — query `users` where `role` = operator roles AND `organization_id` =
   incident's organization AND active claim count < org limit. Returns slim user list.
4. **Status catalog** — returns `IncidentStatus` enum values (no DB read, pure constant).

RBAC: `@RequirePermissions('CLAIM incidents')` on claim, `@RequirePermissions('RELEASE incidents')`
on release, `@RequirePermissions('READ incidents')` on available-operators. Status catalog is
auth-only (requires `JwtAuthGuard` but no specific permission).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/migrations/0019_incident_claim.sql` | New | `claimed_by` on incidents, `max_active_claims` on orgs, permission rows |
| `backend/src/entities/incident.entity.ts` | Modified | `claimedBy: string \| null` column |
| `backend/src/entities/organization.entity.ts` | Modified | `maxActiveClaims: number` column |
| `backend/src/modules/incidents/incident-workflow.service.ts` | New | claim/release/availableOperators logic |
| `backend/src/modules/incidents/incident-workflow.controller.ts` | New | 4 HTTP endpoints |
| `backend/src/modules/incidents/dto/` | New | `ClaimResponseDto`, `AvailableOperatorDto` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Race condition: two operators claim same incident simultaneously | Med | Use `UPDATE … WHERE claimed_by IS NULL RETURNING *`; 0 rows = 409 without SELECT first |
| `max_active_claims` missing from organization | Low | Default 5 in migration; service guard reads from org |
| Permission string naming diverges from house convention | Low | Follow `ACTION resource` pattern used throughout (e.g., `CLAIM incidents`) |

## Rollback Plan

1. Revert `incident-workflow` controller and service (self-contained additions).
2. Apply `database/rollback/0019_incident_claim.DOWN.sql` — drops `claimed_by` from incidents,
   `max_active_claims` from organizations, removes permission rows.

## Dependencies

- T2.1 Incidents module (existing `IncidentEntity`, `IncidentsService`).
- T3.1 Roles / T3.2 Organizations (existing RBAC + `OrganizationEntity`).
- T3.6 Invitations (permission infrastructure in place).

## Success Criteria

- [ ] `POST /api/incidents/:id/claim` by eligible operator sets `claimed_by` and returns updated incident.
- [ ] Second claim on same incident returns 409.
- [ ] Operator from different org gets 403.
- [ ] Operator at `max_active_claims` limit gets 429.
- [ ] `POST /api/incidents/:id/release` by the claiming operator clears `claimed_by`.
- [ ] Release by non-claimer gets 403.
- [ ] `GET /api/incidents/:id/available-operators` returns only org-matching operators under the limit.
- [ ] `GET /api/incidents/statuses` returns all status enum values without auth restriction beyond JWT.
- [ ] `npm test && npm run test:e2e` green, `npm run lint && npm run typecheck` clean.
