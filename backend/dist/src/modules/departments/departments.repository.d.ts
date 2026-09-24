import { DataSource } from 'typeorm';
export interface DepartmentRow {
    id: string;
    name: string;
    description: string | null;
    organization_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
export interface EnrichedDepartmentRow extends DepartmentRow {
    organization_name: string;
    user_count: number;
    category_ids: string[];
}
export interface CreateDepartmentInput {
    name: string;
    description: string | null;
    organizationId: string;
}
export interface UpdateDepartmentPatch {
    name: string | undefined;
    descriptionProvided: boolean;
    description: string | null | undefined;
}
export interface ListDepartmentsFilters {
    organizationId: string;
    search?: string;
    page?: number;
    perPage?: number;
}
export declare class DepartmentsRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    create(input: CreateDepartmentInput): Promise<DepartmentRow>;
    softDelete(id: string): Promise<{
        id: string;
        deleted_at: Date;
    } | null>;
    findById(id: string): Promise<DepartmentRow | null>;
    findByIdActive(id: string): Promise<DepartmentRow | null>;
    existsByOrgAndName(organizationId: string, name: string): Promise<boolean>;
    list(filters: ListDepartmentsFilters): Promise<{
        items: EnrichedDepartmentRow[];
        total: number;
    }>;
    findByUser(userId: string): Promise<DepartmentRow | null>;
    orphanIncidents(departmentId: string): Promise<number>;
    replaceCategoriesForDept(deptId: string, categoryIds: string[]): Promise<void>;
    loadCategoryIdsByDeptIds(deptIds: string[]): Promise<Map<string, string[]>>;
    update(id: string, patch: UpdateDepartmentPatch): Promise<DepartmentRow | null>;
}
