import { IncidentEntity } from '../../../entities/incident.entity';
import { UserEntity } from '../../../entities/user.entity';
export declare class IncidentFollower {
    id: string;
    incident: IncidentEntity;
    user: UserEntity;
    createdAt: Date;
}
