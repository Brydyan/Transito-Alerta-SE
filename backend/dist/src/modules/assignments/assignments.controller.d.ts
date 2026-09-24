import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { AssignmentEntity } from '../../entities/assignment.entity';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentsService } from './assignments.service';
export declare class AssignmentsController {
    private readonly assignmentsService;
    constructor(assignmentsService: AssignmentsService);
    assign(dto: AssignIncidentDto): Promise<AssignmentEntity>;
    release(id: string): Promise<void>;
    list(incidentId: string, req: AuthenticatedRequest): Promise<AssignmentEntity[]>;
    update(id: string, dto: UpdateAssignmentDto): Promise<AssignmentEntity>;
    countByOperator(operatorId: string): Promise<{
        count: number;
        operatorId: string;
    }>;
}
