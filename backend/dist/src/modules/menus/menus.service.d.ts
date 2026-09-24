import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { UserEntity } from '../../entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { MenuEntry } from './menu-map';
export declare class MenusService {
    private readonly optionRepo;
    private readonly roleAccessRepo;
    private readonly userRepo;
    private readonly redis;
    private readonly authService;
    private readonly permissionLookup;
    private static readonly CACHE_PREFIX;
    private static readonly CACHE_TTL_SECONDS;
    private readonly logger;
    private static readonly ROUTE_TO_PERMISSION;
    constructor(optionRepo: Repository<MenuOptionEntity>, roleAccessRepo: Repository<MenuOptionRoleEntity>, userRepo: Repository<UserEntity>, redis: Redis, authService: AuthService, permissionLookup: PermissionLookupService);
    getMenuForUser(userId: string): Promise<MenuEntry[]>;
    invalidateCache(): Promise<void>;
    private getAccessibleOptions;
    private buildTree;
}
