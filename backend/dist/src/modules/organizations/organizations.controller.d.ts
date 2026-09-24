import { AssignCategoryDto } from './dto/assign-category.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { NotifiedForQueryDto } from './dto/notified-for-query.dto';
import { OrganizationRow } from './organizations.repository';
import { ListResult, OrganizationFormData, OrganizationTreeNode, OrganizationWithClaimable, OrganizationsService } from './organizations.service';
export declare class OrganizationsController {
    private readonly organizationsService;
    constructor(organizationsService: OrganizationsService);
    list(search?: string, page?: string, perPage?: string): Promise<ListResult>;
    getTree(): Promise<OrganizationTreeNode[]>;
    getFormData(): Promise<OrganizationFormData>;
    getNotifiedFor(dto: NotifiedForQueryDto): Promise<OrganizationWithClaimable[]>;
    findOne(id: string): Promise<OrganizationRow>;
    create(dto: CreateOrganizationDto): Promise<OrganizationRow>;
    update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationRow>;
    assignCategory(id: string, dto: AssignCategoryDto): Promise<OrganizationRow>;
    remove(id: string): Promise<void>;
}
