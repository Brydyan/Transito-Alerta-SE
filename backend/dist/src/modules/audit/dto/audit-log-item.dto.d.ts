export declare class AuditLogItemDto {
    id: string;
    actorId: string;
    actorName: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    justification: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}
