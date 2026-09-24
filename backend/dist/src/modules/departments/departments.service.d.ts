import { OrganizationsRepository } from '../organizations/organizations.repository';
import { CreateDepartmentInput, DepartmentRow, DepartmentsRepository, EnrichedDepartmentRow, ListDepartmentsFilters, UpdateDepartmentPatch } from './departments.repository';
export interface ListResult {
    items: EnrichedDepartmentRow[];
    total: number;
}
export interface DepartmentDetail {
    department: DepartmentRow;
    category_ids: string[];
}
export declare class DepartmentsService {
    private readonly deptRepo;
    private readonly orgRepo;
    constructor(deptRepo: DepartmentsRepository, orgRepo: OrganizationsRepository);
    create(input: CreateDepartmentInput): Promise<DepartmentRow>;
    createWithCategories(input: CreateDepartmentInput, categoryIds: string[]): Promise<DepartmentRow>;
    findById(id: string): Promise<DepartmentRow>;
    findByIdWithCategories(id: string): Promise<DepartmentDetail>;
    list(filters: ListDepartmentsFilters): Promise<ListResult>;
    update(id: string, patch: UpdateDepartmentPatch): Promise<DepartmentRow>;
    updateWithCategories(id: string, patch: UpdateDepartmentPatch, categoryIds: string[] | null): Promise<DepartmentRow>;
    delete(id: string): Promise<{
        id: string;
        deleted_at: Date;
    }>;
    findByUser(userId: string): Promise<DepartmentRow | null>;
    listIncidentCategoriesForForm(): Promise<Array<{
        id: string;
        name: string;
        parent_id: string | null;
    }>>;
}
