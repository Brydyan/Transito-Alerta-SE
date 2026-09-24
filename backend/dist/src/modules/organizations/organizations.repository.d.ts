import { DataSource } from 'typeorm';
export interface OrganizationRow {
    id: string;
    name: string;
    zone_id: string | null;
    max_active_claims: number;
    created_at: Date;
    parent_id: string | null;
    incident_category_id: string | null;
}
export interface CreateOrganizationInput {
    name: string;
    zoneId: string | null;
    parentId?: string | null;
}
export interface UpdateOrganizationPatch {
    name: string | undefined;
    zoneIdProvided: boolean;
    zoneId: string | null | undefined;
    parentIdProvided: boolean;
    parentId: string | null | undefined;
}
export interface ListFilters {
    search?: string;
    page?: number;
    perPage?: number;
}
export declare class OrganizationsRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    create(input: CreateOrganizationInput): Promise<OrganizationRow>;
    update(id: string, patch: UpdateOrganizationPatch): Promise<OrganizationRow | null>;
    updateCategory(id: string, incidentCategoryId: string | null): Promise<OrganizationRow | null>;
    delete(id: string): Promise<boolean>;
    findById(id: string): Promise<OrganizationRow | null>;
    findAll(filters: ListFilters): Promise<{
        items: OrganizationRow[];
        total: number;
    }>;
    findNotifiedFor(zoneId: string, categoryId: string | null): Promise<OrganizationRow[]>;
}
