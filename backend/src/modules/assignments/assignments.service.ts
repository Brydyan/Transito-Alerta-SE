import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { Repository } from 'typeorm';

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
    const existing = await this.assignmentRepo.findOne({ where: { incidentId } });
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

  async release(assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    await this.assignmentRepo.delete(assignmentId);
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
    return this.assignmentRepo.find({ where: { incidentId } });
  }
}
