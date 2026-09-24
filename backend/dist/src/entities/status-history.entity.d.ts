export declare class StatusHistoryEntity {
    id: string;
    incidentId: string;
    changedByUserId: string | null;
    previousStatus: string;
    newStatus: string;
    eventId: string;
    notes: string | null;
    createdAt: Date;
}
