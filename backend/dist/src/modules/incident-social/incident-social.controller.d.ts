import { IncidentSocialService } from './incident-social.service';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
export declare class IncidentSocialController {
    private readonly socialService;
    constructor(socialService: IncidentSocialService);
    follow(incidentId: string, req: AuthenticatedRequest): Promise<void>;
    unfollow(incidentId: string, req: AuthenticatedRequest): Promise<void>;
    corroborate(incidentId: string, req: AuthenticatedRequest, comment: string | null): Promise<void>;
}
