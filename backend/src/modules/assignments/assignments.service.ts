import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { IsNull, Repository } from 'typeorm';

import { REDIS_CLIENT } from '../../core/core.module';
import { AssignmentEntity } from '../../entities/assignment.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';

/**
 * AssignmentsService (R5) — design DAG `Assignments -> Incidents, Users,
 * Permissions`. Claim/release lifecycle; one active assignment per incident
 * at a time (a second claim is a 409 Conflict, not a silent overwrite).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(AssignmentEntity)
    private readonly assignmentRepo: Repository<AssignmentEntity>,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly incidentsRepository: IncidentsRepository,
  ) {}

  async assign(incidentId: string, operatorId: string, role = 'primary'): Promise<AssignmentEntity> {
    // T6.2: only check active (non-soft-deleted) assignments for conflict
    const existing = await this.assignmentRepo.findOne({ where: { incidentId, deletedAt: IsNull() } });
    if (existing) {
      throw new ConflictException(`Incident ${incidentId} is already assigned`);
    }

    const entity = this.assignmentRepo.create({ incidentId, operatorId, role });
    const saved = await this.assignmentRepo.save(entity);
    this.eventEmitter.emit('incident.assigned', saved);
    // Previously local-only (EventEmitter2 never leaves this process): a
    // claim was invisible to RealtimeStreamsConsumer and to every other API
    // instance behind the load balancer — CC4 requires Redis Streams
    // delivery for incident:assigned same as incident:created/status_changed.
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
   */
  async release(assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
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
   */
  async update(id: string, dto: { operator_id?: string; role?: string }): Promise<AssignmentEntity> {
    const existing = await this.assignmentRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Assignment ${id} not found`);
    }
    if (!dto.operator_id && !dto.role) {
      throw new BadRequestException('Provide operator_id and/or role');
    }
    if (dto.operator_id) existing.operatorId = dto.operator_id;
    if (dto.role) existing.role = dto.role;
    return this.assignmentRepo.save(existing);
  }
}
