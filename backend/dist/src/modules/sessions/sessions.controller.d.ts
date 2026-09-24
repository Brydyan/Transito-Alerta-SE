import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { SessionsService } from './sessions.service';
export declare class SessionsController {
    private readonly sessionsService;
    constructor(sessionsService: SessionsService);
    revoke(id: string, req: AuthenticatedRequest): Promise<void>;
}
