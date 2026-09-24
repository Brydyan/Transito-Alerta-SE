import { DataSource, Repository } from 'typeorm';
import { CommentEntity } from '../../entities/comment.entity';
import { IncidentEntity } from '../../entities/incident.entity';
export declare class IncidentApprovalService {
    private readonly dataSource;
    private readonly incidentRepo;
    private readonly commentRepo;
    private readonly logger;
    constructor(dataSource: DataSource, incidentRepo: Repository<IncidentEntity>, commentRepo: Repository<CommentEntity>);
    approve(notificationId: string, actorId: string): Promise<IncidentEntity>;
    reject(notificationId: string, actorId: string, reason: string): Promise<IncidentEntity>;
    private lockNotification;
    private assertPending;
    private lockIncident;
    private markNotificationAndSiblingsProcessed;
    private operatorStillActive;
}
