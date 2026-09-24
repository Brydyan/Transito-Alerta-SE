import { IncidentPriority } from '../../../entities/incident.entity';
export declare class UpdateIncidentCategoryDto {
    name?: string;
    description?: string | null;
    parent_id?: string | null;
    priority?: IncidentPriority | null;
}
