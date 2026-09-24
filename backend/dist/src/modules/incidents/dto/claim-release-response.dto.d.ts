import type { IncidentPriority, IncidentStatus } from '../../../entities/incident.entity';
export declare class ClaimReleaseResponseDto {
    id: string;
    title: string;
    status: IncidentStatus;
    priority: IncidentPriority;
    claimedBy: string | null;
    organizationId: string | null;
    updatedAt: Date;
}
