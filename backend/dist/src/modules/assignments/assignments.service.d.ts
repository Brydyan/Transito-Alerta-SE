import { EventEmitter2 } from '@nestjs/event-emitter';
import type Redis from 'ioredis';
import { Repository } from 'typeorm';
import { AssignmentEntity } from '../../entities/assignment.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
import { IncidentsRepository } from '../incidents/incidents.repository';
export declare class AssignmentsService {
    private readonly assignmentRepo;
    private readonly eventEmitter;
    private readonly redis;
    private readonly incidentsRepository;
    constructor(assignmentRepo: Repository<AssignmentEntity>, eventEmitter: EventEmitter2, redis: Redis, incidentsRepository: IncidentsRepository);
    assign(incidentId: string, operatorId: string, role?: string): Promise<AssignmentEntity>;
    release(assignmentId: string): Promise<void>;
    list(incidentId: string, scope: SubjectScope): Promise<AssignmentEntity[]>;
    update(id: string, dto: {
        operator_id?: string;
        role?: string;
    }): Promise<AssignmentEntity>;
}
