import { IncidentStatus } from '../../../entities/incident.entity';
export declare class UpdateIncidentStatusDto {
    status: IncidentStatus;
    closed_reason?: string;
}
