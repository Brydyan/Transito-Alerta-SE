import { IncidentPriority } from '../../../entities/incident.entity';
export declare class CreateIncidentCategoryDto {
    name: string;
    description?: string;
    parent_id?: string;
    priority?: IncidentPriority;
}
