export declare class OrganizationEntity {
    id: string;
    name: string;
    zoneId: string | null;
    parentId: string | null;
    incidentCategoryId: string | null;
    maxActiveClaims: number;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
