export type IncidentStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';
export declare class IncidentEntity {
    id: string;
    title: string;
    description: string | null;
    location: string;
    status: IncidentStatus;
    priority: IncidentPriority;
    citizenId: string;
    isAnonymous: boolean;
    assignedTo: string | null;
    zoneId: string | null;
    geofenceMatched: boolean;
    categoryId: string | null;
    organizationId: string | null;
    claimedBy: string | null;
    claimedAt: Date | null;
    resolutionDate: Date | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    rejectedBy: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
