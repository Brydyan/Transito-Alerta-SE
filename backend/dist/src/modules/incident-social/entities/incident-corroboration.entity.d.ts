import { IncidentEntity } from '../../../entities/incident.entity';
import { UserEntity } from '../../../entities/user.entity';
export declare class IncidentCorroboration {
    id: string;
    incident: IncidentEntity;
    user: UserEntity;
    comment: string | null;
    createdAt: Date;
}
