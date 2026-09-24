import { DataSource, Repository } from 'typeorm';
import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { PermissionEntity } from '../../entities/permission.entity';
import { MenuOptionRoleEntity } from '../menus/entities/menu-option-role.entity';
import { MenuOptionEntity } from '../menus/entities/menu-option.entity';
import { AuthContext } from '../../common/authz/subject-scope';
import { AuthService } from '../auth/auth.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleStatsDto } from './dto/role-stats.dto';
export declare class RolesService {
    private readonly roleRepo;
    private readonly userRepo;
    private readonly permissionRepo;
    private readonly menuRoleRepo;
    private readonly menuOptionRepo;
    private readonly dataSource;
    private readonly authService;
    constructor(roleRepo: Repository<RoleEntity>, userRepo: Repository<UserEntity>, permissionRepo: Repository<PermissionEntity>, menuRoleRepo: Repository<MenuOptionRoleEntity>, menuOptionRepo: Repository<MenuOptionEntity>, dataSource: DataSource, authService: AuthService);
    listPermissions(roleId: string): Promise<string[]>;
    getMenuAccessByRole(roleId: string): Promise<Array<{
        menuOptionId: string;
        name: string;
        canRead: boolean;
        canWrite: boolean;
    }>>;
    assignRole(actor: AuthContext, userId: string, roleId: string): Promise<UserEntity>;
    findAll(): Promise<RoleEntity[]>;
    findOne(id: string): Promise<RoleEntity>;
    getStats(): Promise<RoleStatsDto>;
    create(dto: CreateRoleDto): Promise<RoleEntity>;
    update(id: string, dto: UpdateRoleDto): Promise<RoleEntity>;
    delete(id: string): Promise<void>;
    recalculateEffectivePermissions(id: string): Promise<RoleEntity>;
    syncPermissions(id: string, permissions: string[]): Promise<RoleEntity>;
    private assertRevealOnlyForMaster;
    private assertSeededNameNotRenamed;
}
