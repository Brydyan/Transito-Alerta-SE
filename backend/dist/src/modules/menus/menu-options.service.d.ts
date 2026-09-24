import { Repository } from 'typeorm';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { ApiEndpointEntity } from './entities/api-endpoint.entity';
import { MenuOptionEndpointEntity } from './entities/menu-option-endpoint.entity';
import { RoleEntity } from '../../entities/role.entity';
import { MenusService } from './menus.service';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { SetRoleAccessDto } from './dto/set-role-access.dto';
import { AssignEndpointsDto } from './dto/assign-endpoints.dto';
export interface RoleMatrixEntry {
    roleId: string;
    roleName: string;
    canRead: boolean;
    canWrite: boolean;
}
export interface RoleMatrix {
    platform: RoleMatrixEntry[];
    organization: RoleMatrixEntry[];
    public: RoleMatrixEntry[];
}
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}
export declare class MenuOptionsService {
    private readonly optionRepo;
    private readonly roleAccessRepo;
    private readonly endpointRepo;
    private readonly optionEndpointRepo;
    private readonly roleRepo;
    private readonly menusService;
    private static readonly NAME_TO_API_MODULE;
    constructor(optionRepo: Repository<MenuOptionEntity>, roleAccessRepo: Repository<MenuOptionRoleEntity>, endpointRepo: Repository<ApiEndpointEntity>, optionEndpointRepo: Repository<MenuOptionEndpointEntity>, roleRepo: Repository<RoleEntity>, menusService: MenusService);
    findAll(): Promise<MenuOptionEntity[]>;
    findOne(id: string): Promise<MenuOptionEntity>;
    create(dto: CreateMenuOptionDto): Promise<MenuOptionEntity>;
    update(id: string, dto: UpdateMenuOptionDto): Promise<MenuOptionEntity>;
    delete(id: string): Promise<void>;
    getRoleMatrix(optionId: string): Promise<RoleMatrix>;
    setRoleAccess(optionId: string, roleId: string, dto: SetRoleAccessDto): Promise<MenuOptionRoleEntity>;
    assignEndpoints(optionId: string, dto: AssignEndpointsDto): Promise<MenuOptionEndpointEntity[]>;
    getEndpointCatalog(query?: {
        page?: number;
        limit?: number;
        route?: string;
        method?: string;
        description?: string;
        module?: string;
    }): Promise<PaginatedResult<ApiEndpointEntity>>;
    getAssignedEndpoints(optionId: string): Promise<ApiEndpointEntity[]>;
    private queryAssignedFromJunction;
    private inferApiModule;
    private queryEndpointsInModule;
    private assertRouteUnique;
    private assertValidParent;
}
