import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { StatusHistoryListResult, StatusHistoryService } from './status-history.service';
export declare class StatusHistoryController {
    private readonly statusHistoryService;
    constructor(statusHistoryService: StatusHistoryService);
    list(incidentId: string, req: AuthenticatedRequest): Promise<StatusHistoryListResult>;
}
