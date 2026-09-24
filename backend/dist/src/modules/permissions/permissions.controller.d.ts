import { PermissionEntity } from '../../entities/permission.entity';
import { PermissionsService } from './permissions.service';
export declare class PermissionsController {
    private readonly permissionsService;
    constructor(permissionsService: PermissionsService);
    findAll(): Promise<PermissionEntity[]>;
}
