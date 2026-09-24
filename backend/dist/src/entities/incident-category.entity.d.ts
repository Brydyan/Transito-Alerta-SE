import { IncidentPriority } from './incident.entity';
export declare class IncidentCategoryEntity {
    id: string;
    name: string;
    description: string | null;
    parentId: string | null;
    priority: IncidentPriority | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
