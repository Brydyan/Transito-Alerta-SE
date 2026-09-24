import { IncidentPriority } from '../../../entities/incident.entity';
export declare class CreateIncidentDto {
    title: string;
    description?: string;
    lat: number;
    lng: number;
    category_id?: string;
    priority?: IncidentPriority;
    is_anonymous?: boolean;
}
