import { UserEntity } from './user.entity';
export declare class AuditEventEntity {
    id: string;
    actor: UserEntity;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    justification: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}
