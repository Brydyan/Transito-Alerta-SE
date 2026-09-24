import { UserEntity } from '../../../entities/user.entity';
import { IncidentEntity } from '../../../entities/incident.entity';
export declare enum NotificationType {
    INCIDENT_CREATED = "incident.created",
    INCIDENT_ASSIGNED = "incident.assigned",
    INCIDENT_STATUS_CHANGED = "incident.status_changed",
    COMMENT_ADDED = "comment.added",
    INCIDENT_PENDING_APPROVAL = "incident_pending_approval"
}
export declare class Notification {
    id: string;
    user_id: string;
    incident_id: string | null;
    type: NotificationType;
    message: string;
    data: Record<string, any>;
    read: boolean;
    created_at: Date;
    processed_at: Date | null;
    deleted_at: Date | null;
    updated_at: Date;
    user: UserEntity;
    incident: IncidentEntity;
}
