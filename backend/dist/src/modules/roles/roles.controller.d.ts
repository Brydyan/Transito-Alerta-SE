import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleStatsDto } from './dto/role-stats.dto';
import { SyncPermissionsDto } from './dto/sync-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';
export declare class RolesController {
    private readonly rolesService;
    constructor(rolesService: RolesService);
    listPermissions(id: string): Promise<string[]>;
    getMenuAccess(id: string): Promise<Array<{
        menuOptionId: string;
        name: string;
        canRead: boolean;
        canWrite: boolean;
    }>>;
    assign(id: string, dto: AssignRoleDto, req: AuthenticatedRequest): Promise<UserEntity>;
    findAll(): Promise<RoleEntity[]>;
    getStats(): Promise<RoleStatsDto>;
    findOne(id: string): Promise<RoleEntity>;
    create(dto: CreateRoleDto): Promise<RoleEntity>;
    update(id: string, dto: UpdateRoleDto): Promise<RoleEntity>;
    delete(id: string): Promise<void>;
    syncPermissions(id: string, dto: SyncPermissionsDto): Promise<RoleEntity>;
    recalculatePermissions(id: string): Promise<RoleEntity>;
}
