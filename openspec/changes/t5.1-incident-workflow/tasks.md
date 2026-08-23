# Tasks: T5.1 Incident Workflow — Claim / Release + Available Operators + Status Catalog

Source: `proposal.md`, `specs/incident-workflow/spec.md`, `design.md`.
Migration: **0019**. Strict TDD — write the test first on every behavioral item.
Run `npm test` baseline before Phase 1. All phases must leave `npm test && npm run test:e2e` green.

## Phase 0: Error Constants

- [ ] 0.1 Create `backend/src/modules/incidents/incident-workflow.errors.ts` with exported constants:
      `INCIDENT_ALREADY_CLAIMED`, `INCIDENT_NOT_CLAIMED`, `WRONG_ORGANIZATION`,
      `CLAIM_LIMIT_REACHED`, `NOT_THE_CLAIMER`.

## Phase 1: Migration

- [ ] 1.1 Create `database/migrations/0019_incident_claim.sql` — adds `claimed_by uuid REFERENCES
      users(id) ON DELETE SET NULL` to `incidents`; adds `max_active_claims int NOT NULL DEFAULT 5`
      to `organizations`; inserts permission rows `CLAIM incidents` and `RELEASE incidents`;
      grants both to `operador_organizacion` and `operador_sistema` via `role_permissions`.
- [ ] 1.2 Create `database/rollback/0019_incident_claim.DOWN.sql` — drops `claimed_by` from
      `incidents`, `max_active_claims` from `organizations`, removes permission rows.
- [ ] 1.3 Apply 0019 to local Postgres; verify existing incident rows have `claimed_by = NULL`
      and org rows have `max_active_claims = 5`.
- [ ] 1.4 Add entry to `database/MIGRATION_LOG.md`.

## Phase 2: Entity Changes

- [ ] 2.1 `backend/src/entities/incident.entity.ts`: add `@Column({name:'claimed_by',type:'uuid',
      nullable:true}) claimedBy!: string | null;`.
- [ ] 2.2 `backend/src/entities/organization.entity.ts`: add `@Column({name:'max_active_claims',
      type:'int',default:5}) maxActiveClaims!: number;`.

## Phase 3: Service

- [ ] 3.1 Create `backend/src/modules/incidents/incident-workflow.service.ts` with constructor
      injecting `DataSource` and `@InjectRepository(OrganizationEntity) orgRepo`.
- [ ] 3.2 Implement `claim(incidentId: string, operator: UserEntity): Promise<IncidentEntity>`:
      - Validate incident exists (404 NotFoundException).
      - Validate `incident.organizationId === operator.organizationId` (403), skip if system admin.
      - Load org, validate active claim count < `maxActiveClaims` (429).
      - CAS UPDATE `WHERE claimed_by IS NULL RETURNING *` → 0 rows = 409 INCIDENT_ALREADY_CLAIMED.
- [ ] 3.3 Implement `release(incidentId: string, operator: UserEntity): Promise<IncidentEntity>`:
      - Validate incident exists (404).
      - Validate `incident.claimedBy !== null` (409 INCIDENT_NOT_CLAIMED).
      - Validate `incident.claimedBy === operator.id` (403 NOT_THE_CLAIMER).
      - UPDATE `SET claimed_by = NULL RETURNING *`.
- [ ] 3.4 Implement `availableOperators(incidentId: string): Promise<AvailableOperatorDto[]>`:
      - Load incident (404 if not found).
      - SQL: users with operator roles in incident's org, plus active claim count subquery,
        filtering to those with `count < org.maxActiveClaims`.
- [ ] 3.5 Implement `getStatuses(): string[]` — return `['pending', 'in_progress', 'resolved']` (constant, no DB).

## Phase 4: Unit Tests (Service)

- [ ] 4.1 `backend/src/modules/incidents/incident-workflow.service.spec.ts`:
      - `claim`: happy path, already-claimed 409, wrong org 403, at-limit 429, incident-not-found 404.
      - `release`: happy path, not-claimer 403, not-claimed 409, incident-not-found 404.
      - `availableOperators`: returns eligible operators, excludes at-limit operators, excludes
        operators from other orgs.
      - `getStatuses`: returns exact array.

## Phase 5: Controller

- [ ] 5.1 Create `backend/src/modules/incidents/incident-workflow.controller.ts` with:
      - `@Post(':id/claim')` → `@UseGuards(JwtAuthGuard)` + `@RequirePermissions('CLAIM incidents')` → `workflowService.claim(id, req.user)` → `ClaimReleaseResponseDto`.
      - `@Post(':id/release')` → same guards with `RELEASE incidents` → `workflowService.release(id, req.user)` → `ClaimReleaseResponseDto`.
      - `@Get(':id/available-operators')` → `READ incidents` guard → `workflowService.availableOperators(id)`.
      - `@Get('statuses')` → `JwtAuthGuard` only → `workflowService.getStatuses()`.
- [ ] 5.2 Register `IncidentWorkflowController` and `IncidentWorkflowService` in
      `backend/src/modules/incidents/incidents.module.ts`.
- [ ] 5.3 Verify `GET /api/incidents/statuses` is registered BEFORE `GET /api/incidents/:id`
      to avoid route shadowing (`'statuses'` matched as `:id`).

## Phase 6: DTOs

- [ ] 6.1 Create `backend/src/modules/incidents/dto/claim-release-response.dto.ts` with fields
      `id, title, status, priority, claimedBy, organizationId, updatedAt`.
- [ ] 6.2 Create `backend/src/modules/incidents/dto/available-operator.dto.ts` with
      `id, name, email, activeClaimCount`.

## Phase 7: E2E Tests

- [ ] 7.1 `backend/test/e2e/incident-workflow.e2e-spec.ts`:
      - Seed org + 2 operators + 1 incident in that org.
      - Operator A claims → 200, `claimedBy = A.id`.
      - Operator B attempts to claim same incident → 409.
      - Operator B (different org) attempts → 403.
      - Operator A releases → 200, `claimedBy = null`.
      - Operator at `maxActiveClaims` limit → 429.
      - `GET /statuses` → 200 with 3 values.
      - Unauthenticated claim → 401.

## Phase 8: Lint + Type Check

- [ ] 8.1 `npm run lint` — zero new violations.
- [ ] 8.2 `npm run typecheck` — no errors.
- [ ] 8.3 `npm run build` — clean.
- [ ] 8.4 `npm test && npm run test:e2e` — full suite green.
