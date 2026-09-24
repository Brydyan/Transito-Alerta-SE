import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { MenuOptionEndpointEntity } from './entities/menu-option-endpoint.entity';
import { ApiEndpointEntity } from './entities/api-endpoint.entity';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { SetRoleAccessDto } from './dto/set-role-access.dto';
import { AssignEndpointsDto } from './dto/assign-endpoints.dto';
import { MenuOptionsService, RoleMatrix, PaginatedResult } from './menu-options.service';
export declare class MenuOptionsController {
    private readonly menuOptionsService;
    constructor(menuOptionsService: MenuOptionsService);
    findAll(): Promise<MenuOptionEntity[]>;
    getEndpointCatalog(page?: string, limit?: string, route?: string, method?: string, description?: string, module?: string): Promise<PaginatedResult<ApiEndpointEntity>>;
    findOne(id: string): Promise<MenuOptionEntity>;
    create(dto: CreateMenuOptionDto): Promise<MenuOptionEntity>;
    update(id: string, dto: UpdateMenuOptionDto): Promise<MenuOptionEntity>;
    delete(id: string): Promise<void>;
    getRoleMatrix(id: string): Promise<RoleMatrix>;
    setRoleAccess(id: string, roleId: string, dto: SetRoleAccessDto): Promise<MenuOptionRoleEntity>;
    getAssignedEndpoints(id: string): Promise<ApiEndpointEntity[]>;
    assignEndpoints(id: string, dto: AssignEndpointsDto): Promise<MenuOptionEndpointEntity[]>;
}
