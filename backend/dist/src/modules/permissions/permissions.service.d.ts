import { Repository } from 'typeorm';
import { PermissionEntity } from '../../entities/permission.entity';
export declare class PermissionsService {
    private readonly permissionRepo;
    constructor(permissionRepo: Repository<PermissionEntity>);
    findAll(): Promise<PermissionEntity[]>;
}
