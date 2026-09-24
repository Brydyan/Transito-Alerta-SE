import { UserEntity } from './user.entity';
import { IncidentEntity } from './incident.entity';
export declare class IncidentReporterEntity {
    incidentId: string;
    incident: IncidentEntity;
    user: UserEntity;
    userId: string;
    createdAt: Date;
}
