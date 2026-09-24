import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { AvailableOperatorDto } from './dto/available-operator.dto';
import { ClaimReleaseResponseDto } from './dto/claim-release-response.dto';
import { IncidentWorkflowService } from './incident-workflow.service';
export declare class IncidentWorkflowController {
    private readonly workflow;
    constructor(workflow: IncidentWorkflowService);
    claim(id: string, req: AuthenticatedRequest): Promise<ClaimReleaseResponseDto>;
    release(id: string, req: AuthenticatedRequest): Promise<ClaimReleaseResponseDto>;
    availableOperators(id: string): Promise<AvailableOperatorDto[]>;
    private toOperator;
}
