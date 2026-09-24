import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { DepartmentRow } from './departments.repository';
import { DepartmentsService, ListResult } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { ListDepartmentsQuery } from './dto/list-departments.query';
import { UpdateDepartmentDto } from './dto/update-department.dto';
export declare class DepartmentsController {
    private readonly departmentsService;
    constructor(departmentsService: DepartmentsService);
    list(query: ListDepartmentsQuery, req: AuthenticatedRequest): Promise<ListResult>;
    create(dto: CreateDepartmentDto, req: AuthenticatedRequest): Promise<DepartmentRow>;
    formData(): Promise<{
        incident_categories: Array<{
            id: string;
            name: string;
            parent_id: string | null;
        }>;
    }>;
    findOne(id: string, req: AuthenticatedRequest): Promise<{
        department: DepartmentRow;
        category_ids: string[];
    }>;
    update(id: string, dto: UpdateDepartmentDto, req: AuthenticatedRequest): Promise<DepartmentRow>;
    remove(id: string, req: AuthenticatedRequest): Promise<{
        id: string;
        deleted_at: Date;
    }>;
    private assertSameOrg;
}
