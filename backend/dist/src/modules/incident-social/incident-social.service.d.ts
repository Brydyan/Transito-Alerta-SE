import { Repository } from 'typeorm';
import { IncidentFollower } from './entities/incident-follower.entity';
import { IncidentCorroboration } from './entities/incident-corroboration.entity';
import { IncidentsService } from '../incidents/incidents.service';
export declare class IncidentSocialService {
    private followerRepo;
    private corroborationRepo;
    private incidentsService;
    constructor(followerRepo: Repository<IncidentFollower>, corroborationRepo: Repository<IncidentCorroboration>, incidentsService: IncidentsService);
    follow(incidentId: string, userId: string): Promise<void>;
    unfollow(incidentId: string, userId: string): Promise<void>;
    corroborate(incidentId: string, userId: string, comment: string | null): Promise<void>;
}
