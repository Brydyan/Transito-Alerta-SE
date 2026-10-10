import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { IsNull, Repository } from 'typeorm';

import { REDIS_CLIENT } from '../../infra/core.module';
import { AssignmentEntity } from './entities/assignment.entity';
import { AuthContext, SubjectScope } from '../../shared/authz/subject-scope';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { IncidentWorkflowService } from '../incidents/incident-workflow.service';
import { CLAIM_LIMIT_REACHED } from '../incidents/incident-workflow.errors';

const SYSTEM_ADMIN_ROLE = 'master';

export interface AssignOptions {
  /** F7 D3 — explicit confirmation that the admin accepts the cap-override. */
  overrideCap?: boolean;
  /** F7 D3 — required when `overrideCap` is true. */
  overrideReason?: string;
}

export interface UpdateOptions {
  overrideCap?: boolean;
  overrideReason?: string;
}

/**
 * AssignmentsService (R5) — design DAG `Assignments -> Incidents, Users,
 * Permissions`. Claim/release lifecycle; one active assignment per incident
 * at a time (a second claim is a 409 Conflict, not a silent overwrite).
 *
 * F7 emergency-dispatch — this service is the second consumer of the
 * per-org active-claim cap. Before F7 only `claim()` (autoasignación)
 * validated it; `assign()` here skipped it and a `admin_org` could
 * saturate an operator in silence. Now both paths read the same
 * `IncidentWorkflowService.getMaxActiveClaimsFor` / `getActiveClaimCount`
 * helpers (D1) and both throw the SAME `CLAIM_LIMIT_REACHED` code.
 *
 * F7 D2/D3 — admin exception to the cap, restricted to `critical`
 * incidents and requiring an explicit `override_cap` + a non-empty
 * `override_reason`. The exception is persisted on the assignment row
 * (the project has no separate audit table) and surfaced to the
 * operator via the Telegram notification (D11).
 *
 * F7 D12 — assignment, release and update now require the caller's
 * scope to match BOTH the incident's organization AND the operator's
 * organization. `master` keeps global scope (per 0015).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(AssignmentEntity)
    private readonly assignmentRepo: Repository<AssignmentEntity>,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly incidentsRepository: IncidentsRepository,
    private readonly workflow: IncidentWorkflowService,
  ) {}

  async assign(
    incidentId: string,
    operatorId: string,
    role: string = 'primary',
    caller: AuthContext,
    options: AssignOptions = {},
  ): Promise<AssignmentEntity> {
    // 1) Load incident under the caller's scope (D12) — `findOne` will
    // 404 if the incident belongs to a different org than the caller.
    const incident = await this.incidentsRepository.findOne(incidentId, caller.scope);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    // 2) Resolve the operator and check org match (D12). The operator
    // must belong to the same org as the incident (and the caller).
    const operator = await this.loadOperator(operatorId);
    if (!operator) {
      throw new NotFoundException(`Operator ${operatorId} not found`);
    }
    this.assertSameOrg(operator.organizationId, incident.organization_id, caller, 'operator');

    // 3) Existing-assignment check (kept from pre-F7).
    const existing = await this.assignmentRepo.findOne({
      where: { incidentId, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`Incident ${incidentId} is already assigned`);
    }

    // 4) Per-org cap check (F7 D1) — same rule as `claim()`. The
    // `override_cap` flag toggles whether the exception is allowed;
    // `incident.priority === 'critical'` and a non-empty reason are
    // the remaining gates.
    await this.assertClaimCapAllowed(
      operatorId,
      incident.organization_id,
      incident.priority,
      options,
      caller,
    );

    // 5) Persist. The override fields are written only when the caller
    // asserted `override_cap === true` AND the gates above let them
    // through; otherwise both are NULL.
    const shouldOverride = options.overrideCap === true && incident.priority === 'critical';
    const entity = this.assignmentRepo.create({
      incidentId,
      operatorId,
      role,
      capOverrideReason: shouldOverride ? options.overrideReason ?? null : null,
      capOverrideBy: shouldOverride ? caller.userId : null,
    });
    const saved = await this.assignmentRepo.save(entity);

    // 6) Publish — both EventEmitter2 (in-process listeners like the
    // Telegram operator-notification) and the incidents Redis stream
    // (RealtimeStreamsConsumer + other API instances). Payload
    // includes override reason so D11's listener can include it in
    // the operator's message.
    this.eventEmitter.emit('incident.assigned', {
      ...saved,
      operatorId: saved.operatorId,
      incidentId: saved.incidentId,
      capOverrideReason: saved.capOverrideReason,
    });
    await this.redis.xadd(
      INCIDENTS_STREAM_KEY,
      '*',
      'type',
      'incident.assigned',
      'data',
      JSON.stringify(saved),
    );
    return saved;
  }

  /**
   * T6.2 — soft delete instead of hard delete. Sets `deleted_at = new Date()`
   * so the row survives for audit purposes and the partial UNIQUE index
   * `uq_assignments_active` (migration 0026) allows re-assigning the same
   * operator to the same incident after release.
   *
   * F7 D12 — also checks that the parent incident belongs to the caller's
   * organization (master global; others must match).
   */
  async release(assignmentId: string, caller: AuthContext): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    const incident = await this.incidentsRepository.findOne(
      assignment.incidentId,
      caller.scope,
    );
    if (!incident) {
      throw new ForbiddenException(
        'WRONG_ORGANIZATION: assignment belongs to a different organization',
      );
    }
    await this.assignmentRepo.update(assignmentId, { deletedAt: new Date() });
  }

  /**
   * Resolves the PARENT incident under the caller's scope first (T3.2
   * design D3 table) — assignments do not scope their own rows. 404 when
   * the parent is invisible, even though the caller holds READ
   * assignments.
   */
  async list(incidentId: string, scope: SubjectScope): Promise<AssignmentEntity[]> {
    const incident = await this.incidentsRepository.findOne(incidentId, scope);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }
    // T6.2: only return active (non-soft-deleted) assignments
    return this.assignmentRepo.find({ where: { incidentId, deletedAt: IsNull() } });
  }

  /**
   * T6.4 — update operator_id and/or role. At least one field is required.
   * T5.6 originally only accepted operatorId; now also accepts role.
   *
   * F7 D12 — operatorId change re-runs the org match and the cap check
   * (the new operator must belong to the same org AND be under cap,
   * with the same `override_cap` escape hatch as `assign()`).
   */
  async update(
    id: string,
    dto: { operator_id?: string; role?: string },
    caller: AuthContext,
    options: UpdateOptions = {},
  ): Promise<AssignmentEntity> {
    const existing = await this.assignmentRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Assignment ${id} not found`);
    }
    if (!dto.operator_id && !dto.role) {
      throw new BadRequestException('Provide operator_id and/or role');
    }
    const incident = await this.incidentsRepository.findOne(
      existing.incidentId,
      caller.scope,
    );
    if (!incident) {
      throw new ForbiddenException(
        'WRONG_ORGANIZATION: assignment belongs to a different organization',
      );
    }
    if (dto.operator_id && dto.operator_id !== existing.operatorId) {
      const operator = await this.loadOperator(dto.operator_id);
      if (!operator) {
        throw new NotFoundException(`Operator ${dto.operator_id} not found`);
      }
      this.assertSameOrg(
        operator.organizationId,
        incident.organization_id,
        caller,
        'operator',
      );
      await this.assertClaimCapAllowed(
        dto.operator_id,
        incident.organization_id,
        incident.priority,
        options,
        caller,
      );
      existing.operatorId = dto.operator_id;
      const shouldOverride = options.overrideCap === true && incident.priority === 'critical';
      existing.capOverrideReason = shouldOverride ? options.overrideReason ?? null : null;
      existing.capOverrideBy = shouldOverride ? caller.userId : null;
    }
    if (dto.role) existing.role = dto.role;
    return this.assignmentRepo.save(existing);
  }

  // ---- F7 private helpers (D1/D3/D12) -----------------------------------

  /**
   * Loads an operator's `organization_id` for the org-match check. Uses
   * the entity's repository indirectly through TypeORM DataSource
   * to avoid adding a new UsersService dependency for a single read.
   */
  private async loadOperator(
    operatorId: string,
  ): Promise<{ id: string; organizationId: string | null } | null> {
    // F7 W4 — read the operator's org through the workflow's typed
    // helper instead of reaching into its private `dataSource`.
    const organizationId = await this.workflow.findUserOrganizationId(operatorId);
    if (organizationId === null) {
      // null from the helper means "not found OR soft-deleted" — same
      // 404 the controller should surface to the caller.
      return null;
    }
    return { id: operatorId, organizationId };
  }

  /** Throws `WRONG_ORGANIZATION` (403) if scope doesn't match. */
  private assertSameOrg(
    operatorOrg: string | null,
    incidentOrg: string | null,
    caller: AuthContext,
    _kind: 'operator',
  ): void {
    if (caller.roleName === SYSTEM_ADMIN_ROLE) return;
    if (!caller.organizationId) {
      throw new ForbiddenException('WRONG_ORGANIZATION: caller has no organization');
    }
    if (operatorOrg !== caller.organizationId) {
      throw new ForbiddenException('WRONG_ORGANIZATION: operator outside caller org');
    }
    if (incidentOrg && incidentOrg !== caller.organizationId) {
      throw new ForbiddenException('WRONG_ORGANIZATION: incident outside caller org');
    }
  }

  /**
   * The single cap-check entry point used by both `assign()` and
   * `update()` (D1). Reads the same numbers the auto-claim path
   * reads, so the two paths are guaranteed-parity. Throws:
   *  - 429 CLAIM_LIMIT_REACHED when at cap and no override was asked
   *  - 422 when override was asked but the incident isn't critical
   *  - 422 when override was asked but the reason is empty
   *  - 403 when caller is not master and cannot override
   */
  private async assertClaimCapAllowed(
    operatorId: string,
    organizationId: string | null,
    incidentPriority: string,
    options: { overrideCap?: boolean; overrideReason?: string },
    caller: AuthContext,
  ): Promise<void> {
    if (!organizationId) return; // no org → no cap

    const maxActive = await this.workflow.getMaxActiveClaimsFor(organizationId);
    const active = await this.workflow.getActiveClaimCount(operatorId);
    if (active < maxActive) return; // under cap — proceed

    // At cap. Without an override, reject with the SAME 429 code the
    // auto-claim path emits.
    if (!options.overrideCap) {
      throw new HttpException(CLAIM_LIMIT_REACHED, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Override asked. Two gates left: priority must be critical, and
    // the reason must be a non-empty string.
    if (incidentPriority !== 'critical') {
      throw new UnprocessableEntityException({
        code: 'CAP_OVERRIDE_NOT_ALLOWED_FOR_PRIORITY',
        message: 'Cap override is only allowed for critical incidents',
      });
    }
    if (!options.overrideReason || options.overrideReason.trim().length === 0) {
      throw new UnprocessableEntityException({
        code: 'CAP_OVERRIDE_REASON_REQUIRED',
        message: 'Cap override requires a non-empty reason',
      });
    }
    // Only master / admin_org can override (those are the only roles
    // with ASSIGN assignments per 0015; this is a defense-in-depth
    // check in case a future role is added).
    if (
      caller.roleName !== SYSTEM_ADMIN_ROLE &&
      caller.roleName !== 'admin_org'
    ) {
      throw new ForbiddenException(
        'CAP_OVERRIDE_FORBIDDEN: only master or admin_org can override the cap',
      );
    }
  }
}
