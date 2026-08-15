import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignmentEntity } from '../../entities/assignment.entity';

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
  ) {}

  async assign(incidentId: string, operatorId: string, role = 'primary'): Promise<AssignmentEntity> {
    const existing = await this.assignmentRepo.findOne({ where: { incidentId } });
    if (existing) {
      throw new ConflictException(`Incident ${incidentId} is already assigned`);
    }

    const entity = this.assignmentRepo.create({ incidentId, operatorId, role });
    const saved = await this.assignmentRepo.save(entity);
    this.eventEmitter.emit('incident.assigned', saved);
    return saved;
  }

  async release(assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    await this.assignmentRepo.delete(assignmentId);
  }

  list(incidentId: string): Promise<AssignmentEntity[]> {
    return this.assignmentRepo.find({ where: { incidentId } });
  }
}
